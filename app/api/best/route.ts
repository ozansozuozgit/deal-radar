import { NextRequest, NextResponse } from 'next/server'
import { excludeSkipped } from '@/config/stores'
import { fetchAll, getServiceClient } from '@/lib/db'
import { sanitizeSearch, searchFilter } from '@/lib/api/dealsQuery'
import { DEAL_SELECT, toDealRecords } from '@/lib/api/dealRecords'
import { canonicalize } from '@/lib/parse/canonical'
import { hiddenMatchers, isHidden } from '@/lib/foryou'
import { bestPriceByStore, prefilterTerm, type BestDeal } from '@/lib/bestPrice'

export const dynamic = 'force-dynamic'
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

/**
 * Where an item is cheapest this week: ?q=chicken%20breast&stores=a,b
 * The cheapest matching deal at each store, compared per lb / gal / item, cheapest first.
 * Reads every running match rather than the feed's top page, so no store is missed.
 */
export async function GET(req: NextRequest) {
  const q = sanitizeSearch(req.nextUrl.searchParams.get('q'))
  const stores = (req.nextUrl.searchParams.get('stores') ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
  // "not interested" products stay out of the comparison, as they do in the feed
  const hidden = hiddenMatchers(req.nextUrl.searchParams.getAll('hide').map(t => t.trim()).filter(Boolean).slice(0, 200))
  const term = q ? prefilterTerm(q) : null
  if (!q || !term) return NextResponse.json({ basis: null, stores: [], otherBasis: [] })

  const db = getServiceClient()
  const now = new Date().toISOString()
  let rows: Array<Record<string, unknown>>
  try {
    rows = await fetchAll<Record<string, unknown>>((from, to) => {
      let query = excludeSkipped(db.from('deals').select(DEAL_SELECT))
        .not('price', 'is', null).lte('valid_from', now).gte('valid_to', now)
        // broad first pass on the longest word; the matcher below decides what really is the item
        .or(searchFilter(term, canonicalize(q)))
      if (stores.length) query = query.in('merchant_slug', stores)
      return query.order('id').range(from, to) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>
    }, { max: 5000 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'query failed' }, { status: 500 })
  }
  const deals = (await toDealRecords(db, rows)) as unknown as BestDeal[]
  const regular = await catalogPrices(db, term, canonicalize(q), stores)
  return NextResponse.json(bestPriceByStore(q, [...deals, ...regular], d => isHidden(d, hidden)), { headers: CACHE })
}

/** Catalog prices this old are taken as gone: the bookmark refreshes them on every press. */
const CATALOG_FRESH_DAYS = 14

/**
 * Everyday prices from stores that send their whole catalog, shaped like deals. A sale on the
 * same item is cheaper, so it still wins that store's row. Before the catalog_prices table
 * exists the query fails, and best price carries on with deals alone.
 */
async function catalogPrices(db: ReturnType<typeof getServiceClient>, term: string, canonical: string | null, stores: string[]): Promise<BestDeal[]> {
  const since = new Date(Date.now() - CATALOG_FRESH_DAYS * 86_400_000).toISOString()
  let rows: Array<Record<string, unknown>>
  try {
    // every match, a page at a time: one select stops at 1,000 rows, and the cheapest may be past it
    rows = await fetchAll<Record<string, unknown>>((from, to) => {
      let query = excludeSkipped(db.from('catalog_prices').select('*'))
        .gte('last_seen', since).or(searchFilter(term, canonical))
      if (stores.length) query = query.in('merchant_slug', stores)
      return query.order('id').range(from, to) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>
    }, { max: 5000 })
  } catch {
    return []
  }
  if (!rows.length) return []
  return (await toDealRecords(db, rows)).map((r, i) => ({
    ...r,
    merchant_name: rows[i].merchant_name,   // the row's own; there's no flyer to take it from
    flyer_external_id: 'catalog',
    id: -Number(r.id),            // never the same as a deal's id
    description: 'Regular price, not on sale',
    original_price: null, prime_price: null, price_text: null, sale_story: null, crop: null,
    valid_from: null, valid_to: null, discount_pct: null,
    regular: true,
  })) as unknown as BestDeal[]
}
