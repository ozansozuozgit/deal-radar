// "For you": deals picked from what Ozan actually buys. Pure, unit-tested; the API and
// the weekly digest both use it.
import { itemMatcher, type CompareDeal, type MatchTarget } from '@/lib/compare'

export type Reason = 'list' | 'watch' | 'bought' | 'great'
export interface Signal { term: string; reason: Exclude<Reason, 'great'> }
export interface ForYouDeal extends CompareDeal {
  id: number
  price_verdict?: string | null
  discount_pct?: number | null
}
export interface ForYouPick<T extends ForYouDeal> { deal: T; reason: Reason; term: string | null }

const PRIORITY: Record<Signal['reason'], number> = { list: 0, watch: 1, bought: 2 }

/** Is this deal something the user said they're not interested in? */
export function isHidden(deal: MatchTarget, hidden: Array<(d: MatchTarget) => boolean>): boolean {
  return hidden.some(m => m(deal))
}

export function hiddenMatchers(terms: string[]) { return terms.map(itemMatcher) }

export function pickForYou<T extends ForYouDeal>(
  signals: Signal[],
  deals: T[],
  hiddenTerms: string[],
  { perTerm = 2, limit = 24, greatCategories = [] as string[] } = {},
): Array<ForYouPick<T>> {
  const hidden = hiddenMatchers(hiddenTerms)
  const visible = deals.filter(d => d.price != null && !isHidden(d, hidden))
  const used = new Set<number>()
  const picks: Array<ForYouPick<T>> = []
  const seenTerms = new Set<string>()
  const ordered = [...signals].sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason])
  for (const s of ordered) {
    const term = s.term.trim().toLowerCase()
    if (!term || seenTerms.has(term)) continue
    seenTerms.add(term)
    const m = itemMatcher(term)
    const hits = visible.filter(d => !used.has(d.id) && m(d))
      // great prices first, then cheapest
      .sort((a, b) => Number(b.price_verdict === 'great') - Number(a.price_verdict === 'great') || (a.price ?? 0) - (b.price ?? 0))
      .slice(0, perTerm)
    for (const d of hits) { used.add(d.id); picks.push({ deal: d, reason: s.reason, term }) }
  }
  // then genuinely good prices in the categories you buy from
  const cats = new Set(greatCategories)
  const great = visible
    .filter(d => !used.has(d.id) && d.price_verdict === 'great' && (!cats.size || (d.category && cats.has(d.category))))
    .sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0))
  for (const d of great) {
    if (picks.length >= limit) break
    used.add(d.id); picks.push({ deal: d, reason: 'great', term: null })
  }
  return picks.slice(0, limit)
}
