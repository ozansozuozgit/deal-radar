// Local-only list, used until (or if) a server list code can be created.
export interface ListItem {
  text: string
  qty?: number
  unit?: string | null
  pinnedDealId?: number | null
  rejectedDealIds?: number[]
  checked?: boolean
}

const KEY = 'deal-radar-list-v1'

export function loadList(): ListItem[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveList(items: ListItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function addListItem(item: ListItem | string): ListItem[] {
  const it = typeof item === 'string' ? { text: item } : item
  const t = it.text.trim()
  const cur = loadList()
  if (!t || cur.some(i => i.text.toLowerCase() === t.toLowerCase())) return cur
  const next = [...cur, { ...it, text: t }]
  saveList(next)
  return next
}

export function updateListItem(text: string, patch: Partial<ListItem>): ListItem[] {
  const next = loadList().map(i => (i.text === text ? { ...i, ...patch } : i))
  saveList(next)
  return next
}

export function removeListItem(text: string): ListItem[] {
  const next = loadList().filter(i => i.text !== text)
  saveList(next)
  return next
}

export function removeListItems(texts: string[]): ListItem[] {
  const drop = new Set(texts)
  const next = loadList().filter(i => !drop.has(i.text))
  saveList(next)
  return next
}

/** Add to whichever list is active: the shared one when there's a code, else local. */
export async function addToActiveList(code: string | null, item: ListItem): Promise<void> {
  if (!code) { addListItem(item); return }
  await fetch('/api/list', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, text: item.text, qty: item.qty, unit: item.unit, pinnedDealId: item.pinnedDealId }),
  }).catch(() => { addListItem(item) })
}
