import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

/** Typical prices around here for canonical products: ?c=chicken%20breast,eggs */
export async function GET(req: NextRequest) {
  const names = (req.nextUrl.searchParams.get('c') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 100)
  if (!names.length) return NextResponse.json({ stats: [] })
  const db = getServiceClient()
  const { data, error } = await db.from('price_stats')
    .select('canonical, basis, median, p25, low, samples, stores, cycle_days, last_sale').in('canonical', names)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stats: data ?? [] }, { headers: CACHE })
}
