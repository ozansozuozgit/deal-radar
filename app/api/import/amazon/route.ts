import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { chunk, dealRow, dedupeBy, flyerRow } from '@/lib/ingest/upsert'
import { AMAZON, amazonDeals, amazonFlyer, IMPORT_LASTS_MS, type AmazonCard } from '@/lib/sources/amazon-parse'

const MAX_CARDS = 3000

// the bookmark runs on Amazon's page, so the browser asks before it posts here
function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  if (!/^https:\/\/(www\.)?amazon\.com$/.test(origin)) return {}
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

  const body = await req.json().catch(() => null) as { zip?: unknown; pages?: Array<{ aisle?: unknown; cards?: unknown }> } | null
  const zip = typeof body?.zip === 'string' && /^\d{5}$/.test(body.zip) ? body.zip : null
  if (!zip) return fail('No delivery ZIP in the request', 400)
  const pages = (Array.isArray(body?.pages) ? body.pages : [])
    .filter(p => typeof p?.aisle === 'string' && Array.isArray(p.cards))
    .map(p => ({ aisle: p.aisle as string, cards: (p.cards as AmazonCard[]).filter(c => c && typeof c === 'object') }))
  const total = pages.reduce((n, p) => n + p.cards.length, 0)
  if (total === 0) return fail('No products in the request', 400)
  if (total > MAX_CARDS) return fail('Too many products', 413)

  const now = new Date()
  const deals = amazonDeals(pages, now, IMPORT_LASTS_MS)
  if (deals.length === 0) return fail(`None of the ${total} products were on sale`, 422)
  if (req.nextUrl.searchParams.get('dry') === '1') {
    return NextResponse.json({ imported: deals.length, read: total, dry: true, sample: deals.slice(0, 3) }, { headers })
  }

  const db = getServiceClient()
  const { error: serr } = await db.from('stores').upsert(
    { source: AMAZON.source, slug: AMAZON.slug, name: AMAZON.name, logo_url: AMAZON.logo },
    { onConflict: 'source,slug' })
  if (serr) return fail(`store: ${serr.message}`, 500)
  const { data: frow, error: ferr } = await db.from('flyers')
    .upsert(flyerRow(amazonFlyer(zip, now)), { onConflict: 'source,external_id' }).select('id').single()
  if (ferr || !frow) return fail(`flyer: ${ferr?.message}`, 500)
  const rows = dedupeBy(deals.map(d => dealRow(d, frow.id)), r => r.external_id)
  for (const batch of chunk(rows, 500)) {
    const { error } = await db.from('deals').upsert(batch, { onConflict: 'source,external_id' })
    if (error) return fail(`deals: ${error.message}`, 500)
  }
  return NextResponse.json({ imported: rows.length, read: total }, { headers })
}
