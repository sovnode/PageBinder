import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage, loadPage, renamePage, listHistory, restoreSnapshot, readSnapshot } from '../src/main/storage/page'
import { copyPage } from '../src/main/storage/copymove'
import { ensureTemplatesNotebook, saveAsTemplate, createPageFromTemplate } from '../src/main/storage/templates'
import { resolveInside } from '../src/main/storage/paths'
import { firstLineOf, titleSourceOf, withTitleFromText, TITLE_FROM_TEXT_MAX } from '../src/shared/pageTitle'
import { tempDir, removeDir } from './helpers'
import type { CanvasObject, EditorJSON, PageDoc, TextContainer } from '../src/shared/types'

const para = (...parts: (string | 'BR')[]): EditorJSON => ({ type: 'paragraph', content: parts.map((p) => (p === 'BR' ? { type: 'hardBreak' } : { type: 'text', text: p })) })
const docOf = (...blocks: EditorJSON[]): EditorJSON => ({ type: 'doc', content: blocks })
const box = (id: string, x: number, y: number, content: EditorJSON): TextContainer => ({ kind: 'text', id, x, y, width: 400, content })

describe('the first line of text', () => {
  it('is the first paragraph with text, up to a line break, on one line', () => {
    expect(firstLineOf(docOf(para('Site visit'), para('Second line')))).toBe('Site visit')
    expect(firstLineOf(docOf({ type: 'paragraph' }, para('   '), para('  North   field  ')))).toBe('North field')
    expect(firstLineOf(docOf(para('Visit report', 'BR', 'Date: today')))).toBe('Visit report')
    expect(firstLineOf(docOf(para('BR', 'After a break')))).toBe('After a break')
    expect(firstLineOf(docOf(para('Bold ', 'and plain')))).toBe('Bold and plain')
    const table: EditorJSON = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('In a cell')] }] }] }
    expect(firstLineOf(docOf(table, para('Below')))).toBe('In a cell')
    expect(firstLineOf(docOf({ type: 'paragraph' }))).toBe('')
    expect(firstLineOf(docOf(para('x'.repeat(250)))).length).toBe(TITLE_FROM_TEXT_MAX)
  })

  it('comes from the topmost text box that has text', () => {
    const objects: CanvasObject[] = [box('low', 96, 400, docOf(para('Lower'))), box('empty', 96, 50, docOf({ type: 'paragraph' })), box('top', 300, 96, docOf(para('Top line')))]
    expect(titleSourceOf(objects)).toEqual({ id: 'top', line: 'Top line' })
    expect(titleSourceOf([box('e', 0, 0, docOf({ type: 'paragraph' }))])).toBeNull()
  })

  it('names a page that follows it, and leaves the name while the line is empty or its box is gone', () => {
    const page = { title: 'Old', titleSource: 'b1', objects: [box('b1', 0, 0, docOf(para('New wording')))] } as unknown as PageDoc
    expect(withTitleFromText(page).title).toBe('New wording')
    expect(withTitleFromText({ ...page, objects: [box('b1', 0, 0, docOf({ type: 'paragraph' }))] }).title).toBe('Old')
    expect(withTitleFromText({ ...page, objects: [] }).title).toBe('Old')
    expect(withTitleFromText({ ...page, titleSource: undefined }).title).toBe('Old')
  })
})

