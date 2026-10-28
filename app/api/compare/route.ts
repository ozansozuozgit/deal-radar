import { NextRequest, NextResponse } from 'next/server'
import { fetchAll, getServiceClient } from '@/lib/db'
import { matchesForItem, type CompareDeal } from '@/lib/compare'
import { canonicalize } from '@/lib/parse/canonical'

export const dynamic = 'force-dynamic'

const COLUMNS = 'id, name, normalized_name, canonical, merchant_slug, price, original_price, unit, size_qty, size_unit, category, flyers!inner(merchant_name)'

/**
 * Shopping-list matching needs every active priced deal, not just the top 500 by
 * discount that /api/deals can return. Match server-side and send back only the
 * deals that hit some list item (plus any pinned ones); the client runs
 * compareList() over those.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(body.items) ? body.items.slice(0, 100) : []
  const items: string[] = raw
    .map(i => (typeof i === 'string' ? i : typeof (i as { text?: unknown })?.text === 'string' ? (i as { text: string }).text : ''))
    .filter(t => !!t.trim())
  const pinnedIds: number[] = raw
    .map(i => Number((i as { pinnedDealId?: unknown })?.pinnedDealId))
    .filter(n => Number.isInteger(n) && n > 0)
  const stores: string[] = (Array.isArray(body.stores) ? body.stores : [])
    .filter((s: unknown): s is string => typeof s === 'string' && !!s)
  if (!items.length) return NextResponse.json({ deals: [] })

  const db = getServiceClient()
  const now = new Date().toISOString()
  type Row = Omit<CompareDeal, 'merchant_name'> & { flyers?: { merchant_name?: string } | null }
  const flatten = ({ flyers, ...d }: Row): CompareDeal => ({ ...d, merchant_name: flyers?.merchant_name ?? d.merchant_slug })
  let rows: Row[]
  try {
    rows = await fetchAll<Row>((from, to) => {
      let q = db.from('deals').select(COLUMNS)
        .not('price', 'is', null).lte('valid_from', now).gte('valid_to', now)
      if (stores.length) q = q.in('merchant_slug', stores)
      return q.order('id').range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'query failed' }, { status: 500 })
  }
  const all = rows.map(flatten)
  const hit = new Set<CompareDeal>()
  for (const item of items) for (const d of matchesForItem(item, all)) hit.add(d)
  // pinned deals count even when they don't match by name or sit outside the radius,
  // as long as they're still running
  const have = new Set([...hit].map(d => d.id))
  const missing = pinnedIds.filter(id => !have.has(id))
  if (missing.length) {
    const { data } = await db.from('deals').select(COLUMNS).in('id', missing).gte('valid_to', now)
    for (const r of (data ?? []) as unknown as Row[]) hit.add(flatten(r))
  }
  // typical prices and sale cycles, so items without a deal can say when one usually comes
  const canon = [...new Set(items.map(canonicalize).filter((c): c is string => !!c))]
  const { data: stats } = canon.length
    ? await db.from('price_stats').select('canonical, basis, median, p25, low, samples, stores, cycle_days, last_sale').in('canonical', canon)
    : { data: [] }
  return NextResponse.json({ deals: [...hit], stats: stats ?? [] })
}
