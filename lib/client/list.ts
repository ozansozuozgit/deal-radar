import { readJson, writeJson } from './storage'

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
  const raw = readJson<unknown>(KEY, [])
  return Array.isArray(raw)
    ? raw.filter((i): i is ListItem => typeof i?.text === 'string' && !!i.text.trim()).map(i => ({
      text: i.text,
      qty: typeof i.qty === 'number' && i.qty > 0 ? i.qty : 1,
      unit: typeof i.unit === 'string' ? i.unit : null,
      pinnedDealId: Number.isInteger(i.pinnedDealId) ? i.pinnedDealId : null,
      rejectedDealIds: Array.isArray(i.rejectedDealIds) ? i.rejectedDealIds.filter(n => Number.isInteger(n)) : [],
      checked: i.checked === true,
    }))
    : []
}

export function saveList(items: ListItem[]): void {
  writeJson(KEY, items)
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

// Additions to the shared list that couldn't reach the server (offline, server error).
// They're retried whenever the shared list loads; see flushPendingAdds.
const PENDING_KEY = 'deal-radar-list-pending-v1'

function loadPending(): ListItem[] {
  const raw = readJson<unknown>(PENDING_KEY, [])
  return Array.isArray(raw) ? raw.filter((i): i is ListItem => typeof i?.text === 'string' && !!i.text.trim()) : []
}

async function postItem(code: string, item: ListItem): Promise<boolean> {
  try {
    const res = await fetch('/api/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, text: item.text, qty: item.qty, unit: item.unit, pinnedDealId: item.pinnedDealId }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Add to whichever list is active: the shared one when there's a code, else local.
 * 'queued' means the shared list couldn't be reached; the item is kept and sent later.
 */
export async function addToActiveList(code: string | null, item: ListItem): Promise<'added' | 'queued'> {
  if (!code) { addListItem(item); return 'added' }
  if (await postItem(code, item)) return 'added'
  const pending = loadPending()
  if (!pending.some(i => i.text.toLowerCase() === item.text.trim().toLowerCase())) {
    writeJson(PENDING_KEY, [...pending, { ...item, text: item.text.trim() }])
  }
  return 'queued'
}

/** Send queued additions to the shared list; keeps the ones that still fail. */
export async function flushPendingAdds(code: string): Promise<number> {
  const pending = loadPending()
  if (!pending.length) return 0
  const results = await Promise.all(pending.map(i => postItem(code, i)))
  writeJson(PENDING_KEY, pending.filter((_, n) => !results[n]))
  return results.filter(Boolean).length
}
