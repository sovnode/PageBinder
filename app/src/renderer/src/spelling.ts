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
 * The misspelled word at a screen point in a text box, with suggestions, as judged by the
 * spelling checker that draws the red underline (macOS and Windows supply it). Null when the
 * point is not over a misspelled word.
 */
export function misspellingAt(editor: Editor, x: number, y: number): Misspelling | null {
  const w = wordAt(editor, x, y)
  if (!w || !window.pagebinder.spell.isMisspelled(w.word)) return null
  return { ...w, suggestions: window.pagebinder.spell.suggestions(w.word).slice(0, MAX_SUGGESTIONS) }
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
