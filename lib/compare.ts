// Shopping-list comparison over active deals. Pure functions, unit-tested.
import { toOz, type QtyUnit } from '@/lib/quantity'
import { canonicalize } from '@/lib/parse/canonical'

export interface CompareDeal {
  id?: number
  name: string; normalized_name: string
  merchant_slug: string; merchant_name: string
  price: number | null
  original_price?: number | null
  unit?: string | null                // 'lb' when the price is per pound
  size_qty?: number | null; size_unit?: string | null
  category?: string | null
  canonical?: string | null           // generic product, e.g. "chicken breast"
}

/** A list entry as the comparison sees it. A bare string means 1 of it. */
export interface CompareItem {
  text: string
  qty?: number
  unit?: QtyUnit | string | null
  pinnedDealId?: number | null
  rejectedDealIds?: number[]
}

export interface DealPick {
  deal: CompareDeal
  cost: number                  // for the wanted amount
  regularCost: number | null    // same amount at the regular price, when known
  packs: number                 // how many of the deal's units that is
}

export interface ItemResult {
  text: string
  best: CompareDeal | null            // the chosen match: pinned, else cheapest
  bestPick: DealPick | null
  matches: DealPick[]                     // every acceptable match, cheapest first
  byStore: Map<string, DealPick>          // cheapest acceptable match per store (pinned wins in its store)
}

export interface StoreTotal { slug: string; name: string; matched: number; total: number; savings: number }

export interface StorePlan { slugs: string[]; names: string[]; covered: number; total: number; savings: number }

export interface CompareResult {
  items: ItemResult[]
  stores: StoreTotal[]                                    // sorted: most matched, then cheapest
  bestSingle: StoreTotal | null
  bestPair: { slugs: [string, string]; names: [string, string]; covered: number; total: number; savings: number } | null
  pairs: StorePlan[]                                      // best few two-store splits
  cheapest: { covered: number; total: number; savings: number } // every item at its overall cheapest
}

const STOP = new Set(['the', 'a', 'of', 'and', 'or', 'fresh', 'organic'])

export function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .map(t => t.replace(/s$/, ''))
    .filter(t => t.length > 1 && !STOP.has(t))
}

/**
 * Deals that are the item, cheapest first. A deal matches when it's the same canonical
 * product ("hamburger meat" finds "Ground Chuck"), or when its name contains every
 * meaningful token of the item, unless it's known to be a different product that
 * merely mentions those words ("chicken breast" vs chicken-breast dog treats).
 */
export function matchesForItem<T extends CompareDeal>(itemText: string, deals: T[]): T[] {
  const m = itemMatcher(itemText)
  return deals
    .filter(d => d.price != null && m(d))
    .sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))
}

export interface MatchTarget { name: string; normalized_name?: string | null; canonical?: string | null }

/** A predicate for "this deal is that item", built once per item (see matchesForItem). */
export function itemMatcher(itemText: string): (d: MatchTarget) => boolean {
  const want = tokens(itemText)
  if (want.length === 0) return () => false
  const canon = canonicalize(itemText)
  return d => {
    if (canon && d.canonical === canon) return true
    const canonTokens = d.canonical ? new Set(tokens(d.canonical)) : null
    if (canonTokens && want.every(t => canonTokens.has(t))) return true
    const have = new Set(tokens(d.normalized_name || d.name))
    if (!want.every(t => have.has(t))) return false
    return !(canon && d.canonical && d.canonical !== canon)
  }
}

/**
 * What it costs to buy `qty unit` of an item with this deal. Per-pound deals scale
 * by weight; packaged deals round up to whole packages; counts multiply.
 */
export function pickFor(deal: CompareDeal, qty = 1, unit: QtyUnit | string | null = null): DealPick | null {
  if (deal.price == null) return null
  let packs = qty
  if (unit && unit in WANT_UNITS) {
    const want = toOz(qty, unit as QtyUnit)
    if (deal.unit === 'lb') {
      packs = want.base === 'oz' ? want.amount / 16 : qty
    } else if (deal.size_qty && deal.size_unit) {
      const have = deal.size_unit === 'lb' ? { amount: deal.size_qty * 16, base: 'oz' }
        : deal.size_unit === 'oz' ? { amount: deal.size_qty, base: 'oz' }
        : deal.size_unit === 'l' ? { amount: deal.size_qty, base: 'l' } : null
      // deal sizes and list amounts may mix metric and imperial volume; compare in ounces
      const oz = (v: { amount: number; base: string }) => (v.base === 'l' ? v.amount * L_TO_OZ : v.amount)
      // 2% slack so "1 lb" doesn't need two 15.9 oz packs
      packs = have ? Math.max(1, Math.ceil(oz(want) / oz(have) - 0.02)) : 1
    } else {
      packs = 1
    }
  }
  const cost = round2(deal.price * packs)
  const regularCost = deal.original_price != null && deal.original_price > deal.price
    ? round2(deal.original_price * packs) : null
  return { deal, cost, regularCost, packs: Math.round(packs * 100) / 100 }
}

