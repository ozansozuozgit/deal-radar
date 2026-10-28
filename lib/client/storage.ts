// localStorage can throw (Safari private mode, storage disabled, quota full) and can
// hold anything (old app versions, manual edits). Never let either crash the app.

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch { return fallback }
}

export function writeJson(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable: keep working in memory */ }
}

export function readString(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function writeString(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch { /* ignore */ }
}
