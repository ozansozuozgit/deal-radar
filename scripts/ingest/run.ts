import 'dotenv/config'
import { getServiceClient } from '@/lib/db'
import { chunk, dealRow, dedupeBy, flyerRow } from '@/lib/ingest/upsert'
import { flippSource } from '@/lib/sources/flipp'
import { fairwaySource } from '@/lib/sources/fairway'
import { wholeFoodsSource } from '@/lib/sources/wholefoods'
import { DEFAULT_LOCATION } from '@/config/location'
import { syncStores } from '@/lib/stores/overpass'
import { placesToScan } from '@/lib/places'
import type { DealSource, FlyerInput, LocationConfig } from '@/lib/types'

const sources: DealSource[] = [flippSource, fairwaySource, wholeFoodsSource]

// Saved places from the app, beyond the env location. Flipp flyers are per postal code,
// so each place with a zip gets its own flyer lookup; stores are found around all of them.
async function extraLocations(): Promise<LocationConfig[]> {
  const { data, error } = await getServiceClient().from('places').select('label, address, lat, lng, zip, radius_miles')
  if (error) { console.log(`[places] none (${error.message})`); return [] }
  return placesToScan(data ?? [], DEFAULT_LOCATION).map(p => {
    const place = (data ?? []).find(d => d.lat === p.lat && d.lng === p.lng)!
    return {
      address: place.address, postalCode: place.zip ?? '', lat: place.lat, lng: place.lng,
      radiusMiles: Number(place.radius_miles), wholeFoodsStoreId: null,
    }
  })
}

// enrich Flipp items (multi-buy "4/$1" pricing) only for stores near home or a saved
// place — per-item requests are too many to do for every flyer in the metro
async function closeStoreSlugs(extras: LocationConfig[]): Promise<Set<string>> {
  const db = getServiceClient()
  const { data } = await db.from('stores').select('slug, distance_miles').lte('distance_miles', 3)
  const out = new Set((data ?? []).map(s => s.slug))
  if (extras.length) {
    const { haversineMiles } = await import('@/lib/geo')
    const { data: branches } = await db.from('store_branches').select('slug, lat, lng')
    for (const b of branches ?? []) if (extras.some(l => haversineMiles(l, b) <= 3)) out.add(b.slug)
  }
  return out
}

/** Flyers around home, plus (for Flipp) around every saved place, without duplicates. */
async function flyersEverywhere(src: DealSource, extras: LocationConfig[]) {
  const flyers = await src.fetchFlyers(DEFAULT_LOCATION)
  if (src.id !== 'flipp') return flyers
  const seen = new Set(flyers.map(f => f.externalId))
  for (const loc of extras.filter(l => l.postalCode)) {
    try {
      for (const f of await src.fetchFlyers(loc)) if (!seen.has(f.externalId)) { seen.add(f.externalId); flyers.push(f) }
    } catch (e) { console.error(`[${src.id}] flyers near ${loc.address} failed:`, e) }
  }
  return flyers
}

