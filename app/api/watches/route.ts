import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

// `owner` is a device id, or "list:CODE" for watches shared by every device on a list.
// `deviceId` is the older name for the same field.
function ownerOf(body: { owner?: unknown; deviceId?: unknown }): string | null {
  const o = body.owner ?? body.deviceId
  return typeof o === 'string' && o ? o.slice(0, 80) : null
}

export async function GET(req: NextRequest) {
  const owner = ownerOf({ owner: req.nextUrl.searchParams.get('owner') ?? undefined })
  if (!owner) return NextResponse.json({ error: 'owner required' }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from('watches').select('term, max_price, price_basis')
    .eq('device_id', owner).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ watches: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const owner = ownerOf(body)
  if (!owner || !body.term) return NextResponse.json({ error: 'owner and term required' }, { status: 400 })
  const maxPrice = typeof body.maxPrice === 'number' && body.maxPrice > 0 ? body.maxPrice : null
  const db = getServiceClient()
  const { error } = await db.from('watches').upsert({
    device_id: owner, term: String(body.term).toLowerCase().slice(0, 80),
    max_price: maxPrice, price_basis: body.basis === 'lb' ? 'lb' : 'item',
  }, { onConflict: 'device_id,term' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const owner = ownerOf(body)
  if (!owner || !body.term) return NextResponse.json({ error: 'owner and term required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('watches').delete().eq('device_id', owner).eq('term', String(body.term).toLowerCase())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
