import type { JSX } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { SECTION_COLORS, type TreeChild } from '@shared/types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { TemplateInfo } from '../../../preload/api'

export function SectionTabs({
  children,
  activeSectionRel,
  onSelectSection,
  onOpenGroup,
  onAddSection,
  onAddGroup,
  onRename,
  onSetColor,
  templates,
  onSetDefaultTemplate,
  onMoveCopy,
  onDelete,
  templateMode
}: {
  children: TreeChild[]
  activeSectionRel: string | null
  onSelectSection: (rel: string) => void
  onOpenGroup: (rel: string) => void
  onAddSection: () => void
  onAddGroup: () => void
  onRename: (rel: string) => void
  onSetColor: (rel: string, color: string) => void
  templates: TemplateInfo[]
  onSetDefaultTemplate: (rel: string, ref: string | null) => void
  onMoveCopy: (node: TreeChild) => void
  onDelete: (node: TreeChild) => void
  /** The Templates notebook is open: its sections take no default template. */
  templateMode?: boolean
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeChild } | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  // The + stays at the right end of the strip however many tabs there are (the user's request,
  // 2026-10-31); tabs scroll beneath it. Whether some lie hidden there, for its shadow.
  const [covering, setCovering] = useState(false)
  const measure = (): void => {
    const strip = stripRef.current
    if (strip) setCovering(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1)
  }
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [])
  // Scroll a tab into view, clear of the +. One partly in view, perhaps just clicked, is only
  // uncovered, so the second click of a double-click still lands on it; a hidden one comes into view
  // with a margin. Used for a clicked tab and one reached with the Tab key (the browser leaves a
  // partly visible one where it is, perhaps mostly beneath the +), but not on every focus: the
  // browser focuses the tab again whenever the window becomes active, which would undo the user's
  // scrolling.
  const reveal = (tab: HTMLElement): void => {
    const strip = stripRef.current
    const pin = strip?.querySelector<HTMLElement>('.tab-add-pin')
    if (!strip || !pin) return
    const t = tab.getBoundingClientRect()
    const edge = strip.getBoundingClientRect().left
    const right = pin.getBoundingClientRect().left
    if (t.right <= edge) strip.scrollLeft -= edge + parseFloat(getComputedStyle(strip).paddingLeft) - t.left
    else if (t.left < edge) strip.scrollLeft -= edge - t.left
    else if (t.left >= right) strip.scrollLeft += t.right - right + 8
    else if (t.right > right) strip.scrollLeft += t.right - right
  }
  // Bring the open section's tab into view when another section is opened or the open one's tab is
  // new: a new section is added at the end, which may be out of sight. Other changes to the tabs
  // (renaming, copying, or deleting another one) leave the strip where the user scrolled it.
  const shown = useRef<{ active: string | null | undefined; tabs: string[] }>({ active: undefined, tabs: [] })
  const tabsKey = children.map((c) => c.relPath).join('\n')
  useLayoutEffect(() => {
    const before = shown.current
    shown.current = { active: activeSectionRel, tabs: children.map((c) => c.relPath) }
    const tab = stripRef.current?.querySelector<HTMLElement>('.tab.on')
    if (tab && activeSectionRel && (activeSectionRel !== before.active || !before.tabs.includes(activeSectionRel))) reveal(tab)
    measure()
  }, [activeSectionRel, tabsKey])

  // Two templates with the same name are told apart by their section.
  const named = (t: TemplateInfo): string => (templates.some((o) => o !== t && o.name === t.name) ? `${t.name} (${t.section})` : t.name)
  const defaultRef = menu?.node.kind === 'section' ? menu.node.defaultTemplate : undefined
  const current = defaultRef ? templates.find((t) => t.ref === defaultRef) : undefined
  const items: MenuItem[] = menu
    ? [
        { label: 'Rename…', onClick: () => onRename(menu.node.relPath) },
        { label: 'Move or copy…', onClick: () => onMoveCopy(menu.node) },
        ...(menu.node.kind === 'section'
          ? [
              { separator: true },
              { swatches: { color: SECTION_COLORS.join(','), current: menu.node.color, onPick: (c: string) => onSetColor(menu.node.relPath, c) } },
              ...(templateMode
                ? []
                : [
                    { separator: true },
                    { label: `Default template: ${current ? named(current) : 'blank page'}`, heading: true },
                    { label: '   Use a blank page', onClick: () => onSetDefaultTemplate(menu.node.relPath, null) },
                    ...templates.map((t) => ({ label: `   Use “${named(t)}”`, onClick: () => onSetDefaultTemplate(menu.node.relPath, t.ref) }))
                  ])
            ]
          : []),
        { separator: true },
        { label: menu.node.kind === 'section' ? 'Delete section…' : 'Delete section group…', onClick: () => onDelete(menu.node) }
      ]
    : []
  return (
    <div
      className="section-tabs"
      ref={stripRef}
      onScroll={measure}
      onKeyUp={(e) => {
        if (e.key === 'Tab' && e.target instanceof HTMLElement && e.target.matches('.tab:not(.add)')) reveal(e.target)
      }}
    >
      {children.map((node) =>
        node.kind === 'section' ? (
          <button
            key={node.relPath}
            type="button"
            className={`tab${node.relPath === activeSectionRel ? ' on' : ''}`}
            style={{ borderTopColor: node.color }}
            onClick={(e) => {
              reveal(e.currentTarget)
              onSelectSection(node.relPath)
            }}
            onDoubleClick={() => onRename(node.relPath)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, node })
            }}
          >
            {node.name}
          </button>
        ) : (
          <button
            key={node.relPath}
            type="button"
            className="tab group"
            style={{ borderTopColor: '#7F77DD' }}
            onClick={() => onOpenGroup(node.relPath)}
            onDoubleClick={() => onRename(node.relPath)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, node })
            }}
            title="Section group"
          >
            <span className="folder-icon">▣</span> {node.name}
          </button>
        )
      )}
      <span className={`tab-add-pin${covering ? ' covering' : ''}`}>
        <button type="button" className="tab add" onClick={(e) => setAddMenu({ x: e.clientX, y: e.clientY })} title="Add section or group">
          +
        </button>
      </span>
      {children.length === 0 && <span className="muted small tabs-hint">No sections yet. Use + to add one.</span>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
      {addMenu && (
        <ContextMenu
          x={addMenu.x}
          y={addMenu.y}
          items={[
            { label: 'New section…', onClick: onAddSection },
            { label: 'New section group…', onClick: onAddGroup }
          ]}
          onClose={() => setAddMenu(null)}
        />
      )}
    </div>
  )
}