async function runSource(src: DealSource, logos: Map<string, string>, closeSlugs: Set<string>, extras: LocationConfig[]) {
  const db = getServiceClient()
  const started = new Date().toISOString()
  let flyerCount = 0, dealCount = 0, failedFlyers = 0, error: string | null = null
  let flyers: Awaited<ReturnType<DealSource['fetchFlyers']>> = []
  try {
    flyers = await flyersEverywhere(src, extras)
    for (const f of flyers) if (f.logoUrl) logos.set(f.merchantSlug, f.logoUrl)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  // one bad flyer (odd payload, upstream 500, duplicate rows) must not sink the rest
  for (const flyer of flyers) {
    try {
      dealCount += await ingestFlyer(src, flyer, closeSlugs)
      flyerCount++
    } catch (e) {
      failedFlyers++
      console.error(`[${src.id}] flyer ${flyer.externalId} (${flyer.merchantSlug}) failed:`, e instanceof Error ? e.message : e)
    }
  }
  // the source only counts as failed when nothing came through
  if (!error && flyers.length > 0 && flyerCount === 0) error = `all ${failedFlyers} flyers failed`
  if (error) console.error(`[${src.id}] FAILED:`, error)
  await db.from('ingest_runs').insert({
    source: src.id, started_at: started, finished_at: new Date().toISOString(),
    flyer_count: flyerCount, deal_count: dealCount, error,
  })
  console.log(`[${src.id}] flyers=${flyerCount} failed=${failedFlyers} deals=${dealCount} error=${error ?? 'none'}`)
  return error === null
}

async function ingestFlyer(src: DealSource, flyer: FlyerInput, closeSlugs: Set<string>): Promise<number> {
  const db = getServiceClient()
  const { data: frow, error: ferr } = await db.from('flyers')
    .upsert(flyerRow(flyer), { onConflict: 'source,external_id' })
    .select('id').single()
  if (ferr || !frow) throw new Error(`flyer upsert failed: ${ferr?.message}`)
  let deals = await src.fetchDeals(flyer)
  if (src.id === 'flipp' && closeSlugs.has(flyer.merchantSlug)) {
    const { enrichFlippDeals } = await import('@/lib/sources/flipp')
    deals = await enrichFlippDeals(deals)
    console.log(`[flipp] enriched ${deals.length} items for nearby ${flyer.merchantSlug}`)
  }
  if (deals.length === 0) return 0
  let rows = dedupeBy(deals.map(d => dealRow(d, frow.id)), r => r.external_id)
  if (src.id === 'fairway') {
    // preserve extraction-sourced prices across rate-limited runs
    const nullIds = rows.filter(r => r.price == null).map(r => r.external_id)
    if (nullIds.length) {
      const { mergePreservedPrices } = await import('@/lib/ingest/preserve')
      const { data: existing } = await db.from('deals')
        .select('external_id, price, price_text, unit_price')
        .eq('source', src.id).in('external_id', nullIds).not('price', 'is', null)
      if (existing?.length) rows = mergePreservedPrices(rows, existing)
    }
  }
  for (const batch of chunk(rows, 500)) {
    const { error: derr } = await db.from('deals').upsert(batch, { onConflict: 'source,external_id' })
    if (derr) throw new Error(`deal upsert failed: ${derr.message}`)
  }
  return rows.length
}

async function main() {
  const logos = new Map<string, string>()
  const extras = await extraLocations().catch(() => [])
  if (extras.length) console.log(`[places] also scanning ${extras.map(l => l.address).join('; ')}`)
  const closeSlugs = await closeStoreSlugs(extras).catch(() => new Set<string>())
  const results = await Promise.all(sources.map(s => runSource(s, logos, closeSlugs, extras)))
  try { await syncStores(DEFAULT_LOCATION, logos) } catch (e) { console.error('store sync failed:', e) }
  for (const loc of extras) {
    try { await syncStores(loc, undefined, { branchesOnly: true }) } catch (e) { console.error(`store sync near ${loc.address} failed:`, e) }
  }
  try {
    const { canonicalizeDeals } = await import('@/lib/ingest/canonical')
    await canonicalizeDeals()
  } catch (e) { console.error('canonical products failed:', e) }
  try {
    const { error } = await getServiceClient().rpc('refresh_price_stats')
    if (error) throw new Error(error.message)
    console.log('[prices] stats and verdicts refreshed')
  } catch (e) { console.error('price stats failed:', e) }
  try {
    const { error } = await getServiceClient().rpc('refresh_history_flags')
    if (error) throw new Error(error.message)
    console.log('[history] flags refreshed')
  } catch (e) { console.error('history flags failed:', e) }
  try {
    const { sendWatchAlerts } = await import('@/lib/notify')
    await sendWatchAlerts()
  } catch (e) { console.error('watch alerts failed:', e) }
  try {
    const { sendWeeklyDigest } = await import('@/lib/digest')
    await sendWeeklyDigest({ force: process.env.DIGEST_FORCE === '1' })
  } catch (e) { console.error('weekly digest failed:', e) }
  try {
    const { generateDinnerIdeas } = await import('@/lib/dinner')
    await generateDinnerIdeas()
  } catch (e) { console.error('dinner ideas failed:', e) }
  if (results.every(ok => !ok)) process.exit(1) // fail the job only if EVERY source failed
}
main().catch(e => {
  console.error('ingest crashed:', e)
  process.exit(1)
})
