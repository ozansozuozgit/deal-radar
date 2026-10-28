import { NextRequest, NextResponse } from 'next/server'
import { fetchAll, getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COLUMNS = 'id, text, deal_id, name, merchant_slug, merchant_name, category, qty, unit, cost, regular_cost, bought_at'

/** Purchases for a list over the last `days` (default 180), newest first. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 180, 1), 730)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const db = getServiceClient()
  try {
    const rows = await fetchAll((from, to) => db.from('purchases').select(COLUMNS)
      .eq('list_code', code).gte('bought_at', since)
      .order('bought_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    { max: 5000 })
    return NextResponse.json({ purchases: rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'query failed' }, { status: 500 })
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown, max = 160) => (typeof v === 'string' && v ? v.slice(0, max) : null)

/** Record a finished trip: { code, items: [{ text, dealId?, name?, merchantSlug?, ... }] } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : null
  const items: Record<string, unknown>[] = Array.isArray(body.items) ? body.items.slice(0, 200) : []
  if (!code || !items.length) return NextResponse.json({ error: 'code and items required' }, { status: 400 })
  const rows = items.filter(i => typeof i?.text === 'string' && i.text).map(i => ({
    list_code: code,
    text: str(i.text, 120)!,
    deal_id: Number.isInteger(i.dealId) ? i.dealId : null,
    name: str(i.name), merchant_slug: str(i.merchantSlug, 80), merchant_name: str(i.merchantName, 80),
    category: str(i.category, 40),
    qty: num(i.qty) ?? 1, unit: str(i.unit, 8),
    cost: num(i.cost), regular_cost: num(i.regularCost),
  }))
  const db = getServiceClient()
  const { error } = await db.from('purchases').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: rows.length })
}

/** Undo one logged purchase: { code, id } */
export async function DELETE(req: NextRequest) {
  const { code, id } = await req.json().catch(() => ({}))
  if (!code || !Number.isInteger(id)) return NextResponse.json({ error: 'code and id required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('purchases').delete().eq('list_code', String(code).toUpperCase()).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
