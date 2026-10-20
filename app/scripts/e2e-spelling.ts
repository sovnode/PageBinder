/// <reference lib="dom" />
/**
 * Spelling suggestions in a text box's right-click menu, and the start screen's right-click menu
 * for a recent notebook, through the real Electron window.
 *   npx tsx scripts/e2e-spelling.ts
 */
import { _electron as electron, type Page } from 'playwright'
import { useApp, saveViaMenu } from './e2e-save'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import type { PageDoc } from '../src/shared/types'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}

/** The middle of a word in the open page's text, in window coordinates. */
async function wordCentre(page: Page, word: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((w) => {
    for (const root of Array.from(document.querySelectorAll('.text-container .tiptap'))) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(w)
      if (i < 0) continue
      const range = document.createRange()
      range.setStart(n, i)
      range.setEnd(n, i + w.length)
      const r = range.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    }
    return null
  }, word)
  assert(at, `the word "${word}" is on the page`)
  return at
}

async function menuItems(page: Page): Promise<string[]> {
  await page.waitForSelector('.context-menu')
  return page.locator('.context-menu .context-item').allTextContents()
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e-spell-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Spelling test')
  const sec = await createSection(root, '', 'Notes', '#378ADD')
  const { relPath } = await createPage(root, sec, 'Field notes')
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  // A made-up word for Add to dictionary; on macOS and Windows the system dictionary keeps it, so it is removed again at the end.
  const madeUp = 'pagebinderzqx'

  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(base, 'userData')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  try {
    const page = await app.firstWindow()
    useApp(app)
    await page.waitForSelector('.section-tabs')

    // 1. A misspelled word's right-click menu starts with suggestions; choosing one replaces the word.
    const box = page.locator('.text-container .tiptap').last()
    await box.click()
    await page.keyboard.press('End')
    await page.keyboard.type(` The drainage ditch will recieve water. The culvert is clear. ${madeUp}`)
    await page.keyboard.press('Escape')
    // macOS and Windows supply the spelling checker; Linux (cloud sessions) usually has no dictionary.
    if (!(await page.evaluate(() => window.pagebinder.spell.isMisspelled('recieve')))) {
      process.stdout.write('  - skipped: no spelling dictionary on this computer\n')
    } else {
      let at = await wordCentre(page, 'recieve')
      await page.mouse.click(at.x, at.y, { button: 'right' })
      let items = await menuItems(page)
      const firstPlain = items.indexOf('Add to dictionary')
      assert(firstPlain > 0 && items.slice(0, firstPlain).includes('receive'), `suggestions come first and include "receive" (${items.join(' | ')})`)
      assert(firstPlain <= 5, `at most five suggestions (${firstPlain})`)
      assert((await page.locator('.context-menu .context-item.spelling-suggestion').count()) === firstPlain, 'suggestions are shown in bold')
      await page.locator('.context-menu .context-item.spelling-suggestion', { hasText: /^receive$/ }).click()
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.text-container .tiptap')).some((t) => (t.textContent ?? '').includes('will receive water')))
      await saveViaMenu(page)
      const doc = JSON.parse(await fs.readFile(join(root, relPath, 'page.json'), 'utf8')) as PageDoc
      const text = JSON.stringify(doc.objects)
      assert(text.includes('will receive water') && !text.includes('recieve'), 'the chosen suggestion replaced the word in the saved page')
      step('a misspelled word offers suggestions first, and choosing one replaces it')

      // 2. A correctly spelled word shows the usual menu, with no suggestions.
      at = await wordCentre(page, 'culvert')
      await page.mouse.click(at.x, at.y, { button: 'right' })
      items = await menuItems(page)
      assert(!items.includes('Add to dictionary') && items[0] === 'Insert picture…', `no spelling items for a correct word (${items.join(' | ')})`)
      await page.keyboard.press('Escape')
      step('a correctly spelled word gets the usual menu')

      // 3. Add to dictionary: the word is no longer marked as misspelled.
      at = await wordCentre(page, madeUp)
      await page.mouse.click(at.x, at.y, { button: 'right' })
      items = await menuItems(page)
      assert(items.includes('Add to dictionary'), `the made-up word is marked as misspelled (${items.join(' | ')})`)
      await page.locator('.context-menu .context-item', { hasText: /^Add to dictionary$/ }).click()
      await page.waitForFunction((w) => !window.pagebinder.spell.isMisspelled(w), madeUp, { timeout: 5000 })
      at = await wordCentre(page, madeUp)
      await page.mouse.click(at.x, at.y, { button: 'right' })
      items = await menuItems(page)
      assert(!items.includes('Add to dictionary'), `after Add to dictionary the word is no longer marked (${items.join(' | ')})`)
      await page.keyboard.press('Escape')
      step('Add to dictionary stops the word being marked')
    }

    // 4. The start screen: a recent notebook's right-click menu opens its folder, or removes it from the list.
    await page.locator('.notebook-button').click()
    await page.locator('.context-item', { hasText: 'Switch notebook' }).click()
    await page.waitForSelector('.welcome')
    await app.evaluate(({ shell }) => {
      ;(globalThis as Record<string, unknown>)['__opened'] = null
      shell.openPath = async (p: string) => {
        ;(globalThis as Record<string, unknown>)['__opened'] = p
        return ''
      }
    })
    await page.locator('.recent-row button', { hasText: 'Spelling test' }).first().click({ button: 'right' })
    const welcomeItems = await menuItems(page)
    const openLabel = process.platform === 'win32' ? 'Open in Explorer' : 'Open in Finder'
    assert(welcomeItems.includes(openLabel) && welcomeItems.includes('Remove from this list'), `the recent notebook's menu (${welcomeItems.join(' | ')})`)
    await page.locator('.context-menu .context-item', { hasText: openLabel }).click()
    const opened = await app.evaluate(() => (globalThis as Record<string, unknown>)['__opened'] as string | null)
    assert(opened && resolve(opened) === resolve(root), `the notebook's folder was opened (${opened})`)
    const refused = await page.evaluate(() => window.pagebinder.notebook.openFolder('/not/a/recent/notebook').then(() => false, () => true))
    assert(refused, 'a folder that is not a recent notebook is refused')
    await page.locator('.recent-row button', { hasText: 'Spelling test' }).first().click({ button: 'right' })
    await page.locator('.context-menu .context-item', { hasText: 'Remove from this list' }).click()
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('.recent-row')).some((r) => r.textContent?.includes('Spelling test')))
    step(`a recent notebook's right-click menu offers ${openLabel} and Remove from this list`)
  } finally {
    await app.evaluate(({ session }, w) => session.defaultSession.removeWordFromSpellCheckerDictionary(w), madeUp).catch(() => undefined)
    await app.close()
  }
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