/** Comparable price per pound, for weight-sold items; null when the size isn't a weight. */
export function pricePerLb(deal: Pick<CompareDeal, 'price' | 'unit' | 'size_qty' | 'size_unit'>): number | null {
  if (deal.price == null) return null
  if (deal.unit === 'lb') return deal.price
  if (!deal.size_qty || deal.size_qty <= 0) return null
  if (deal.size_unit === 'lb') return round2(deal.price / deal.size_qty)
  if (deal.size_unit === 'oz') return round2((deal.price / deal.size_qty) * 16)
  return null
}

const L_TO_OZ = 33.814
const WANT_UNITS = { lb: 1, oz: 1, kg: 1, g: 1, gal: 1, l: 1, ml: 1 }

function asItem(i: string | CompareItem): CompareItem { return typeof i === 'string' ? { text: i } : i }

export function compareList(itemInputs: Array<string | CompareItem>, deals: CompareDeal[]): CompareResult {
  const byId = new Map(deals.filter(d => d.id != null).map(d => [d.id!, d]))
  const items: ItemResult[] = itemInputs.map(asItem).map(it => {
    const rejected = new Set(it.rejectedDealIds ?? [])
    const matches = matchesForItem(it.text, deals)
      .filter(d => d.id == null || !rejected.has(d.id))
      .map(d => pickFor(d, it.qty ?? 1, it.unit ?? null)!)
      .sort((a, b) => a.cost - b.cost)
    const pinnedDeal = it.pinnedDealId != null ? byId.get(it.pinnedDealId) : undefined
    const pinned = pinnedDeal ? pickFor(pinnedDeal, it.qty ?? 1, it.unit ?? null) : null
    const all = pinned ? [pinned, ...matches.filter(m => m.deal !== pinned.deal)] : matches
    const byStore = new Map<string, DealPick>()
    if (pinned) byStore.set(pinned.deal.merchant_slug, pinned)
    for (const m of matches) if (!byStore.has(m.deal.merchant_slug)) byStore.set(m.deal.merchant_slug, m)
    const bestPick = pinned ?? matches[0] ?? null
    return { text: it.text, best: bestPick?.deal ?? null, bestPick, matches: all, byStore }
  })

  const storeNames = new Map<string, string>()
  for (const it of items) for (const [slug, p] of it.byStore) storeNames.set(slug, p.deal.merchant_name)

  const plan = (slugs: string[]) => {
    let covered = 0, total = 0, savings = 0
    for (const it of items) {
      let best: DealPick | undefined
      for (const s of slugs) {
        const p = it.byStore.get(s)
        if (p && (!best || p.cost < best.cost)) best = p
      }
      if (best) {
        covered++; total += best.cost
        if (best.regularCost != null) savings += best.regularCost - best.cost
      }
    }
    return { covered, total: round2(total), savings: round2(savings) }
  }

  const stores: StoreTotal[] = [...storeNames.entries()].map(([slug, name]) => {
    const p = plan([slug])
    return { slug, name, matched: p.covered, total: p.total, savings: p.savings }
  }).sort((a, b) => b.matched - a.matched || a.total - b.total)

  const pairs: StorePlan[] = []
  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      const p = plan([stores[i].slug, stores[j].slug])
      pairs.push({ slugs: [stores[i].slug, stores[j].slug], names: [stores[i].name, stores[j].name], ...p })
    }
  }
  pairs.sort((a, b) => b.covered - a.covered || a.total - b.total)
  const top = pairs[0]
  const bestPair = top
    ? { slugs: top.slugs as [string, string], names: top.names as [string, string], covered: top.covered, total: top.total, savings: top.savings }
    : null

  let cCovered = 0, cTotal = 0, cSavings = 0
  for (const it of items) {
    if (!it.bestPick) continue
    cCovered++; cTotal += it.bestPick.cost
    if (it.bestPick.regularCost != null) cSavings += it.bestPick.regularCost - it.bestPick.cost
  }

  return {
    items, stores, bestSingle: stores[0] ?? null, bestPair, pairs: pairs.slice(0, 8),
    cheapest: { covered: cCovered, total: round2(cTotal), savings: round2(cSavings) },
  }
}

/**
 * Which deal to buy for each item when shopping at `slugs` (null = each item at its
 * overall best). Items no chosen store has a deal for map to null.
 */
export function assignItems(result: CompareResult, slugs: string[] | null): Map<string, DealPick | null> {
  const out = new Map<string, DealPick | null>()
  for (const it of result.items) {
    if (!slugs) { out.set(it.text, it.bestPick); continue }
    let best: DealPick | null = null
    for (const s of slugs) {
      const p = it.byStore.get(s)
      if (p && (!best || p.cost < best.cost)) best = p
    }
    out.set(it.text, best)
  }
  return out
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
