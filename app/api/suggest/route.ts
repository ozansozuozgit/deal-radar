import { NextRequest, NextResponse } from 'next/server'

// Free OSM autocomplete via Photon (komoot). Biased toward NYC.
const BIAS = { lat: 40.7823, lon: -73.9525 }

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string; housenumber?: string; street?: string
    city?: string; state?: string; postcode?: string; countrycode?: string
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const mode = req.nextUrl.searchParams.get('mode')
  let url: string
  if (mode === 'reverse') {
    // parse as numbers so nothing but coordinates reaches the upstream URL
    const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
    const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })
    url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`
  } else {
    if (!q || q.length < 3) return NextResponse.json({ suggestions: [] })
    url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6&lat=${BIAS.lat}&lon=${BIAS.lon}`
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'deal-radar/1.0 (personal project)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return NextResponse.json({ suggestions: [] })
  const data = await res.json()
  const suggestions = ((data?.features ?? []) as PhotonFeature[])
    .filter(f => f.properties.countrycode === 'US')
    .map(f => {
      const p = f.properties
      const line = [
        [p.housenumber, p.street ?? p.name].filter(Boolean).join(' ') || p.name,
        p.city, p.state, p.postcode,
      ].filter(Boolean).join(', ')
      return {
        label: line,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        zip: p.postcode ?? null,
      }
    })
    .filter(s => s.label)
  return NextResponse.json({ suggestions: suggestions.slice(0, 6) })
}
