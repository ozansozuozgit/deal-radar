import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { nearestBranches } from '@/lib/places'

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
  const [{ data: stores }, { data: branches }, { data: runs }, { data: lastOk }] = await Promise.all([
    db.from('stores').select('slug, name, distance_miles, logo_url, lat, lng, branch_address'),
    // missing until the saved-places migration runs; then every scanned branch counts
    db.from('store_branches').select('slug, lat, lng, branch_address'),
    db.from('ingest_runs').select('source, finished_at, deal_count, error').order('id', { ascending: false }).limit(9),
    // newest successful run of any source, however far back: lets the app warn when
    // every recent scan has failed (the per-source rows above would all be errors)
    db.from('ingest_runs').select('finished_at').is('error', null).not('finished_at', 'is', null)
      .order('finished_at', { ascending: false }).limit(1),
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
  // distance to the nearest branch of each chain from where the viewer is
  const nearest = from ? nearestBranches(from, [
    ...(branches ?? []),
    ...(stores ?? []).flatMap(s => (s.lat != null && s.lng != null ? [{ slug: s.slug, lat: s.lat, lng: s.lng, branch_address: s.branch_address }] : [])),
  ]) : null
  return NextResponse.json({
    stores: (stores ?? []).map(s => {
      const b = nearest?.get(s.slug)
      return {
        ...s,
        ...(b ? { lat: b.lat, lng: b.lng, branch_address: b.branch_address ?? null, distance_miles: b.miles } : {}),
        deal_count: counts.get(s.slug) ?? 0,
      }
    })
      .filter(s => s.deal_count > 0)
      .sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99)),
    freshness: [...latestBySource.values()],
    lastSuccess: lastOk?.[0]?.finished_at ?? null,
  }, { headers: CACHE })
}