describe('pages named after their first line of text', () => {
  let dir: string
  let root: string
  let tdir: string
  let sec: string
  beforeEach(async () => {
    dir = await tempDir()
    root = await createNotebook(dir, 'nb')
    sec = await createSection(root, '', 'Visits')
    tdir = join(dir, 'Templates notebook')
    await ensureTemplatesNotebook(tdir)
  })
  afterEach(async () => {
    await removeDir(dir)
  })

  /** A template whose first text box starts with `firstLine`. */
  async function template(name: string, firstLine: string | null): Promise<string> {
    const { relPath, doc } = await createPage(root, sec, 'source')
    const objects: CanvasObject[] = firstLine === null ? [] : [box('t1', 96, 96, docOf(para(firstLine), para('Notes:')))]
    await savePage(root, relPath, { ...doc, objects })
    return resolveInside(tdir, await saveAsTemplate(root, relPath, tdir, 'General', name))
  }

  it('a page made from a template is named after its first line, placeholders filled, and follows it', async () => {
    const t = await template('Visit form', 'Visit to {{section}}')
    const made = await createPageFromTemplate(root, sec, t, 'Visit form', { section: 'Visits', notebook: 'nb' }, undefined, undefined, { nameFromText: true })
    expect(made.doc.title).toBe('Visit to Visits')
    expect(made.relPath).toBe(`${sec}/Visit to Visits.page`)
    const source = made.doc.objects.find((o) => o.id === made.doc.titleSource)
    expect(source?.kind).toBe('text')
    // Editing the line renames the page when it is saved, folder and all.
    const edited = withTitleFromText({ ...made.doc, objects: made.doc.objects.map((o) => (o.id === made.doc.titleSource ? { ...o, content: docOf(para('Ridge Road visit')) } : o)) as CanvasObject[] })
    const saved = await savePage(root, made.relPath, edited)
    expect(saved.doc.title).toBe('Ridge Road visit')
    expect(saved.relPath).toBe(`${sec}/Ridge Road visit.page`)
    // Without the option (a name was given), the page keeps that name and does not follow its text.
    const named = await createPageFromTemplate(root, sec, t, 'Chosen name', { section: 'Visits', notebook: 'nb' })
    expect(named.doc.title).toBe('Chosen name')
    expect(named.doc.titleSource).toBeUndefined()
  })

  it('a template with no text gives the template name and nothing to follow', async () => {
    const t = await template('Picture form', null)
    const made = await createPageFromTemplate(root, sec, t, 'Picture form', { section: 'Visits', notebook: 'nb' }, undefined, undefined, { nameFromText: true })
    expect(made.doc.title).toBe('Picture form')
    expect(made.doc.titleSource).toBeUndefined()
  })

  it('renaming by hand ends the link for good, even when an older version is restored', async () => {
    const t = await template('Visit form', 'Visit report')
    const made = await createPageFromTemplate(root, sec, t, 'Visit form', { section: 'Visits', notebook: 'nb' }, undefined, undefined, { nameFromText: true })
    const renamed = await renamePage(root, made.relPath, 'My own name')
    expect(renamed.doc.title).toBe('My own name')
    expect(renamed.doc.titleSource).toBeUndefined()
    const versions = await listHistory(root, renamed.relPath)
    expect(versions.length).toBeGreaterThan(0)
    const restored = await restoreSnapshot(root, renamed.relPath, versions[versions.length - 1]!.name)
    expect(restored.doc.titleSource).toBeUndefined()
  })

  it('restoring an older version of a page that follows its text takes that version’s line as the name', async () => {
    const t = await template('Visit form', 'First wording')
    const made = await createPageFromTemplate(root, sec, t, 'Visit form', { section: 'Visits', notebook: 'nb' }, undefined, undefined, { nameFromText: true })
    const edited = withTitleFromText({ ...made.doc, objects: made.doc.objects.map((o) => (o.id === made.doc.titleSource ? { ...o, content: docOf(para('Second wording')) } : o)) as CanvasObject[] })
    const saved = await savePage(root, made.relPath, edited)
    expect(saved.doc.title).toBe('Second wording')
    // The saved version whose text still has the first wording (not the blank one before it).
    let first: string | undefined
    for (const v of await listHistory(root, saved.relPath)) {
      const snap = await readSnapshot(root, saved.relPath, v.name)
      if (snap && JSON.stringify(snap.objects).includes('First wording')) first = v.name
    }
    expect(first).toBeDefined()
    const restored = await restoreSnapshot(root, saved.relPath, first!)
    expect(restored.doc.titleSource).toBe(made.doc.titleSource)
    expect(restored.doc.title).toBe('First wording')
  })

  it('a copy of the page, and a template saved from it, keep their names fixed', async () => {
    const t = await template('Visit form', 'Visit report')
    const made = await createPageFromTemplate(root, sec, t, 'Visit form', { section: 'Visits', notebook: 'nb' }, undefined, undefined, { nameFromText: true })
    const other = await createSection(root, '', 'Other')
    const copyRel = await copyPage(root, made.relPath, other)
    expect(((await loadPage(root, copyRel)).doc as PageDoc).titleSource).toBeUndefined()
    const asTemplate = await saveAsTemplate(root, made.relPath, tdir, 'General', 'From a visit')
    expect((await loadPage(tdir, asTemplate)).doc.titleSource).toBeUndefined()
    expect(JSON.parse(await fs.readFile(join(root, made.relPath, 'page.json'), 'utf8')).titleSource).toBe(made.doc.titleSource)
  })
})
