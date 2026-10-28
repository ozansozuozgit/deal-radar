import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineMiles } from '@/lib/geo'

export interface Place {
  id: number; list_code: string; label: string; address: string
  lat: number; lng: number; zip: string | null; radius_miles: number
}
export interface Branch { slug: string; lat: number; lng: number; branch_address?: string | null }

/** Nearest known branch of each chain to `from`. */
export function nearestBranches(from: { lat: number; lng: number }, branches: Branch[]): Map<string, Branch & { miles: number }> {
  const out = new Map<string, Branch & { miles: number }>()
  for (const b of branches) {
    const miles = Math.round(haversineMiles(from, b) * 100) / 100
    const cur = out.get(b.slug)
    if (!cur || miles < cur.miles) out.set(b.slug, { ...b, miles })
  }
  return out
}

/** Places worth scanning beyond the default location: distinct, capped. */
export function placesToScan(places: Array<Pick<Place, 'lat' | 'lng' | 'zip'>>, home: { lat: number; lng: number }, max = 5) {
  const picked: Array<Pick<Place, 'lat' | 'lng' | 'zip'>> = []
  for (const p of places) {
    if (haversineMiles(home, p) < 1) continue
    if (picked.some(q => haversineMiles(q, p) < 1)) continue
    picked.push(p)
    if (picked.length >= max) break
  }
  return picked
}

/** Store slugs within any of this code's places' radius; null when it has no places. */
export async function storesForCode(db: SupabaseClient, code: string): Promise<Set<string> | null> {
  const { data: places } = await db.from('places').select('lat, lng, radius_miles').eq('list_code', code)
  if (!places?.length) return null
  const [{ data: branches }, { data: stores }] = await Promise.all([
    db.from('store_branches').select('slug, lat, lng'),
    db.from('stores').select('slug, lat, lng'),
  ])
  const all: Branch[] = [...(branches ?? []), ...(stores ?? []).filter(s => s.lat != null && s.lng != null)]
  const out = new Set<string>()
  for (const p of places) {
    for (const [slug, b] of nearestBranches(p, all)) if (b.miles <= Number(p.radius_miles)) out.add(slug)
  }
  return out
}
