/**
 * The order sections, section groups, and pages are shown in (the user's request, 2026-11-07).
 * The folder scan, the index, and exports all use these two functions, so the tabs, the page list,
 * template lists, and printouts always agree.
 *
 * - Sections and section groups form one alphabetical list: numbers in number order, capitals and
 *   accents ignored, as the system's language sorts. Inactive ones follow the active ones, also
 *   alphabetically. Equal names go by folder name, so the order is the same on every computer.
 * - Pages keep their section's own order (`pageOrder`, with pages it does not list after it, by
 *   folder name), except that inactive pages move to the end, keeping their order among themselves.
 *
 * Nothing here writes a file: `order` and `pageOrder` are kept as before, so 1.2.4 still shows the
 * order it always did.
 */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export interface ContainerKey {
  name: string
  /** Folder name, the tie-break for equal names. */
  folder: string
  inactive?: boolean
}

export function arrangeContainers<T>(items: T[], keyOf: (item: T) => ContainerKey): T[] {
  return items
    .map((item) => ({ item, key: keyOf(item) }))
    .sort((a, b) => Number(!!a.key.inactive) - Number(!!b.key.inactive) || collator.compare(a.key.name, b.key.name) || compareExact(a.key.folder, b.key.folder))
    .map((x) => x.item)
}

export function arrangePages<T>(items: T[], pageOrder: string[], folderOf: (item: T) => string, isInactive: (item: T) => boolean): T[] {
  const rank = new Map(pageOrder.map((name, i) => [name, i]))
  const ordered = [...items].sort((a, b) => {
    const ra = rank.get(folderOf(a))
    const rb = rank.get(folderOf(b))
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return collator.compare(folderOf(a), folderOf(b)) || compareExact(folderOf(a), folderOf(b))
  })
  return [...ordered.filter((p) => !isInactive(p)), ...ordered.filter(isInactive)]
}

function compareExact(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
