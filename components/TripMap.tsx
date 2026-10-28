'use client'
import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapStore { slug: string; name: string; lat: number; lng: number; matched: number }

/**
 * Home, every store that has list items (bigger dot = more items), and the walking
 * loop for the chosen plan. Leaflet is loaded on the client only.
 */
export function TripMap({ home, stores, route }: {
  home: { lat: number; lng: number }
  stores: MapStore[]
  route: string[]            // store slugs in visiting order
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled || !el.current) return
      map.current?.remove()
      const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
      map.current = m
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19,
      }).addTo(m)

      const onRoute = new Set(route)
      const maxMatched = Math.max(1, ...stores.map(s => s.matched))
      for (const s of stores) {
        const active = onRoute.has(s.slug)
        L.circleMarker([s.lat, s.lng], {
          radius: 5 + (s.matched / maxMatched) * 9,
          color: active ? '#34d399' : '#737373', weight: active ? 2 : 1,
          fillColor: active ? '#10b981' : '#404040', fillOpacity: active ? 0.85 : 0.6,
        }).bindTooltip(`${s.name} · ${s.matched} item${s.matched === 1 ? '' : 's'}`, { direction: 'top' }).addTo(m)
      }
      L.circleMarker([home.lat, home.lng], { radius: 7, color: '#38bdf8', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1 })
        .bindTooltip('You', { direction: 'top' }).addTo(m)

      const bySlug = new Map(stores.map(s => [s.slug, s]))
      const path = [home, ...route.flatMap(slug => (bySlug.get(slug) ? [bySlug.get(slug)!] : [])), home]
        .map(p => [p.lat, p.lng] as [number, number])
      if (path.length > 2) L.polyline(path, { color: '#34d399', weight: 3, dashArray: '6 6', opacity: 0.9 }).addTo(m)

      const bounds = L.latLngBounds([[home.lat, home.lng], ...stores.map(s => [s.lat, s.lng] as [number, number])])
      m.fitBounds(bounds.pad(0.15), { maxZoom: 16 })
    })
    return () => { cancelled = true }
  }, [home, stores, route])

  useEffect(() => () => { map.current?.remove(); map.current = null }, [])

  return <div ref={el} className="isolate h-64 sm:h-80 w-full rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900" aria-label="Map of stores and walking route" />
}
