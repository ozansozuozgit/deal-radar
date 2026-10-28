import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

// data changes once a day; let the CDN absorb repeat reads
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

export async function GET() {
  const db = getServiceClient()
  const now = new Date().toISOString()
  const [{ data: stores }, { data: runs }] = await Promise.all([
    db.from('stores').select('slug, name, distance_miles, logo_url'),
    db.from('ingest_runs').select('source, finished_at, deal_count, error').order('id', { ascending: false }).limit(9),
  ])
  // per-store head counts: a plain select of all active deals silently truncates
  // at PostgREST's 1000-row cap and undercounts
  const counts = new Map<string, number>()
  await Promise.all((stores ?? []).map(async s => {
    const { count } = await db.from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_slug', s.slug)
      .lte('valid_from', now).gte('valid_to', now)
    counts.set(s.slug, count ?? 0)
  }))
  const latestBySource = new Map<string, NonNullable<typeof runs>[number]>()
  for (const r of runs ?? []) if (!latestBySource.has(r.source)) latestBySource.set(r.source, r)
  return NextResponse.json({
    stores: (stores ?? []).map(s => ({ ...s, deal_count: counts.get(s.slug) ?? 0 }))
      .filter(s => s.deal_count > 0)
      .sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99)),
    freshness: [...latestBySource.values()],
  }, { headers: CACHE })
}
