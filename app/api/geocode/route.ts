import { NextRequest, NextResponse } from 'next/server'

type Hit = { lat: number; lng: number; zip: string | null }

// US Census geocoder: precise for full street addresses, but strict and occasionally down
async function census(address: string): Promise<Hit | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`census ${res.status}`)
  const match = (await res.json())?.result?.addressMatches?.[0]
  return match ? { lat: match.coordinates.y, lng: match.coordinates.x, zip: match.addressComponents?.zip ?? null } : null
}

// Photon (OSM): forgiving with partial addresses, neighborhoods and landmarks
async function photon(address: string): Promise<Hit | null> {
  const res = await fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(address)}&limit=1`, {
    headers: { 'User-Agent': 'deal-radar/1.0 (personal project)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`photon ${res.status}`)
  const f = (await res.json())?.features?.[0]
  return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], zip: f.properties?.postcode ?? null } : null
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })
  let failures = 0
  for (const lookup of [census, photon]) {
    try {
      const hit = await lookup(address)
      if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return NextResponse.json(hit)
    } catch (e) {
      failures++
      console.error('[geocode]', e)
    }
  }
  return failures === 2
    ? NextResponse.json({ error: 'geocoder unavailable' }, { status: 502 })
    : NextResponse.json({ error: 'address not found' }, { status: 404 })
}
