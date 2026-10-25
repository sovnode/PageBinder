/**
 * Page names that follow the page's text. A page made from a template takes its name from its first
 * line of text and keeps following that line as it is edited, until the page is renamed by hand
 * (the user's request, 2026-10-25). The page records the text box that holds the line as
 * `titleSource`; renaming the page removes it, for good. Used by the main process and the renderer.
 */
import type { CanvasObject, EditorJSON, PageDoc, TextContainer } from './types'

/** The longest name a page takes from its text. */
export const TITLE_FROM_TEXT_MAX = 100

function oneLine(text: string): string {
  const line = text.replace(/[\s ]+/g, ' ').trim()
  return line.length > TITLE_FROM_TEXT_MAX ? line.slice(0, TITLE_FROM_TEXT_MAX).trimEnd() : line
}

/** A text box's first line of text: its first paragraph with any text, up to a line break within it. */
export function firstLineOf(content: EditorJSON): string {
  const visit = (node: EditorJSON): string => {
    const children = node['content']
    if (!Array.isArray(children)) return ''
    const kids = children as EditorJSON[]
    if (kids.some((k) => k.type === 'text' || k.type === 'hardBreak')) {
      // A paragraph: its lines are split by line breaks; the first one with text counts.
      let text = ''
      for (const k of kids) {
        if (k.type === 'hardBreak') {
          if (oneLine(text)) break
          text = ''
        } else if (k.type === 'text' && typeof k['text'] === 'string') text += k['text']
      }
      return oneLine(text)
    }
    for (const k of kids) {
      const found = visit(k)
      if (found) return found
    }
    return ''
  }
  return visit(content)
}

/** For a new page made from a template: the topmost text box with text, and its first line. */
export function titleSourceOf(objects: CanvasObject[]): { id: string; line: string } | null {
  const boxes = objects.filter((o): o is TextContainer => o.kind === 'text').sort((a, b) => a.y - b.y || a.x - b.x)
  for (const box of boxes) {
    const line = firstLineOf(box.content)
    if (line) return { id: box.id, line }
  }
  return null
}

/**
 * The page with its name brought in line with its first line of text, when its name follows the
 * text. While that line is empty (or its text box is gone) the name stays as it is.
 */
export function withTitleFromText(doc: PageDoc): PageDoc {
  if (!doc.titleSource) return doc
  const box = doc.objects.find((o) => o.id === doc.titleSource)
  if (!box || box.kind !== 'text') return doc
  const line = firstLineOf(box.content)
  return line && line !== doc.title ? { ...doc, title: line } : doc
}
