import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  const store = req.nextUrl.searchParams.get('store')?.trim()
  // the shopper's stores, for "cheaper this week" at the other ones
  const shops = (req.nextUrl.searchParams.get('shops') ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const db = getServiceClient()
  // newest first so a long history keeps its recent weeks, then oldest-first for the chart
  let q = db.from('deals')
    .select('valid_from, valid_to, price, original_price, price_text')
    .eq('normalized_name', name)
    .order('valid_from', { ascending: false })
    .limit(104)
  if (store) q = q.eq('merchant_slug', store)
  const now = new Date().toISOString()
  const othersQ = store && shops.length
    ? db.from('deals')
      .select('merchant_slug, price, unit, flyers!inner(merchant_name)')
      .eq('normalized_name', name).neq('merchant_slug', store).in('merchant_slug', shops)
      .not('price', 'is', null).lte('valid_from', now).gte('valid_to', now)
      .order('price', { ascending: true }).limit(20)
    : null
  const [{ data, error }, others] = await Promise.all([q, othersQ ?? Promise.resolve(null)])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // one point per week window
  const seen = new Set<string>()
  const points = (data ?? []).reverse().filter(d => {
    const key = `${d.valid_from}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  // cheapest running price per other store
  const byStore = new Map<string, { merchant_slug: string; merchant_name: string; price: number; unit: string | null }>()
  for (const o of others?.data ?? []) {
    const flyer = (o as { flyers?: { merchant_name?: string } }).flyers
    if (!byStore.has(o.merchant_slug)) {
      byStore.set(o.merchant_slug, { merchant_slug: o.merchant_slug, merchant_name: flyer?.merchant_name ?? o.merchant_slug, price: Number(o.price), unit: o.unit })
    }
  }
  return NextResponse.json({ points, others: [...byStore.values()] })
}
