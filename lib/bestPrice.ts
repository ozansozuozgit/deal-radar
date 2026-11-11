// "Where is chicken breast cheapest this week?" Pure functions, unit-tested.
import { itemMatcher, tokens, type MatchTarget } from '@/lib/compare'
import { comparablePrice } from '@/lib/ingest/upsert'

export type Basis = 'lb' | 'gal' | 'ct' | 'ea'

export interface BestDeal extends MatchTarget {
  id: number
  merchant_slug: string; merchant_name: string
  price: number | null
  unit?: string | null
  size_qty?: number | null; size_unit?: string | null
  cmp_price?: number | null; cmp_basis?: string | null
}

export interface StoreBest<T extends BestDeal = BestDeal> {
  slug: string; name: string
  deal: T
  unitPrice: number          // on the comparison's basis
  vsBest: number             // how much more than the cheapest store, per unit (0 for the cheapest)
  others: number             // other matching deals at this store
}

export interface BestPrice<T extends BestDeal = BestDeal> {
  basis: Basis | null        // what the prices are per: lb, gal, ct (per item), ea (per package)
  stores: StoreBest<T>[]     // cheapest first
  otherBasis: T[]            // matches sold a way that doesn't compare (e.g. per package when the rest are per lb)
}

const BASES: Basis[] = ['lb', 'gal', 'ct', 'ea']

/** A deal's price per unit, from the stored comparable price or worked out from its size. */
export function unitPriceOf(d: BestDeal): { price: number; basis: Basis } | null {
  if (d.price == null || d.price <= 0) return null
  if (d.cmp_price != null && d.cmp_basis && (BASES as string[]).includes(d.cmp_basis)) {
    return { price: Number(d.cmp_price), basis: d.cmp_basis as Basis }
  }
  const size = d.unit === 'lb' ? { qty: 1, unit: 'lb' as const }
    : d.size_qty && d.size_unit ? { qty: Number(d.size_qty), unit: d.size_unit as 'lb' } : null
  const c = comparablePrice(d.price, size)
  return c.cmp_price != null && c.cmp_basis ? { price: c.cmp_price, basis: c.cmp_basis as Basis } : null
}

/**
 * The cheapest matching deal at each store, compared per unit. Stores are compared on the
 * one basis most of them sell the item by (chicken breast is per lb, eggs per item), so a
 * $6 three-pound bag beats a $2.49/lb tray only when it really is cheaper per pound.
 * Weight wins a tie, since that's the fairest comparison.
 */
export function bestPriceByStore<T extends BestDeal>(item: string, deals: T[], exclude: (d: T) => boolean = () => false): BestPrice<T> {
  const matches = itemMatcher(item)
  const priced = deals
    .filter(d => matches(d) && !exclude(d))
    .map(d => ({ d, u: unitPriceOf(d) }))
    .filter((x): x is { d: T; u: { price: number; basis: Basis } } => x.u != null)
  if (!priced.length) return { basis: null, stores: [], otherBasis: [] }

  const storesBy = new Map<Basis, Set<string>>()
  for (const { d, u } of priced) {
    if (!storesBy.has(u.basis)) storesBy.set(u.basis, new Set())
    storesBy.get(u.basis)!.add(d.merchant_slug)
  }
  const basis = BASES.filter(b => storesBy.has(b))
    .sort((a, b) => storesBy.get(b)!.size - storesBy.get(a)!.size)[0]

  const best = new Map<string, { d: T; price: number; count: number }>()
  for (const { d, u } of priced) {
    if (u.basis !== basis) continue
    const cur = best.get(d.merchant_slug)
    if (!cur) best.set(d.merchant_slug, { d, price: u.price, count: 1 })
    else {
      cur.count++
      if (u.price < cur.price) { cur.d = d; cur.price = u.price }
    }
  }
  const sorted = [...best.values()].sort((a, b) => a.price - b.price)
  const low = sorted[0].price
  const stores = sorted.map(({ d, price, count }) => ({
    slug: d.merchant_slug, name: d.merchant_name, deal: d,
    unitPrice: price, vsBest: round2(price - low), others: count - 1,
  }))
  const otherBasis = priced.filter(x => x.u.basis !== basis)
    .sort((a, b) => a.u.price - b.u.price).map(x => x.d)
  return { basis, stores, otherBasis }
}

/** "/lb", "/gal", " each" — how a unit price reads next to its number. */
export function basisLabel(basis: Basis | null): string {
  return basis === 'lb' ? '/lb' : basis === 'gal' ? '/gal' : basis === 'ct' ? ' each' : ''
}

/**
 * The longest meaningful word of the search, for a broad first pass in the database.
 * Words the matcher ignores ("organic", "fresh") are skipped, so the pass never drops a match.
 */
export function prefilterTerm(item: string): string | null {
  const words = item.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => tokens(w).length > 0)
  if (!words.length) return null
  // match the singular, so "breasts" still finds "breast"
  return words.sort((a, b) => b.length - a.length)[0].replace(/(?<=\w{3})e?s$/, '')
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
