// How good a deal is against its own price history. Pure, unit-tested.

export interface HistoryFields {
  price: number | null
  unit?: string | null
  discount_pct?: number | null
  hist_min_price?: number | null; hist_weeks?: number | null
  cmp_price?: number | null; cmp_basis?: string | null
  typical_price?: number | null; price_verdict?: string | null
}

/** At or below the lowest price this store has charged, over at least a month of flyers. */
export function isHistoricalLow(deal: HistoryFields): boolean {
  return deal.price != null && deal.hist_min_price != null
    && (deal.hist_weeks ?? 0) >= 4 && deal.price <= deal.hist_min_price
}

/**
 * The usual sale price around here, but only when it's on the same basis as the
 * shown price (per item, or per lb for priced-by-weight deals), so "usually $X"
 * can sit next to the price without a unit mismatch.
 */
export function usualPrice(deal: HistoryFields): number | null {
  if (deal.typical_price == null || deal.price == null || !deal.price_verdict) return null
  const sameBasis = deal.cmp_basis === 'ea' || (deal.cmp_basis === 'lb' && deal.unit === 'lb')
  if (!sameBasis || deal.typical_price <= deal.price) return null
  return Number(deal.typical_price)
}

/** The one badge a card shows, strongest first. */
export type Signal = { kind: 'low'; weeks: number } | { kind: 'great' } | null
export function dealSignal(deal: HistoryFields): Signal {
  if (isHistoricalLow(deal)) return { kind: 'low', weeks: deal.hist_weeks ?? 0 }
  if (deal.price_verdict === 'great') return { kind: 'great' }
  return null
}

/**
 * Score for the "Best vs history" sort. A record low or a "great" verdict outranks a
 * big claimed discount, because stores inflate "regular" prices; the discount only
 * breaks ties between deals history says nothing about.
 */
export function historyScore(deal: HistoryFields): number {
  let s = 0
  if (isHistoricalLow(deal)) s += 3 + Math.min((deal.hist_weeks ?? 0) / 8, 2)
  if (deal.price_verdict === 'great') s += 3
  else if (deal.price_verdict === 'weak') s -= 2
  const cmp = deal.cmp_price != null ? Number(deal.cmp_price) : null
  const typical = deal.typical_price != null ? Number(deal.typical_price) : null
  // a verdict is only set when the deal's basis matches the product's history (see refresh_price_stats)
  if (deal.price_verdict && cmp != null && typical != null && typical > 0) s += Math.max(-2.5, Math.min(2.5, (1 - cmp / typical) * 5))
  s += Math.min(deal.discount_pct ?? 0, 80) / 25
  return s
}

export function rankByHistory<T extends HistoryFields & { id: number }>(deals: T[]): T[] {
  const seen = new Set<number>()
  return deals
    .filter(d => !seen.has(d.id) && seen.add(d.id))
    .map(d => ({ d, s: historyScore(d) }))
    .sort((a, b) => b.s - a.s || (a.d.price ?? Infinity) - (b.d.price ?? Infinity))
    .map(x => x.d)
}
