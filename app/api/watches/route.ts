import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { deviceId, term, maxPrice } = await req.json().catch(() => ({}))
  if (!deviceId || !term) return NextResponse.json({ error: 'deviceId and term required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('watches').upsert({
    device_id: String(deviceId), term: String(term).toLowerCase().slice(0, 80),
    max_price: typeof maxPrice === 'number' ? maxPrice : null,
  }, { onConflict: 'device_id,term' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { deviceId, term } = await req.json().catch(() => ({}))
  if (!deviceId || !term) return NextResponse.json({ error: 'deviceId and term required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('watches').delete().eq('device_id', String(deviceId)).eq('term', String(term).toLowerCase())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
