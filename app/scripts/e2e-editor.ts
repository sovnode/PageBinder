/// <reference lib="dom" />
import type { Page } from 'playwright'

/**
 * Wait until a table just inserted from the canvas menu is ready for keys.
 *
 * The new table's text box takes focus a moment after it appears: TipTap focuses it from a timer and
 * then an animation frame, and ProseMirror re-applies its own selection 20 ms after an editor gains
 * focus. Keys sent before both have run can be typed out of order, or have their selection undone:
 * phase 8's Shift+Home in a new table selected nothing on a GitHub Windows run (2026-11-07), and a
 * Mac reproduction showed both. A person is never this quick, so only the tests wait.
 */
export async function waitForNewTable(page: Page): Promise<void> {
  await page.waitForSelector('.tiptap table td')
  // The newest table is the last one: a new text box is added after the others.
  await page.waitForFunction(() => {
    const tables = document.querySelectorAll('.tiptap table')
    const box = tables[tables.length - 1]?.closest('.tiptap')
    return !!box && document.activeElement === box
  })
  await page.waitForTimeout(100)
}
