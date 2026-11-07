import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup, renameContainer, setSectionColor, setContainerInactive, setPagesInactive } from '../src/main/storage/section'
import { createPage, deletePage, renamePage } from '../src/main/storage/page'
import { movePage, copyPage, copyContainer, recycleContainer } from '../src/main/storage/copymove'
import { listRecycled, restoreRecycled } from '../src/main/storage/recycle'
import { arrangeContainers, arrangePages } from '../src/main/storage/arrange'
import { collectPages } from '../src/main/export'
import { SearchIndex } from '../src/main/search/index'
import { treeFromIndex, applyTreeToIndex, refreshSection, refreshContainer } from '../src/main/search/tree'
import { tempDir, removeDir } from './helpers'
import type { NotebookTree, SectionMeta, GroupMeta, SectionNode } from '../src/shared/types'

let dir: string
let root: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
})
afterEach(async () => {
  await removeDir(dir)
})

const readMeta = async <T>(rel: string, file: string): Promise<T> => JSON.parse(await fs.readFile(join(root, rel, file), 'utf8')) as T

/** Tabs and pages as shown, with inactive ones marked by a ~. */
function shape(t: NotebookTree): string {
  const walk = (c: NotebookTree['children']): string =>
    c.map((x) => `${x.inactive ? '~' : ''}${x.kind === 'group' ? `${x.name}[${walk(x.children)}]` : `${x.name}(${x.pages.map((p) => `${p.inactive ? '~' : ''}${p.title}`).join(',')})`}`).join(' ')
  return walk(t.children)
}

describe('the order things are shown in', () => {
  it('sections and groups: one A to Z list, numbers in number order, capitals ignored, inactive ones last', () => {
    const items = [
      { name: 'Section 10', folder: 'Section 10' },
      { name: 'beta', folder: 'beta' },
      { name: 'Alpha', folder: 'Alpha', inactive: true },
      { name: 'Section 2', folder: 'Section 2' },
      { name: 'alpha', folder: 'alpha (2)' },
      { name: 'Zulu', folder: 'Zulu', inactive: true }
    ]
    expect(arrangeContainers(items, (i) => i).map((i) => i.folder)).toEqual(['alpha (2)', 'beta', 'Section 2', 'Section 10', 'Alpha', 'Zulu'])
    // Equal names go by folder name, the same on every computer.
    const twins = [
      { name: 'North field', folder: 'north FIELD' },
      { name: 'north FIELD', folder: 'North field' }
    ]
    expect(arrangeContainers(twins, (i) => i).map((i) => i.folder)).toEqual(['North field', 'north FIELD'])
  })

  it('pages: their section order, unlisted ones after by folder name, inactive ones moved to the end in order', () => {
    const pages = ['c.page', 'a.page', 'z.page', 'b.page', 'y.page']
    const inactive = new Set(['a.page', 'y.page'])
    expect(arrangePages(pages, ['c.page', 'a.page', 'b.page'], (p) => p, (p) => inactive.has(p))).toEqual(['c.page', 'b.page', 'z.page', 'a.page', 'y.page'])
  })
})

