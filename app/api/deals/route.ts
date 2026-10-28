import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { parseDealsParams, searchFilter } from '@/lib/api/dealsQuery'
import { canonicalize } from '@/lib/parse/canonical'
import { DEAL_SELECT, toDealRecords } from '@/lib/api/dealRecords'
import { rankByHistory, type HistoryFields } from '@/lib/history'

export const dynamic = 'force-dynamic'

// data changes once a day; let the CDN absorb repeat reads
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

export async function GET(req: NextRequest) {
  const p = parseDealsParams(req.nextUrl.searchParams)
  const db = getServiceClient()
  const now = new Date().toISOString()
  const filtered = () => {
    let q = db.from('deals').select(DEAL_SELECT)
    if (p.ids) q = q.in('id', p.ids)
    else if (p.status === 'active') q = q.lte('valid_from', now).gte('valid_to', now)
    else q = q.gt('valid_from', now)
    if (p.stores) q = q.in('merchant_slug', p.stores)
    if (p.category) q = q.eq('category', p.category)
    if (p.q) q = q.or(searchFilter(p.q, canonicalize(p.q)))
    return q
  }
  let rows: Record<string, unknown>[]
  if (p.sort === 'best') {
    // history only knows some deals, so rank the "great" verdicts together with the
    // biggest discounts rather than whatever the first page by discount happens to be
    const [great, top] = await Promise.all([
      filtered().eq('price_verdict', 'great').limit(500),
      filtered().order('discount_pct', { ascending: false, nullsFirst: false }).limit(500),
    ])
    const error = great.error ?? top.error
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = rankByHistory([...(great.data ?? []), ...(top.data ?? [])] as Array<Record<string, unknown> & HistoryFields & { id: number }>).slice(0, p.limit)
  } else {
    let q = filtered()
    if (p.sort === 'price') q = q.order('price', { ascending: true, nullsFirst: false })
    else if (p.sort === 'ending') q = q.order('valid_to', { ascending: true, nullsFirst: false }).order('discount_pct', { ascending: false, nullsFirst: false })
    else q = q.order('discount_pct', { ascending: false, nullsFirst: false }).order('price', { ascending: true, nullsFirst: false })
    const { data, error } = await q.limit(p.limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = data ?? []
  }
  const deals = await toDealRecords(db, rows)
  return NextResponse.json({ deals }, { headers: CACHE })
}
