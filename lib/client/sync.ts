import { loadList } from './list'
import { readString, writeString } from './storage'

// One 6-character code ties this browser to a server-side list. Everything that should
// follow Ozan across phone and laptop (list, watches, purchases) hangs off it.
const CODE_KEY = 'deal-radar-listcode-v1'

export function storedCode(): string | null {
  return readString(CODE_KEY)
}

export function setStoredCode(code: string): void {
  writeString(CODE_KEY, code)
}

// URL join code (?list=XXXXXX) > stored code. A join code is remembered and stripped
// from the URL so a reload doesn't re-join. Idempotent, so safe as a state initializer.
export function initialCode(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const joinCode = url.searchParams.get('list')?.toUpperCase() ?? null
  if (joinCode) {
    if (/^[A-Z0-9]{6}$/.test(joinCode)) setStoredCode(joinCode) // ignore mangled links
    url.searchParams.delete('list')
    window.history.replaceState({}, '', url.toString())
  }
  return storedCode()
}

/** Create a server-side list for this browser, seeded with any local-only items. */
export async function createCode(): Promise<string | null> {
  try {
    const res = await fetch('/api/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: loadList().map(i => ({ text: i.text, qty: i.qty, unit: i.unit })) }),
    })
    if (!res.ok) return null
    const { code } = await res.json()
    if (typeof code !== 'string') return null
    setStoredCode(code)
    return code
  } catch { return null } // offline: stay local-only until next visit
}
