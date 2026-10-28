import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { deviceId, subscription, listCode } = await req.json().catch(() => ({}))
  if (!deviceId || !subscription?.endpoint) return NextResponse.json({ error: 'deviceId and subscription required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('push_subscriptions')
    .upsert({
      device_id: String(deviceId), subscription,
      list_code: typeof listCode === 'string' && listCode ? listCode.toUpperCase() : null,
    }, { onConflict: 'device_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { deviceId } = await req.json().catch(() => ({}))
  if (!deviceId) return NextResponse.json({ error: 'deviceId required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('push_subscriptions').delete().eq('device_id', String(deviceId))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
