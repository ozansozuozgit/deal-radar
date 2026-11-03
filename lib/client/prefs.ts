import { readJson, writeJson, writeString } from './storage'

export interface Prefs {
  address: string; lat: number; lng: number; zip: string
  radiusMiles: number; enabledStores: string[] | null  // null = all
  label?: string                                       // saved place name, e.g. "Home"
  deliveryOff?: string[]                               // delivery stores you unticked; the rest stay on
}

export const PREFS_KEY = 'deal-radar-prefs-v1'

/** Validate whatever is stored; anything malformed means "not set up yet" rather than a crash. */
export function parsePrefs(raw: unknown): Prefs | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const lat = num(p.lat), lng = num(p.lng)
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const radius = num(p.radiusMiles)
  return {
    address: typeof p.address === 'string' && p.address.trim() ? p.address : 'My location',
    lat, lng,
    zip: typeof p.zip === 'string' ? p.zip : '',
    radiusMiles: radius != null && radius > 0 && radius <= 50 ? radius : 1.5,
    enabledStores: Array.isArray(p.enabledStores) && p.enabledStores.length
      && p.enabledStores.every(s => typeof s === 'string') ? p.enabledStores as string[] : null,
    ...(typeof p.label === 'string' && p.label.trim() ? { label: p.label.trim().slice(0, 40) } : {}),
    ...(Array.isArray(p.deliveryOff) && p.deliveryOff.length && p.deliveryOff.every(s => typeof s === 'string')
      ? { deliveryOff: p.deliveryOff as string[] } : {}),
  }
}

export function loadPrefs(): Prefs | null { return parsePrefs(readJson<unknown>(PREFS_KEY, null)) }
export function savePrefs(p: Prefs): void { writeJson(PREFS_KEY, p) }

export const STORE_FILTER_KEY = 'deal-radar-store-filter-v1'

/** The stores picked as filters in the feed; anything malformed means no filter. */
export function parseStoreFilter(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const slugs = raw.filter((s): s is string => typeof s === 'string' && !!s)
  return slugs.length ? slugs : null
}

export function loadStoreFilter(): string[] | null { return parseStoreFilter(readJson<unknown>(STORE_FILTER_KEY, null)) }
export function saveStoreFilter(slugs: string[] | null): void {
  if (slugs?.length) writeJson(STORE_FILTER_KEY, slugs)
  else writeString(STORE_FILTER_KEY, null)
}
