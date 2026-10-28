import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COLUMNS = 'id, label, address, lat, lng, zip, radius_miles'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from('places').select(COLUMNS).eq('list_code', code).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ places: data ?? [] })
}

/** Save a place by label (adding or updating): { code, label, address, lat, lng, zip?, radius } */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const lat = Number(b.lat), lng = Number(b.lng), radius = Number(b.radius)
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 40) : ''
  if (typeof b.code !== 'string' || !label || typeof b.address !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'code, label, address, lat and lng required' }, { status: 400 })
  }
  const db = getServiceClient()
  const { data, error } = await db.from('places').upsert({
    list_code: b.code.toUpperCase(), label, address: b.address.slice(0, 200), lat, lng,
    zip: typeof b.zip === 'string' ? b.zip.slice(0, 10) : null,
    radius_miles: Number.isFinite(radius) && radius > 0 ? Math.min(radius, 25) : 1.5,
  }, { onConflict: 'list_code,label' }).select(COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ place: data })
}

export async function DELETE(req: NextRequest) {
  const { code, id } = await req.json().catch(() => ({}))
  if (typeof code !== 'string' || !Number.isInteger(id)) return NextResponse.json({ error: 'code and id required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('places').delete().eq('list_code', code.toUpperCase()).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
