/**
 * End-to-end check of phase 1 through the real Electron window.
 *   npm run e2e
 */
import { _electron as electron, type Page, type ElectronApplication } from 'playwright'
import { useApp, saveViaMenu } from './e2e-save'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import { verifyChecksum } from '../src/main/storage/checksum'
import type { PageDoc, TextContainer } from '../src/shared/types'

async function newBox(page: Page, x: number, y: number): Promise<void> {
  await page.locator('.canvas').click({ button: 'right', position: { x, y } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  // The new box takes focus a moment after it appears.
  await page.waitForTimeout(250)
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}

async function readDoc(path: string): Promise<PageDoc> {
  return JSON.parse(await fs.readFile(path, 'utf8')) as PageDoc
}

async function launch(root: string): Promise<{ app: ElectronApplication; page: Page; close: () => Promise<void> }> {
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  const page = await app.firstWindow()
  useApp(app)
  await page.waitForSelector('.section-tabs')
  return { app, page, close: () => app.close() }
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'E2E notebook')
  const notes = await createSection(root, '', 'Notes', '#D85A30')
  const first = await createPage(root, notes, 'First page')
  const shots = process.env['E2E_SHOTS'] ?? base
  await fs.mkdir(shots, { recursive: true })
  const steps: string[] = []
  const step = (s: string): void => {
    steps.push(s)
    process.stdout.write(`  ✓ ${s}\n`)
  }

  let { app, page, close } = await launch(root)

  // 1. Notebook opened, section and page visible.
  assert(await page.locator('.tab.on', { hasText: 'Notes' }).count(), 'Notes section tab is active')
  assert(await page.locator('.page-row.on', { hasText: 'First page' }).count(), 'first page opened')
  step('opens the notebook on its first section and page')

  // 2. Type into the default container, wait for the draft.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.type('Hello from the e2e test.')
  await page.waitForTimeout(2500)
  const draftPath = join(root, first.relPath, 'page.json.autosave')
  assert(await fs.stat(draftPath).then(() => true, () => false), 'autosave draft written after typing')
  step('writes an autosave draft after typing')

  // 3. File > Save (Cmd/Ctrl+S) saves, snapshot appears, draft removed, checksum valid. A test's key
  //    press cannot reach a menu shortcut, so the test saves through the menu's own command and
  //    checks that the menu item carries the Cmd/Ctrl+S shortcut.
  const saveShortcut = await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    return file?.submenu?.items.find((i) => i.label === 'Save')?.accelerator ?? null
  })
  assert(saveShortcut === 'CmdOrCtrl+S', `File > Save has the Cmd/Ctrl+S shortcut (${saveShortcut})`)
  // Export: one File menu item, Export Notebook (Cmd/Ctrl+Shift+E); PDFs of a single page come from Print Preview.
  const fileItems = await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    return (file?.submenu?.items ?? []).map((i) => ({ label: i.label, accelerator: i.accelerator ?? null }))
  })
  const exportItems = fileItems.filter((i) => /export/i.test(i.label))
  assert(exportItems.length === 1 && exportItems[0]!.label === 'Export Notebook…' && exportItems[0]!.accelerator === 'CmdOrCtrl+Shift+E', `the File menu has one export item, Export Notebook… (${JSON.stringify(exportItems)})`)
  await saveViaMenu(page)
  const saved = await readDoc(join(root, first.relPath, 'page.json'))
  assert(verifyChecksum(saved), 'saved page has a valid checksum')
  assert(JSON.stringify(saved.objects).includes('Hello from the e2e test.'), 'typed text is in page.json')
  const history = await fs.readdir(join(root, first.relPath, '.history'))
  assert(history.length === 1, `one history snapshot after first save (got ${history.length})`)
  assert(!(await fs.stat(draftPath).then(() => true, () => false)), 'draft removed after clean save')
  step('Cmd+S saves with a history snapshot and clears the draft')

  // 4. Formatting: bold via toolbar.
  await page.keyboard.press('Shift+Home')
  await page.locator('.tb.bold').click()
  await page.waitForTimeout(100)
  await saveViaMenu(page)
  const bolded = await readDoc(join(root, first.relPath, 'page.json'))
  assert(JSON.stringify(bolded.objects).includes('"type":"bold"'), 'bold mark saved')
  step('toolbar formatting is applied and saved')

  // 5. Click empty canvas to create a second container and type into it.
  await newBox(page, 560, 520)
  await page.waitForTimeout(200)
  await page.keyboard.type('Second container')
  await saveViaMenu(page)
  const two = await readDoc(join(root, first.relPath, 'page.json'))
  assert(two.objects.length === 2, `two containers on the page (got ${two.objects.length})`)
  assert(two.objects[1]!.x > 400, 'second container placed where clicked')
  step('clicking the canvas creates a movable text container')

  // 5b. A container placed below the first sheet makes a second sheet appear.
  await newBox(page, 200, 1150)
  await page.waitForTimeout(200)
  await page.keyboard.type('On the second sheet')
  await page.waitForTimeout(200)
  assert((await page.locator('.paper').count()) === 2, `two sheets drawn (got ${await page.locator('.paper').count()})`)
  assert(await page.locator('.page-number', { hasText: 'Page 2 of 2' }).count(), 'page number shown on the second sheet')
  step('content below the first sheet adds a second sheet outline')

  // 6. Rename the page from the page list; folder renames.
  await page.locator('.page-row.on').dblclick()
  await page.locator('.page-row.renaming input').fill('Renamed page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Renamed page")')
  await page.waitForTimeout(500)
  const folders = await fs.readdir(join(root, notes))
  assert(folders.includes('Renamed page.page'), `folder renamed (got ${folders.join(', ')})`)
  assert(await page.locator('.page-row.on', { hasText: 'Renamed page' }).count(), 'page list shows new title')
  step('changing the title renames the page folder')

  // 7. Add a page from the list, add a section from the + menu.
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Fresh page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Fresh page")')
  assert(await fs.stat(join(root, notes, 'Fresh page.page', 'page.json')).then(() => true, () => false), 'new page folder named from inline rename')
  step('Add page creates a page and names it inline')
  await page.locator('.tab.add').click()
  await page.locator('.context-item', { hasText: /^New section…$/ }).click()
  await page.locator('.dialog input').fill('Second section')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.tab.on:has-text("Second section")')
  assert(await fs.stat(join(root, 'Second section', 'section.json')).then(() => true, () => false), 'section folder created')
  step('New section is created from the + menu')

  // 8. Simulate an unsaved draft and a crash: corrupt page.json, leave a newer draft. The page is
  //    left open, so it is the one PageBinder reopens on the next start.
  await page.locator('.tab', { hasText: 'Notes' }).click()
  await page.locator('.page-row', { hasText: 'Renamed page' }).click()
  await page.waitForSelector('.page-row.on:has-text("Renamed page")')
  await close()
  const renamedRel = `${notes}/Renamed page.page`
  const docPath = join(root, renamedRel, 'page.json')
  const good = await readDoc(docPath)
  const draft: PageDoc = { ...good, modified: new Date(Date.now() + 1000).toISOString() }
  draft.objects = [{ ...(draft.objects[0] as TextContainer), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DRAFT TEXT' }] }] } }]
  const { withChecksum } = await import('../src/main/storage/checksum')
  await fs.writeFile(join(root, renamedRel, 'page.json.autosave'), JSON.stringify(withChecksum(draft)))
  const text = await fs.readFile(docPath, 'utf8')
  await fs.writeFile(docPath, text.slice(0, text.length / 2))
  ;({ app, page, close } = await launch(root))
  // The damaged page was the last one open, so it opens automatically.
  await page.waitForSelector('.notice.recovered-from-history')
  await page.waitForSelector('.notice.draft-available')
  // The newest snapshot predates the rename, so the recovered title is the older one.
  assert(await page.locator('.page-row.on', { hasText: 'First page' }).count(), 'recovered page shows the snapshot title')
  await page.screenshot({ path: join(shots, 'recovery.png') })
  step('a damaged page is recovered from history and the draft is offered')
  await page.locator('.notice.draft-available button.primary').click()
  // Wait for the restored draft to reach the file (the "saved" status may still be showing from before).
  for (let i = 0; i < 100 && !(await fs.readFile(docPath, 'utf8').catch(() => '')).includes('DRAFT TEXT'); i++) await page.waitForTimeout(100)
  await page.waitForSelector('.save-status.saved')
  const restored = await readDoc(docPath)
  assert(verifyChecksum(restored), 'restored page has a valid checksum')
  assert(JSON.stringify(restored.objects).includes('DRAFT TEXT'), 'draft content restored and saved')
  const leftovers = await fs.readdir(join(root, renamedRel))
  assert(leftovers.some((n) => n.startsWith('page.json.corrupt-')), 'damaged file kept for inspection')
  step('Restore writes the draft as the current page')

  // The page list shows the restored title once the save and its index update have finished.
  const titled = await page.locator('.page-row.on', { hasText: 'Renamed page' }).waitFor({ timeout: 5000 }).then(() => true, () => false)
  assert(titled, 'draft title restored')
  await page.screenshot({ path: join(shots, 'final.png') })
  await close()

  // 10. With more sections than fit, the + stays in view at the right end of the strip, above the
  //     tabs that scroll beneath it, and the open section's tab is brought into view beside it.
  const many = await createNotebook(base, 'Many sections')
  for (let i = 1; i <= 40; i++) await createSection(many, '', `Section number ${i}`)
  const group = await createGroup(many, '', 'Small group')
  await createSection(many, group, 'Inside one')
  await createSection(many, group, 'Inside two')
  ;({ app, page, close } = await launch(many))
  const strip = (): Promise<{ overflow: number; scrollLeft: number; left: number; right: number; add: { left: number; right: number; bottom: number }; addOnTop: boolean; covering: boolean; tabBottom: number; lastTabRight: number; on: { left: number; right: number; onTop: boolean } | null }> =>
    page.evaluate(() => {
      const el = document.querySelector('.section-tabs')!
      const add = el.querySelector('.tab.add')!.getBoundingClientRect()
      const tabs = Array.from(el.querySelectorAll('.tab:not(.add)'))
      const plain = tabs.find((t) => !t.classList.contains('on'))!.getBoundingClientRect()
      const on = el.querySelector('.tab.on')
      const o = on?.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return {
        overflow: el.scrollWidth - el.clientWidth,
        scrollLeft: el.scrollLeft,
        left: box.left,
        right: box.right,
        add: { left: add.left, right: add.right, bottom: add.bottom },
        addOnTop: document.elementFromPoint(add.left + add.width / 2, add.top + add.height / 2) === el.querySelector('.tab.add'),
        covering: !!el.querySelector('.tab-add-pin.covering'),
        tabBottom: plain.bottom,
        lastTabRight: tabs[tabs.length - 1]!.getBoundingClientRect().right,
        on: o && on ? { left: o.left, right: o.right, onTop: document.elementFromPoint(o.left + o.width / 2, o.top + o.height / 2) === on } : null
      }
    })
  let s = await strip()
  assert(s.overflow > 200 && s.scrollLeft === 0, `the tabs run past the window (${s.overflow} px more, scrolled ${s.scrollLeft})`)
  assert(s.add.left >= s.left && s.add.right <= s.right && s.addOnTop, `the + is in view at the start of the strip (${JSON.stringify(s)})`)
  assert(Math.abs(s.add.bottom - s.tabBottom) < 1.5, `the + lines up with the tabs (${s.add.bottom} and ${s.tabBottom})`)
  assert(s.covering, 'the + shows that tabs continue beneath it')
  await page.screenshot({ path: join(shots, 'many-sections.png') })
  // Clicked where the user sees it, the + opens its menu and leaves the tabs where they are.
  await page.mouse.click((s.add.left + s.add.right) / 2, s.add.bottom - 10)
  await page.waitForSelector('.context-menu')
  assert((await strip()).scrollLeft === 0, 'pressing the + leaves the tabs where they are')
  await page.locator('.context-item', { hasText: /^New section…$/ }).click()
  await page.locator('.dialog input').fill('Added at the end')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.tab.on:has-text("Added at the end")')
  s = await strip()
  assert(s.on && s.on.left >= s.left && s.on.right <= s.add.left && s.on.onTop, `the new section's tab is brought into view, clear of the + (${JSON.stringify(s)})`)
  assert(!s.covering && s.add.left - s.lastTabRight < 4, `at the end of the strip the + follows the last tab (${JSON.stringify(s)})`)
  step('with many sections the + stays in view, and a section added with it is shown')

  // Scrolled back to the start, the + is still there; the open tab comes back into view when the
  // notebook is opened again (on its last page, so the new section gets one).
  await page.locator('.page-row.add').click()
  await page.locator('.page-row.renaming input').fill('Last page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Last page")')
  await page.locator('.section-tabs').evaluate((el) => el.scrollTo(0, 0))
  await page.waitForSelector('.tab-add-pin.covering', { timeout: 5000 }).catch(() => undefined)
  s = await strip()
  assert(s.addOnTop && s.add.right <= s.right && s.covering, `the + stays at the right end when scrolled back (${JSON.stringify(s)})`)
  await close()
  ;({ app, page, close } = await launch(many))
  await page.waitForSelector('.tab.on:has-text("Added at the end")')
  s = await strip()
  assert(s.on && s.on.left >= s.left && s.on.right <= s.add.left && s.on.onTop, `on reopening, the open section's tab is in view (${JSON.stringify(s)})`)
  // Renaming a tab that is not open leaves the strip where the user scrolled it.
  await page.locator('.section-tabs').evaluate((el) => el.scrollTo(0, 0))
  await page.waitForSelector('.tab-add-pin.covering', { timeout: 5000 }).catch(() => undefined)
  await page.locator('.section-tabs .tab', { hasText: /^Section number 2$/ }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Rename…$/ }).click()
  await page.locator('.dialog input').fill('Second, renamed')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.section-tabs .tab:has-text("Second, renamed")')
  assert((await strip()).scrollLeft === 0, 'renaming a tab that is not open leaves the strip where it was')
  // A tab reached with the Tab key comes clear of the + (the browser leaves a half-hidden one as it is).
  // Focus the tab before the one half beneath the +, then press Tab.
  const target = await page.evaluate(() => {
    const el = document.querySelector('.section-tabs')!
    const pinLeft = el.querySelector('.tab-add-pin')!.getBoundingClientRect().left
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('.tab:not(.add)'))
    const i = tabs.findIndex((t) => t.getBoundingClientRect().right > pinLeft)
    tabs[i - 1]!.focus()
    return { name: tabs[i]!.textContent ?? '' }
  })
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const el = document.querySelector('.section-tabs')!
    const tab = document.activeElement as HTMLElement
    return { name: tab.textContent, right: tab.getBoundingClientRect().right, pinLeft: el.querySelector('.tab-add-pin')!.getBoundingClientRect().left }
  })
  assert(focused.name === target.name && focused.right <= focused.pinLeft + 0.5, `a tab reached with the Tab key is not left beneath the + (${JSON.stringify(target)}; ${JSON.stringify(focused)})`)
  // Clicking the visible part of a tab half beneath the + opens it and uncovers it without moving
  // another tab under the pointer, so a double-click (to rename) stays on that tab. The second time
  // it is already open, and focused.
  for (let round = 0; round < 2; round++) {
    const half = await page.evaluate(() => {
      const el = document.querySelector('.section-tabs')!
      const pin = el.querySelector('.tab-add-pin')!.getBoundingClientRect()
      const tab = el.querySelectorAll<HTMLElement>('.tab:not(.add)')[12]!
      const r0 = tab.getBoundingClientRect()
      el.scrollLeft += (r0.left + r0.right) / 2 - pin.left
      const r = tab.getBoundingClientRect()
      return { name: tab.textContent ?? '', x: pin.left - 3, y: (r.top + r.bottom) / 2, partly: r.left < pin.left - 20 && r.right > pin.left + 20 }
    })
    assert(half.partly, `a tab is partly beneath the + (${JSON.stringify(half)})`)
    await page.mouse.click(half.x, half.y)
    await page.waitForSelector(`.tab.on:has-text("${half.name}")`)
    const after = await page.evaluate((p) => {
      const el = document.querySelector('.section-tabs')!
      const on = el.querySelector('.tab.on')!
      return { same: document.elementFromPoint(p.x, p.y) === on, right: on.getBoundingClientRect().right, pinLeft: el.querySelector('.tab-add-pin')!.getBoundingClientRect().left }
    }, half)
    assert(after.same && after.right <= after.pinLeft + 0.5, `the clicked tab is uncovered and still under the pointer (round ${round + 1}: ${JSON.stringify(after)})`)
  }
  // When the window becomes active again, the browser focuses the clicked tab once more (the window's
  // focus event, then the tab's); the strip stays where the user scrolled it.
  const refocused = await page.evaluate(async () => {
    const el = document.querySelector('.section-tabs')!
    const tab = el.querySelector<HTMLElement>('.tab.on')!
    el.scrollLeft = 0
    const before = el.scrollLeft
    window.dispatchEvent(new FocusEvent('focus'))
    tab.dispatchEvent(new FocusEvent('focus'))
    tab.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    return { focused: document.activeElement === tab, before, after: el.scrollLeft }
  })
  assert(refocused.focused && refocused.after === refocused.before, `the strip stays put when the window is focused again (${JSON.stringify(refocused)})`)
  // The strip has nothing to scroll up and down.
  const tall = await page.evaluate(() => {
    const el = document.querySelector('.section-tabs')!
    el.querySelector<HTMLElement>('.tab.on')!.focus()
    el.scrollTop = 5
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  })
  assert(tall.scrollTop === 0 && tall.scrollHeight === tall.clientHeight, `the tabs strip does not scroll up and down (${JSON.stringify(tall)})`)
  // In a section group with only a few sections, the + sits straight after the last tab.
  await page.locator('.tab.group', { hasText: 'Small group' }).click()
  await page.waitForSelector('.section-tabs .tab:has-text("Inside two")')
  s = await strip()
  assert(s.overflow <= 0 && !s.covering && s.add.left - s.lastTabRight < 4 && s.addOnTop, `with few sections the + follows the last tab (${JSON.stringify(s)})`)
  step('renaming another tab keeps the strip in place, a tab reached by Tab or a click comes clear of the +, and with room the + follows the last tab')
  await close()
  process.stdout.write(`\nPASS: ${steps.length} steps. Notebook kept at ${root}\n`)
}

main().catch(async (err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
