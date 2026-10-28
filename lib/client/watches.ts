import { getDeviceId } from './device'

export type PriceBasis = 'item' | 'lb'
export interface Watch { term: string; maxPrice?: number | null; basis?: PriceBasis }

const KEY = 'deal-radar-watches-v1'
const MIGRATED_KEY = 'deal-radar-watches-owner-v1'

/** Watches belong to the list code when there is one, so every synced device shares them. */
export function watchOwner(code: string | null): string {
  return code ? `list:${code}` : getDeviceId()
}

function syncServer(method: 'POST' | 'DELETE', owner: string, w: Watch) {
  // fire-and-forget: server copy powers push alerts, local copy powers the UI
  return fetch('/api/watches', {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, term: w.term, maxPrice: w.maxPrice ?? null, basis: w.basis ?? 'item' }),
  }).catch(() => {})
}

export function loadWatches(): Watch[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveWatches(watches: Watch[]): void {
  localStorage.setItem(KEY, JSON.stringify(watches))
}

export function addWatch(term: string, owner: string, maxPrice?: number | null, basis: PriceBasis = 'item'): Watch[] {
  const t = term.trim().toLowerCase()
  const cur = loadWatches()
  if (!t || cur.some(w => w.term === t)) return cur
  const w: Watch = { term: t, maxPrice: maxPrice ?? null, basis }
  const next = [...cur, w]
  saveWatches(next)
  syncServer('POST', owner, w)
  return next
}

export function updateWatch(term: string, owner: string, patch: Pick<Watch, 'maxPrice' | 'basis'>): Watch[] {
  const next = loadWatches().map(w => (w.term === term ? { ...w, ...patch } : w))
  saveWatches(next)
  const w = next.find(x => x.term === term)
  if (w) syncServer('POST', owner, w)
  return next
}

export function removeWatch(term: string, owner: string): Watch[] {
  const next = loadWatches().filter(w => w.term !== term)
  saveWatches(next)
  syncServer('DELETE', owner, { term })
  return next
}

/**
 * Bring this device in line with the shared watches for `code`: move any watches this
 * device created before it had a code over to the code (once), then adopt the server's set.
 */
export async function syncWatches(code: string): Promise<Watch[]> {
  const owner = watchOwner(code)
  if (localStorage.getItem(MIGRATED_KEY) !== owner) {
    const device = getDeviceId()
    await Promise.all(loadWatches().map(async w => {
      await syncServer('POST', owner, w)
      await syncServer('DELETE', device, w)
    }))
    localStorage.setItem(MIGRATED_KEY, owner)
  }
  const res = await fetch(`/api/watches?owner=${encodeURIComponent(owner)}`)
  if (!res.ok) return loadWatches()
  const { watches } = await res.json() as { watches: Array<{ term: string; max_price: number | null; price_basis: string | null }> }
  const next: Watch[] = watches.map(w => ({ term: w.term, maxPrice: w.max_price, basis: w.price_basis === 'lb' ? 'lb' : 'item' }))
  saveWatches(next)
  return next
}
