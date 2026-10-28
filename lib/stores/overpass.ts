import { haversineMiles } from '@/lib/geo'
import { slugify } from '@/lib/parse/normalize'
import { getServiceClient } from '@/lib/db'
import type { LocationConfig } from '@/lib/types'

export type OsmElement = {
  type: string; id: number
  lat?: number; lon?: number
  center?: { lat: number; lon: number }
  tags?: { name?: string; shop?: string; 'addr:street'?: string; 'addr:housenumber'?: string }
}

export interface StoreRow {
  slug: string; name: string; lat: number | null; lng: number | null
  branch_address: string | null; distance_miles: number | null
}

export function matchBranches(
  merchants: Array<{ slug: string; name: string }>,
  elements: OsmElement[],
  home: { lat: number; lng: number },
): StoreRow[] {
  const branches = elements
    .map(e => ({ lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, tags: e.tags }))
    .filter((b): b is { lat: number; lng: number; tags: OsmElement['tags'] } =>
      b.lat != null && b.lng != null && !!b.tags?.name)
  return merchants.map(m => {
    const mTokens = tokens(m.name)
    let best: { lat: number; lng: number; addr: string | null; d: number } | null = null
    for (const b of branches) {
      const bTokens = tokens(b.tags!.name!)
      const overlap = [...mTokens].filter(t => bTokens.has(t)).length
      if (!(overlap >= Math.min(2, mTokens.size) && overlap > 0)) continue
      const d = haversineMiles(home, b)
      if (!best || d < best.d) {
        const t = b.tags!
        const addr = t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : null
        best = { lat: b.lat, lng: b.lng, addr, d }
      }
    }
    return {
      slug: m.slug, name: m.name,
      lat: best?.lat ?? null, lng: best?.lng ?? null,
      branch_address: best?.addr ?? null,
      distance_miles: best ? Math.round(best.d * 100) / 100 : null,
    }
  })
}

function tokens(name: string): Set<string> {
  const STOP = new Set(['supermarket', 'supermarkets', 'market', 'markets', 'foods', 'food', 'inc', 'the', 'club'])
  return new Set(slugify(name).split('-').filter(t => t && !STOP.has(t)))
}

/**
 * Find each chain's nearest branch to `loc` on OpenStreetMap. Every branch found is kept in
 * store_branches; the default location also refreshes the stores table itself.
 */
export async function syncStores(loc: LocationConfig, logos?: Map<string, string>, { branchesOnly = false } = {}): Promise<void> {
  const db = getServiceClient()
  const { data: merchants } = await db.from('flyers').select('merchant_slug, merchant_name, source')
  if (!merchants?.length) return
  const unique = new Map(merchants.map(m => [m.merchant_slug, m]))

  // Upsert names/logos first so they survive even when Overpass is down.
  if (logos?.size && !branchesOnly) {
    const logoRows = [...unique.values()]
      .filter(m => logos.has(m.merchant_slug))
      .map(m => ({
        source: m.source, slug: m.merchant_slug, name: m.merchant_name,
        logo_url: logos.get(m.merchant_slug)!,
      }))
    const { error } = await db.from('stores').upsert(logoRows, { onConflict: 'source,slug' })
    if (error) console.error('logo upsert failed:', error.message)
  }
  const radiusMeters = 16_000 // ~10 mi cap; the UI radius filters further
  const query = `[out:json][timeout:30];(node[shop~"supermarket|greengrocer"](around:${radiusMeters},${loc.lat},${loc.lng});way[shop~"supermarket|greengrocer"](around:${radiusMeters},${loc.lat},${loc.lng}););out center;`
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ]
  let elements: OsmElement[] | null = null
  let lastErr = ''
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: 'POST', body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'deal-radar/1.0 (personal project)',
      },
      signal: AbortSignal.timeout(60_000),
    }).catch(e => ({ ok: false as const, status: String(e), json: null as never }))
    if (res.ok) { elements = ((await res.json()) as { elements: OsmElement[] }).elements; break }
    lastErr = `Overpass HTTP ${res.status} at ${endpoint}`
  }
  if (!elements) throw new Error(lastErr || 'Overpass unavailable')
  const rows = matchBranches(
    [...unique.values()].map(m => ({ slug: m.merchant_slug, name: m.merchant_name })),
    elements, loc,
  ).map(r => ({ ...r, source: unique.get(r.slug)!.source })) // logo_url handled above
  const branches = rows.filter(r => r.lat != null && r.lng != null).map(r => ({
    source: r.source, slug: r.slug, lat: r.lat!, lng: r.lng!, branch_address: r.branch_address,
    last_seen: new Date().toISOString(),
  }))
  if (branches.length) {
    const { error: berr } = await db.from('store_branches').upsert(branches, { onConflict: 'source,slug,lat,lng' })
    if (berr) console.error('branch upsert failed:', berr.message)
  }
  if (branchesOnly) return
  const { error } = await db.from('stores').upsert(rows, { onConflict: 'source,slug' })
  if (error) throw new Error(`stores upsert failed: ${error.message}`)
}
