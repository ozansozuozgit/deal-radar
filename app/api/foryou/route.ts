import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { activeDeals, forYouFor, loadProfile } from '@/lib/api/forYouServer'
import { DEAL_SELECT, toDealRecords } from '@/lib/api/dealRecords'

export const dynamic = 'force-dynamic'

/** Deals picked from your list, watches and purchases: { code, stores } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : null
  const stores: string[] = (Array.isArray(body.stores) ? body.stores : []).filter((s: unknown): s is string => typeof s === 'string' && !!s)
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const db = getServiceClient()
  try {
    const [profile, deals] = await Promise.all([loadProfile(db, code), activeDeals(db, stores)])
    const picks = forYouFor(profile, deals)
    if (!picks.length) return NextResponse.json({ items: [] })
    const { data, error } = await db.from('deals').select(DEAL_SELECT).in('id', picks.map(p => p.deal.id))
    if (error) throw new Error(error.message)
    const full = new Map((await toDealRecords(db, data ?? [])).map(d => [d.id as number, d]))
    return NextResponse.json({
      items: picks.flatMap(p => (full.has(p.deal.id) ? [{ deal: full.get(p.deal.id), reason: p.reason, term: p.term }] : [])),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'query failed' }, { status: 500 })
  }
}
