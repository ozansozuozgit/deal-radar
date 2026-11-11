import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { chunk, dealRow, dedupeBy, flyerRow } from '@/lib/ingest/upsert'
import { CATALOG_BATCH, mapNetcostImport, mapNetcostProduct, NETCOST, type NetcostProduct, type NetcostSpecial } from '@/lib/sources/netcost'

const MAX_SPECIALS = 5000
const MAX_CATALOG = CATALOG_BATCH * 2

// the bookmark runs on NetCost's page, so the browser asks before it posts here
function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  if (!/^https:\/\/(www\.)?shop\.netcostmarket\.com$/.test(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function keyMatches(req: NextRequest, key: string): boolean {
  const given = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '')
  const want = Buffer.from(key)
  return given.length === want.length && timingSafeEqual(given, want)
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) })
}

export async function POST(req: NextRequest) {
  const headers = cors(req)
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers })
  const key = process.env.IMPORT_KEY
  if (!key) return fail('Import is not set up: IMPORT_KEY is missing', 501)
  if (!keyMatches(req, key)) return fail('Wrong import key', 401)

  const body = await req.json().catch(() => null) as { specials?: NetcostSpecial[]; catalog?: NetcostProduct[] } | null
  if (Array.isArray(body?.catalog)) return importCatalog(req, body.catalog, fail, headers)
  const specials = body?.specials
  if (!Array.isArray(specials) || specials.length === 0) return fail('No specials in the request', 400)
  if (specials.length > MAX_SPECIALS) return fail('Too many specials', 413)

  const { flyer, deals, skipped } = mapNetcostImport(specials)
  if (deals.length === 0) return fail(`None of the ${skipped} specials could be read`, 422)
  // ?dry=1 reads and maps everything but stores nothing, for checking the bookmark
  if (req.nextUrl.searchParams.get('dry') === '1') {
    return NextResponse.json({ imported: deals.length, skipped, dry: true, sample: deals.slice(0, 3) }, { headers })
  }

  const db = getServiceClient()
  const { error: serr } = await db.from('stores').upsert(
    { source: NETCOST.source, slug: NETCOST.slug, name: NETCOST.name, logo_url: NETCOST.logo },
    { onConflict: 'source,slug' })
  if (serr) return fail(`store: ${serr.message}`, 500)
  const { data: frow, error: ferr } = await db.from('flyers')
    .upsert(flyerRow(flyer), { onConflict: 'source,external_id' }).select('id').single()
  if (ferr || !frow) return fail(`flyer: ${ferr?.message}`, 500)
  const rows = dedupeBy(deals.map(d => dealRow(d, frow.id)), r => r.external_id)
  for (const batch of chunk(rows, 500)) {
    const { error } = await db.from('deals').upsert(batch, { onConflict: 'source,external_id' })
    if (error) return fail(`deals: ${error.message}`, 500)
  }
  return NextResponse.json({ imported: rows.length, skipped }, { headers })
}

/**
 * A batch of the whole catalog's regular prices. They go to catalog_prices, not deals, so
 * the feed stays sales only; best price reads them for stores that list everyday prices.
 */
async function importCatalog(req: NextRequest, products: NetcostProduct[], fail: (error: string, status: number) => NextResponse, headers: Record<string, string>) {
  if (products.length === 0) return fail('No products in the request', 400)
  if (products.length > MAX_CATALOG) return fail('Too many products in one request', 413)
  const seen = new Date().toISOString()
  const rows = dedupeBy(products.flatMap(p => mapNetcostProduct(p, seen) ?? []), r => r.external_id)
  const skipped = products.length - rows.length
  if (req.nextUrl.searchParams.get('dry') === '1') {
    return NextResponse.json({ saved: rows.length, skipped, dry: true, sample: rows.slice(0, 3) }, { headers })
  }
  if (rows.length === 0) return NextResponse.json({ saved: 0, skipped }, { headers })
  const db = getServiceClient()
  for (const batch of chunk(rows, 500)) {
    const { error } = await db.from('catalog_prices').upsert(batch, { onConflict: 'source,external_id' })
    if (error) return fail(`catalog: ${error.message}`, 500)
  }
  return NextResponse.json({ saved: rows.length, skipped }, { headers })
}
