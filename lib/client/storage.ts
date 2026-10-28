// localStorage can throw (Safari private mode, storage disabled, quota full) and can
// hold anything (old app versions, manual edits). Never let either crash the app.
// When a write fails, the value is kept in memory so later reads in this session
// still see it (list/watch helpers re-read storage on every change).

const memory = new Map<string, string | null>()

function getRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null
  try { return window.localStorage.getItem(key) } catch { return null }
}

function setRaw(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
    memory.delete(key)
  } catch { memory.set(key, value) }
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const raw = getRaw(key)
  if (raw == null) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

export function writeJson(key: string, value: unknown): void {
  setRaw(key, JSON.stringify(value))
}

export function readString(key: string): string | null {
  return typeof window === 'undefined' ? null : getRaw(key)
}

export function writeString(key: string, value: string | null): void {
  setRaw(key, value)
}
