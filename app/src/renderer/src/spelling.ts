import type { Editor } from '@tiptap/react'

/** A word in a text box: its text and where it sits in the document. */
export interface WordAt {
  word: string
  from: number
  to: number
}

/** A misspelled word, with the spelling checker's suggestions (at most five). */
export interface Misspelling extends WordAt {
  suggestions: string[]
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}'’]/u

/** How many suggestions the right-click menu offers. */
const MAX_SUGGESTIONS = 5

/**
 * Windows draws the red underline with its own spelling checker, which the page cannot ask about a
 * word: `webFrame.isWordMisspelled` asks only Chromium's built-in dictionaries, which are off for
 * every language Windows checks, so it always answers "spelled correctly". The browser does report
 * the underlined word and Windows' suggestions when a right-click on the text reaches it (Electron's
 * `context-menu` event, passed on as `spell.onMisspelling`), a moment after the menu has opened,
 * provided the selection then covers exactly that word (see `selectWordForReport`).
 */
export function spellingFromRightClick(): boolean {
  return navigator.userAgent.includes('Windows')
}

/**
 * Windows: select the word under a right-click for the browser's report of it, and put the earlier
 * selection back once the browser has looked. The browser names a misspelled word only when the
 * selection covers exactly that word, and it does not select the word itself for a right-click here.
 * Call it from the `contextmenu` event: the browser reads the selection straight after that event.
 * A highlighted stretch of text under the pointer is left as it is.
 */
export function selectWordForReport(editor: Editor, x: number, y: number): void {
  const selection = window.getSelection()
  if (!selection) return
  const earlier = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  if (earlier && !earlier.collapsed && Array.from(earlier.getClientRects()).some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return
  const w = wordAt(editor, x, y)
  if (!w) return
  const start = editor.view.domAtPos(w.from, 1)
  const end = editor.view.domAtPos(w.to, -1)
  if (start.node.nodeType !== Node.TEXT_NODE || end.node.nodeType !== Node.TEXT_NODE) return
  selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset)
  window.setTimeout(() => {
    const now = window.getSelection()
    if (!now) return
    now.removeAllRanges()
    if (earlier && earlier.startContainer.isConnected && earlier.endContainer.isConnected) now.addRange(earlier)
  }, 0)
}

/**
 * The misspelled word at a screen point in a text box, with suggestions, as judged by the
 * spelling checker that draws the red underline (macOS supplies it to the page; on Windows see
 * `spellingFromRightClick`). Null when the point is not over a misspelled word.
 */
export function misspellingAt(editor: Editor, x: number, y: number): Misspelling | null {
  const w = wordAt(editor, x, y)
  if (!w || !window.pagebinder.spell.isMisspelled(w.word)) return null
  return { ...w, suggestions: window.pagebinder.spell.suggestions(w.word).slice(0, MAX_SUGGESTIONS) }
}

/**
 * Windows: the misspelled word at a screen point, from the browser's report of a right-click there
 * (see `spellingFromRightClick`). Null unless the report names the word under the point.
 */
export function misspellingFromReport(editor: Editor, x: number, y: number, report: { word: string; suggestions: string[] }): Misspelling | null {
  if (!report.word) return null
  const w = wordAt(editor, x, y)
  if (!w || w.word !== report.word) return null
  return { ...w, suggestions: report.suggestions.slice(0, MAX_SUGGESTIONS) }
}

/** The word at a screen point in a text box, if the point is over one. */
export function wordAt(editor: Editor, x: number, y: number): WordAt | null {
  const hit = editor.view.posAtCoords({ left: x, top: y })
  if (!hit) return null
  const $pos = editor.state.doc.resolve(hit.pos)
  const block = $pos.parent
  if (!block.isTextblock) return null
  // One character per position, so offsets in this text are offsets in the document.
  const text = block.textBetween(0, block.content.size, undefined, '￼')
  let start = $pos.parentOffset
  let end = start
  while (start > 0 && WORD_CHAR.test(text[start - 1]!)) start--
  while (end < text.length && WORD_CHAR.test(text[end]!)) end++
  while (start < end && /['’]/.test(text[start]!)) start++
  while (end > start && /['’]/.test(text[end - 1]!)) end--
  const word = text.slice(start, end)
  if (!word || !/\p{L}/u.test(word)) return null
  const from = $pos.start() + start
  const to = $pos.start() + end
  // The point must be over the word itself, not in the space after a line's last word.
  const a = editor.view.coordsAtPos(from)
  const b = editor.view.coordsAtPos(to, -1)
  if (a.top === b.top && (x < a.left - 1 || x > b.right + 1 || y < a.top - 1 || y > a.bottom + 1)) return null
  return { word, from, to }
}

/** Replace the misspelled word with a suggestion, keeping its formatting. */
export function replaceMisspelling(editor: Editor, m: Misspelling, replacement: string): void {
  const { state, view } = editor
  if (m.to > state.doc.content.size || state.doc.textBetween(m.from, m.to) !== m.word) return
  view.dispatch(state.tr.insertText(replacement, m.from, m.to))
  editor.commands.focus()
}

/** Add the word to the spelling dictionary, and have the text checked again so its underline goes. */
export async function addToDictionary(editor: Editor, m: Misspelling): Promise<void> {
  await window.pagebinder.spell.addToDictionary(m.word)
  const dom = editor.view.dom as HTMLElement
  dom.spellcheck = false
  requestAnimationFrame(() => {
    dom.spellcheck = true
  })
}
