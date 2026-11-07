/**
 * Export pages as one PDF, one linked HTML file (the command-line script), or a web-page package
 * (File > Export Notebook > Web page): one zip holding the HTML with every picture and attachment,
 * linked inside the zip, for people without PageBinder.
 */
import { promises as fs, createReadStream, createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import { renameDurable } from './storage/atomic'
import { join, resolve, basename, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { readValidPage, writeRendered } from './storage/page'
import { readJson } from './storage/notebook'
import { renderPageHtml } from '../shared/render/renderPage'
import { atomicWriteFile } from './storage/atomic'
import { arrangeContainers, arrangePages } from './storage/arrange'
import type { PageDoc, SectionMeta, GroupMeta } from '../shared/types'

export interface ExportedPage {
  dir: string
  title: string
  doc: PageDoc
}

/** The folders inside `dir` in the order PageBinder shows them (arrange.ts): pages in a section, else sections and groups. */
async function shownOrder(dir: string, names: string[]): Promise<string[]> {
  const section = await readJson<SectionMeta>(join(dir, 'section.json'))
  if (section) {
    const inactive = new Set(Array.isArray(section.inactivePages) ? section.inactivePages : [])
    const ids = new Map(await Promise.all(names.map(async (n) => [n, (await readJson<{ id?: unknown }>(join(dir, n, 'page.json')))?.id] as const)))
    return arrangePages(names, Array.isArray(section.pageOrder) ? section.pageOrder : [], (n) => n, (n) => { const id = ids.get(n); return typeof id === 'string' && inactive.has(id) })
  }
  const metas = new Map(await Promise.all(names.map(async (n) => [n, (await readJson<SectionMeta>(join(dir, n, 'section.json'))) ?? (await readJson<GroupMeta>(join(dir, n, 'group.json')))] as const)))
  return arrangeContainers(names, (n) => ({ name: metas.get(n)?.name ?? n, folder: n, inactive: !!metas.get(n)?.inactive }))
}

/** Regenerate page.html for every page under `dir` (notebook, group, section, or page) and return the pages in notebook order. */
export async function collectPages(dir: string, log: (s: string) => void = () => {}): Promise<ExportedPage[]> {
  const out: ExportedPage[] = []
  const walk = async (d: string): Promise<void> => {
    if (d.endsWith('.page')) {
      const doc = await readValidPage(join(d, 'page.json'))
      if (!doc) {
        log(`skipped (damaged): ${d}`)
        return
      }
      await writeRendered(d, doc)
      out.push({ dir: d, title: doc.title, doc })
      return
    }
    const entries = (await fs.readdir(d, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'templates').map((e) => e.name)
    for (const name of await shownOrder(d, entries)) await walk(join(d, name))
  }
  await walk(dir)
  return out
}

/**
 * One HTML document holding every page. Image and attachment links are relative
 * to `root`, so the file is placed in (or next to) the notebook to keep them working;
 * with `absoluteLinks`, file:// links are used so the file works anywhere on this machine.
 */
export function combineHtml(pages: ExportedPage[], root: string, absoluteLinks = false, prefix = ''): string {
  const parts = pages.map((p) => {
    const relDir = p.dir.slice(root.length + 1).split(/[\\/]/).map(encodeURIComponent).join('/')
    // pathToFileURL writes a drive letter as file:///C:/... on Windows; building the URL by hand did not.
    const base = absoluteLinks ? `${pathToFileURL(p.dir).href}/` : `${prefix}${relDir}/`
    const html = renderPageHtml(p.doc, { imageBase: `${base}images/`, attachmentBase: `${base}attachments/` })
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? ''
    const bodyAttrs = /<body([^>]*)>/.exec(html)?.[1] ?? ''
    return `<section class="page-export" data-title="${p.title.replace(/"/g, '&quot;')}"><div${bodyAttrs.replace(/class="[^"]*"/, 'class="unpaginated page-body"')}>${body.replace(/<script>[\s\S]*?<\/script>/, '')}</div></section>`
  })
  const first = pages[0] ? renderPageHtml(pages[0].doc) : renderPageHtml({ format: 1, id: '', title: '', created: '', modified: '', tags: [], paper: { size: 'letter', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 } }, objects: [], manifest: { images: [], attachments: [] }, checksum: '' })
  const head = (/<head>([\s\S]*)<\/head>/.exec(first)?.[1] ?? '').replace(/<title>[\s\S]*?<\/title>/, `<title>${basename(root).replace(/</g, '&lt;')}</title>`)
  const script = /<script>([\s\S]*?)<\/script>/.exec(first)?.[1] ?? ''
  const perPage = script
    .replace('document.body', 'body')
    .replace("var source = document.getElementById('canvas');", "var source = body.querySelector('#canvas');")
    .replace("var host = document.getElementById('sheets');", "var host = body.querySelector('#sheets');")
    .replace(/\(function \(\) \{/, '')
    .replace(/\}\)\(\);\s*$/, '')
  return `<!doctype html><html><head>${head}<style>.page-export{margin:0 0 24px} .page-body .chrome{display:none} @media print{.page-export{margin:0} .page-body .sheet{break-after:page} .page-export:last-child .page-body .sheet:last-child{break-after:auto}}</style></head><body>
${parts.join('\n')}
<script>
document.querySelectorAll('.page-body').forEach(function (body) { ${perPage} });
</script></body></html>`
}

export async function exportHtml(targetDir: string, outPath: string, log?: (s: string) => void): Promise<number> {
  const pages = await collectPages(targetDir, log)
  const root = targetDir.endsWith('.page') ? resolve(targetDir, '..') : targetDir
  const back = relative(root, resolve(outPath))
  const inside = !back.startsWith('..') && !isAbsolute(back)
  await atomicWriteFile(outPath, combineHtml(pages, root, !inside))
  return pages.length
}

/** Folder inside the package that holds every page's pictures and attachments. */
const PACKAGE_FILES = 'files'

/**
 * A web-page package: one zip with a folder named `name` holding `name.html` (every page, in
 * notebook order) and a `files` folder with each page's pictures and attachments, which the HTML
 * links to by relative paths. Unzipped anywhere, it opens in any browser without PageBinder.
 */
export async function exportHtmlPackage(targetDir: string, outPath: string, name: string): Promise<number> {
  const pages = await collectPages(targetDir)
  const root = targetDir.endsWith('.page') ? resolve(targetDir, '..') : targetDir
  const folder = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'export'
  const html = combineHtml(pages, root, false, `${PACKAGE_FILES}/`)
  const tmp = `${outPath}.partial`
  const out = createWriteStream(tmp)
  let failed: Error | null = null
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      failed = err
      return
    }
    out.write(chunk)
    if (final) out.end()
  })
  const page = new ZipDeflate(`${folder}/${folder}.html`, { level: 6 })
  zip.add(page)
  page.push(strToU8(html), true)
  // Pictures and attachments are stored as they are (most are compressed already).
  for (const p of pages) {
    const relDir = p.dir.slice(root.length + 1).split(/[\\/]/).join('/')
    for (const sub of ['images', 'attachments']) {
      let names: string[] = []
      try {
        names = (await fs.readdir(join(p.dir, sub), { withFileTypes: true })).filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name)
      } catch {
        continue
      }
      for (const n of names) {
        const entry = new ZipPassThrough(`${folder}/${PACKAGE_FILES}/${relDir}/${sub}/${n}`)
        zip.add(entry)
        for await (const chunk of createReadStream(join(p.dir, sub, n))) {
          entry.push(chunk as Uint8Array)
          if (out.writableNeedDrain) await once(out, 'drain')
        }
        entry.push(new Uint8Array(0), true)
      }
    }
  }
  zip.end()
  if (!out.writableFinished) await once(out, 'finish')
  if (failed) throw failed
  await renameDurable(tmp, outPath)
  return pages.length
}

/** Write the combined HTML to a temporary file for a PDF renderer to load. */
export async function stageForPdf(targetDir: string): Promise<{ htmlPath: string; count: number; cleanup: () => Promise<void> }> {
  const pages = await collectPages(targetDir)
  const root = targetDir.endsWith('.page') ? resolve(targetDir, '..') : targetDir
  const dir = await fs.mkdtemp(join(tmpdir(), 'pagebinder-export-'))
  const htmlPath = join(dir, 'export.html')
  await fs.writeFile(htmlPath, combineHtml(pages, root, true))
  return { htmlPath, count: pages.length, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
}
