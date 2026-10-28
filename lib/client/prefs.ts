export interface Prefs {
  address: string; lat: number; lng: number; zip: string
  radiusMiles: number; enabledStores: string[] | null  // null = all
  label?: string                                       // saved place name, e.g. "Home"
}

const KEY = 'deal-radar-prefs-v1'

export function loadPrefs(): Prefs | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null }
}
export function savePrefs(p: Prefs): void { localStorage.setItem(KEY, JSON.stringify(p)) }
