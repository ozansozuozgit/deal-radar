import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** The last alerts sent to this device, newest first. */
export async function GET(req: NextRequest) {
  const device = req.nextUrl.searchParams.get('device')
  if (!device) return NextResponse.json({ error: 'device required' }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from('notified').select('title, body, url, created_at')
    .eq('device_id', device).not('title', 'is', null)
    .order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}