describe('inactive sections, groups, and pages', () => {
  it('are kept in their own metadata, shown last, and read the same from a scan and from the index', async () => {
    const work = await createSection(root, '', 'Work')
    const archive = await createSection(root, '', 'Archive')
    const g = await createGroup(root, '', 'Projects')
    await createSection(root, g, 'Barn')
    await createSection(root, g, 'Apiary')
    const one = await createPage(root, work, 'One')
    const two = await createPage(root, work, 'Two')
    await createPage(root, work, 'Three')
    expect(shape(await openNotebook(root))).toBe('Archive() Projects[Apiary() Barn()] Work(One,Two,Three)')

    await setContainerInactive(root, archive, true)
    await setContainerInactive(root, `${g}/Apiary`, true)
    await setPagesInactive(root, work, [one.doc.id], true)
    const scanned = await openNotebook(root)
    expect(shape(scanned)).toBe('Projects[Barn() ~Apiary()] Work(Two,Three,~One) ~Archive()')

    // The index draws the same tree, and follows later changes.
    const index = new SearchIndex(root)
    await index.open()
    applyTreeToIndex(index, scanned)
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toBe(shape(scanned))
    await setContainerInactive(root, archive, false)
    await setContainerInactive(root, g, true)
    await refreshContainer(index, root, '')
    await setPagesInactive(root, work, [two.doc.id], true)
    await refreshSection(index, root, work)
    const expected = 'Archive() Work(Three,~One,~Two) ~Projects[Barn() ~Apiary()]'
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toBe(expected)
    expect(shape(await openNotebook(root))).toBe(expected)
    // A later save of a page (which re-indexes it) leaves the marks as they are.
    index.indexPage(one.relPath, one.doc, { name: 'Work', rel: work }, 1)
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toBe(expected)
    index.close()
  })

  it('marking active again leaves the files as they were', async () => {
    const work = await createSection(root, '', 'Work')
    const g = await createGroup(root, '', 'Projects')
    const page = await createPage(root, work, 'One')
    const section = await fs.readFile(join(root, work, 'section.json'), 'utf8')
    const group = await fs.readFile(join(root, g, 'group.json'), 'utf8')
    await setContainerInactive(root, work, true)
    await setContainerInactive(root, g, true)
    await setPagesInactive(root, work, [page.doc.id], true)
    expect(await readMeta<SectionMeta>(work, 'section.json')).toMatchObject({ inactive: true, inactivePages: [page.doc.id] })
    expect((await readMeta<GroupMeta>(g, 'group.json')).inactive).toBe(true)
    await setContainerInactive(root, work, false)
    await setContainerInactive(root, g, false)
    await setPagesInactive(root, work, [page.doc.id], false)
    expect(await fs.readFile(join(root, work, 'section.json'), 'utf8')).toBe(section)
    expect(await fs.readFile(join(root, g, 'group.json'), 'utf8')).toBe(group)
    // The page itself is never touched.
    expect((await openNotebook(root)).children.find((c) => c.name === 'Work')).toMatchObject({ pages: [{ title: 'One', modified: page.doc.modified }] })
  })

  it('survive the edits 1.2.4 makes to the same files', async () => {
    const work = await createSection(root, '', 'Work')
    const g = await createGroup(root, '', 'Projects')
    const page = await createPage(root, work, 'One')
    await setContainerInactive(root, work, true)
    await setContainerInactive(root, g, true)
    await setPagesInactive(root, work, [page.doc.id], true)
    // Code unchanged since 1.2.4: adding, renaming, and deleting pages; colour; renaming the containers.
    const other = await createPage(root, work, 'Two')
    await renamePage(root, other.relPath, 'Second')
    await deletePage(root, `${work}/Second.page`)
    await setSectionColor(root, work, '#000000')
    const renamedWork = await renameContainer(root, work, 'Work log')
    const renamedGroup = await renameContainer(root, g, 'Old projects')
    expect(await readMeta<SectionMeta>(renamedWork, 'section.json')).toMatchObject({ inactive: true, inactivePages: [page.doc.id], color: '#000000' })
    expect((await readMeta<GroupMeta>(renamedGroup, 'group.json')).inactive).toBe(true)
  })

  it('a moved page stays inactive in its new section; a copy starts active; a copied section keeps its pages marked', async () => {
    const work = await createSection(root, '', 'Work')
    const done = await createSection(root, '', 'Done')
    const one = await createPage(root, work, 'One')
    const two = await createPage(root, work, 'Two')
    await setPagesInactive(root, work, [one.doc.id, two.doc.id], true)
    const moved = await movePage(root, one.relPath, done)
    expect((await readMeta<SectionMeta>(work, 'section.json')).inactivePages).toEqual([two.doc.id])
    expect((await readMeta<SectionMeta>(done, 'section.json')).inactivePages).toEqual([one.doc.id])
    await copyPage(root, moved, done)
    expect(shape(await openNotebook(root))).toBe('Done(One,~One) Work(~Two)')
    const copy = await copyContainer(root, work, '')
    const copied = (await openNotebook(root)).children.find((c) => c.relPath === copy) as SectionNode
    expect(copied.pages.map((p) => [p.title, !!p.inactive])).toEqual([['Two', true]])
    expect(copied.pages[0]!.id).not.toBe(two.doc.id)
    expect((await readMeta<SectionMeta>(copy, 'section.json')).inactivePages).toEqual([copied.pages[0]!.id])
  })

  it('an active page moved into a section that still lists its ID from before stays active', async () => {
    const a = await createSection(root, '', 'A')
    const c = await createSection(root, '', 'C')
    const page = await createPage(root, a, 'P')
    await setPagesInactive(root, a, [page.doc.id], true)
    // Moved out and made active, as 1.2.4 would leave it: A still lists the page.
    const inC = await movePage(root, page.relPath, c)
    await setPagesInactive(root, c, [page.doc.id], false)
    await setPagesInactive(root, a, [page.doc.id], true)
    expect(shape(await openNotebook(root))).toBe('A() C(P)')
    await movePage(root, inC, a)
    expect(shape(await openNotebook(root))).toBe('A(P) C()')
    expect((await readMeta<SectionMeta>(a, 'section.json')).inactivePages).toBeUndefined()
  })

  it('export and print take pages in the order shown', async () => {
    const work = await createSection(root, '', 'Work')
    const archive = await createSection(root, '', 'Archive')
    await createPage(root, archive, 'Old note')
    const one = await createPage(root, work, 'One')
    await createPage(root, work, 'Two')
    await setPagesInactive(root, work, [one.doc.id], true)
    expect((await collectPages(root)).map((p) => p.title)).toEqual(['Old note', 'Two', 'One'])
    await setContainerInactive(root, archive, true)
    expect((await collectPages(root)).map((p) => p.title)).toEqual(['Two', 'One', 'Old note'])
  })
})

describe('restoring from the recycle folder', () => {
  it('a section comes back as a section, inactive mark and all', async () => {
    const work = await createSection(root, '', 'Work')
    await createPage(root, work, 'One')
    await setContainerInactive(root, work, true)
    await recycleContainer(root, work)
    const [entry] = await listRecycled(root)
    const rel = await restoreRecycled(root, entry!.name, '')
    expect(rel).toBe('Work')
    expect((await fs.readdir(join(root, rel))).sort()).toEqual(['One.page', 'section.json'])
    expect(shape(await openNotebook(root))).toBe('~Work(One)')
  })

  it('a page whose section is gone needs a section to go to', async () => {
    const work = await createSection(root, '', 'Work')
    const page = await createPage(root, work, 'One')
    await deletePage(root, page.relPath)
    await recycleContainer(root, work)
    const name = (await listRecycled(root)).find((r) => r.kind === 'page')!.name
    await expect(restoreRecycled(root, name, '')).rejects.toThrow('Create a section first')
    expect((await fs.readdir(root)).filter((n) => n.endsWith('.page'))).toEqual([])
    const home = await createSection(root, '', 'Home')
    expect(basename(await restoreRecycled(root, name, home))).toBe('One.page')
  })
})
