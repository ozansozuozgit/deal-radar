import { NextRequest, NextResponse } from 'next/server'
import { fetchAll, getServiceClient } from '@/lib/db'
import { matchesForItem, type CompareDeal } from '@/lib/compare'

export const dynamic = 'force-dynamic'

/**
 * Shopping-list matching needs every active priced deal, not just the top 500 by
 * discount that /api/deals can return. Match server-side and send back only the
 * deals that hit some list item; the client runs compareList() over those.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const items: string[] = (Array.isArray(body.items) ? body.items : [])
    .filter((t: unknown): t is string => typeof t === 'string' && !!t.trim()).slice(0, 100)
  const stores: string[] = (Array.isArray(body.stores) ? body.stores : [])
    .filter((s: unknown): s is string => typeof s === 'string' && !!s)
  if (!items.length) return NextResponse.json({ deals: [] })

  const db = getServiceClient()
  const now = new Date().toISOString()
  type Row = Omit<CompareDeal, 'merchant_name'> & { flyers?: { merchant_name?: string } | null }
  let rows: Row[]
  try {
    rows = await fetchAll<Row>((from, to) => {
      let q = db.from('deals')
        .select('id, name, normalized_name, merchant_slug, price, flyers!inner(merchant_name)')
        .not('price', 'is', null).lte('valid_from', now).gte('valid_to', now)
      if (stores.length) q = q.in('merchant_slug', stores)
      return q.order('id').range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'query failed' }, { status: 500 })
  }
  const all: CompareDeal[] = rows.map(({ flyers, ...d }) => ({ ...d, merchant_name: flyers?.merchant_name ?? d.merchant_slug }))
  const hit = new Set<CompareDeal>()
  for (const item of items) for (const d of matchesForItem(item, all)) hit.add(d)
  return NextResponse.json({ deals: [...hit] })
}
