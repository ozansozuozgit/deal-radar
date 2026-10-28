import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { haversineMiles } from '@/lib/geo'

export const dynamic = 'force-dynamic'

// data changes once a day; let the CDN absorb repeat reads
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

export async function GET(req: NextRequest) {
  // distances from where the viewer is, when given; otherwise from the ingest location
  const lat = Number(req.nextUrl.searchParams.get('lat'))
  const lng = Number(req.nextUrl.searchParams.get('lng'))
  const from = req.nextUrl.searchParams.has('lat') && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  const db = getServiceClient()
  const now = new Date().toISOString()
  const [{ data: stores }, { data: runs }] = await Promise.all([
    db.from('stores').select('slug, name, distance_miles, logo_url, lat, lng, branch_address'),
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
    stores: (stores ?? []).map(s => ({
      ...s,
      distance_miles: from && s.lat != null && s.lng != null
        ? Math.round(haversineMiles(from, { lat: s.lat, lng: s.lng }) * 100) / 100
        : s.distance_miles,
      deal_count: counts.get(s.slug) ?? 0,
    }))
      .filter(s => s.deal_count > 0)
      .sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99)),
    freshness: [...latestBySource.values()],
  }, { headers: CACHE })
}
