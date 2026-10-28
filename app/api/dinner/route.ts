import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { sanitizeIdeas } from '@/lib/dinner'

export const dynamic = 'force-dynamic'

// data changes once a day; let the CDN absorb repeat reads
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }

export async function GET() {
  const db = getServiceClient()
  const { data } = await db.from('suggestions')
    .select('created_at, payload').order('id', { ascending: false }).limit(1)
  const row = data?.[0]
  // only serve fresh suggestions (within 8 days)
  if (!row || Date.now() - +new Date(row.created_at) > 8 * 86_400_000) {
    return NextResponse.json({ ideas: [] }, { headers: CACHE })
  }
  return NextResponse.json({ ideas: sanitizeIdeas((row.payload as { ideas?: unknown })?.ideas), created_at: row.created_at }, { headers: CACHE })
}
