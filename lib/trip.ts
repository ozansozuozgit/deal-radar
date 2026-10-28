// Trip planning: which store(s) to visit for the list, weighing price against walking.
// Pure functions, unit-tested.
import { haversineMiles } from '@/lib/geo'
import type { CompareResult } from '@/lib/compare'

export interface LatLng { lat: number; lng: number }

export interface TripOption {
  key: string
  label: string
  slugs: string[] | null      // null = each item at its cheapest store
  stops: string[]             // stores actually visited, in walking order
  covered: number
  total: number
  savings: number
  walkMiles: number | null    // null when a store's location is unknown
  walkMinutes: number | null
  score: number               // total + walking time valued at `minuteValue`
  recommended: boolean
}

const WALK_MPH = 3
const DETOUR = 1.25 // streets aren't straight lines

/** Shortest-first round trip from home through `stops` (nearest neighbour, fine for ≤4 stops). */
export function walkingRoute(home: LatLng, stops: Array<LatLng & { slug: string }>): { order: string[]; miles: number } {
  const left = [...stops]
  const order: string[] = []
  let at: LatLng = home, miles = 0
  while (left.length) {
    let bi = 0, bd = Infinity
    left.forEach((s, i) => { const d = haversineMiles(at, s); if (d < bd) { bd = d; bi = i } })
    const [next] = left.splice(bi, 1)
    miles += bd; order.push(next.slug); at = next
  }
  if (order.length) miles += haversineMiles(at, home)
  return { order, miles: Math.round(miles * DETOUR * 100) / 100 }
}

export function tripOptions(
  result: CompareResult,
  locations: Map<string, LatLng>,
  home: LatLng | null,
  minuteValue = 0.25, // $15/hour
): TripOption[] {
  const make = (key: string, label: string, slugs: string[] | null, covered: number, total: number, savings: number): TripOption => {
    // the stores this plan sends you to (for "cheapest per item": wherever each best pick is)
    const used = slugs ?? [...new Set(result.items.flatMap(it => (it.bestPick ? [it.bestPick.deal.merchant_slug] : [])))]
    const located = used.map(slug => ({ slug, loc: locations.get(slug) }))
    let stops = used, walkMiles: number | null = null
    if (home && located.every(l => l.loc)) {
      const route = walkingRoute(home, located.map(l => ({ slug: l.slug, ...l.loc! })))
      stops = route.order; walkMiles = route.miles
    }
    const walkMinutes = walkMiles != null ? Math.round((walkMiles / WALK_MPH) * 60) : null
    return {
      key, label, slugs, stops, covered, total, savings, walkMiles, walkMinutes,
      score: Math.round((total + (walkMinutes ?? 0) * minuteValue) * 100) / 100,
      recommended: false,
    }
  }

  const options: TripOption[] = []
  for (const s of result.stores.slice(0, 5)) options.push(make(`1:${s.slug}`, s.name, [s.slug], s.matched, s.total, s.savings))
  for (const p of result.pairs.slice(0, 4)) {
    options.push(make(`2:${p.slugs.join('+')}`, `${p.names[0]} + ${p.names[1]}`, p.slugs, p.covered, p.total, p.savings))
  }
  const c = result.cheapest
  const cheapestStores = new Set(result.items.flatMap(it => (it.bestPick ? [it.bestPick.deal.merchant_slug] : []))).size
  if (cheapestStores > 2) {
    options.push(make('all', `Cheapest per item (${cheapestStores} stores)`, null, c.covered, c.total, c.savings))
  }
  if (!options.length) return []

  // recommend the lowest price-plus-walking among the plans that get the most items
  const maxCovered = Math.max(...options.map(o => o.covered))
  const best = options.filter(o => o.covered === maxCovered).sort((a, b) => a.score - b.score)[0]
  best.recommended = true
  return options.sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.covered - a.covered || a.score - b.score)
}
