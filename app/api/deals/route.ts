import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { ilikeAny, parseDealsParams } from '@/lib/api/dealsQuery'

export const dynamic = 'force-dynamic'

// data changes once a day; let the CDN absorb repeat reads
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

export async function GET(req: NextRequest) {
  const p = parseDealsParams(req.nextUrl.searchParams)
  const db = getServiceClient()
  const now = new Date().toISOString()
  let q = db.from('deals').select('*, flyers!inner(merchant_name, external_id)')
  if (p.ids) q = q.in('id', p.ids)
  else if (p.status === 'active') q = q.lte('valid_from', now).gte('valid_to', now)
  else q = q.gt('valid_from', now)
  if (p.stores) q = q.in('merchant_slug', p.stores)
  if (p.category) q = q.eq('category', p.category)
  if (p.q) q = q.or(ilikeAny(['name', 'normalized_name'], p.q))
  if (p.sort === 'price') q = q.order('price', { ascending: true, nullsFirst: false })
  else if (p.sort === 'ending') q = q.order('valid_to', { ascending: true, nullsFirst: false }).order('discount_pct', { ascending: false, nullsFirst: false })
  else q = q.order('discount_pct', { ascending: false, nullsFirst: false }).order('price', { ascending: true, nullsFirst: false })
  const { data, error } = await q.limit(p.limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: stores } = await db.from('stores').select('slug, distance_miles, logo_url')
  const bySlug = new Map((stores ?? []).map(s => [s.slug, s]))
  const deals = (data ?? []).map(d => {
    const flyer = (d as { flyers?: { merchant_name?: string; external_id?: string } }).flyers
    return {
      ...d,
      merchant_name: flyer?.merchant_name ?? d.merchant_slug,
      flyer_external_id: flyer?.external_id ?? null,
      distance_miles: bySlug.get(d.merchant_slug)?.distance_miles ?? null,
      merchant_logo: bySlug.get(d.merchant_slug)?.logo_url ?? null,
      flyers: undefined,
    }
  })
  return NextResponse.json({ deals }, { headers: CACHE })
}
