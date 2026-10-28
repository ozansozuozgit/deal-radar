import { readJson, writeJson } from './storage'

export interface ListItem { text: string }

const KEY = 'deal-radar-list-v1'

export function loadList(): ListItem[] {
  const raw = readJson<unknown>(KEY, [])
  return Array.isArray(raw)
    ? raw.filter((i): i is ListItem => typeof i?.text === 'string' && !!i.text.trim()).map(i => ({ text: i.text }))
    : []
}

export function saveList(items: ListItem[]): void {
  writeJson(KEY, items)
}

export function addListItem(text: string): ListItem[] {
  const t = text.trim()
  const cur = loadList()
  if (!t || cur.some(i => i.text.toLowerCase() === t.toLowerCase())) return cur
  const next = [...cur, { text: t }]
  saveList(next)
  return next
}

export function removeListItem(text: string): ListItem[] {
  const next = loadList().filter(i => i.text !== text)
  saveList(next)
  return next
}
