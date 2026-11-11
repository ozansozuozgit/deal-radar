'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { DealRecord } from './DealCard'
import { Img } from './Img'
import { basisLabel, type BestPrice } from '@/lib/bestPrice'
import { whereLabel } from '@/lib/stores/delivery'
import { staleAge } from '@/lib/dates'

type Result = BestPrice<DealRecord & { id: number; regular?: boolean }>

const SHOWN = 4
/** Stores whose prices only change when Ozan presses their "Send to Deal Radar" bookmark. */
const BOOKMARK_STORES = new Set(['netcost', 'amazon-grocery'])

/**
 * "Where's chicken breast cheapest?": the best price per lb (or per item) at each of your
 * stores for what you searched, cheapest first. Shown above the search results.
 */
export function BestPriceCard({ query, stores, hidden, onOpen }: {
  query: string
  hidden: string[]         // "not interested" terms, left out like in the feed
  stores: Array<{ slug: string; name: string; distance_miles: number | null; logo_url: string | null }>
  onOpen: (d: DealRecord) => void
}) {
  const storesKey = stores.map(s => s.slug).join(',')
  const hiddenKey = JSON.stringify(hidden)
  const key = `${query}|${storesKey}|${hiddenKey}`
  const [res, setRes] = useState<{ key: string; data: Result | null } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    const params = new URLSearchParams({ q: query })
    if (storesKey) params.set('stores', storesKey)
    for (const t of JSON.parse(hiddenKey) as string[]) params.append('hide', t)
    // a little later than the feed's own fetch, so typing doesn't fire both on every key
    const t = setTimeout(() =>
      fetch(`/api/best?${params}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then(d => setRes({ key, data: d?.stores ? d : null }))
        .catch(() => { if (!ctrl.signal.aborted) setRes({ key, data: null }) }), 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query, storesKey, hiddenKey, key])

  const data = res?.key === key ? res.data : null
  // one store (or none) has nothing to compare against
  if (!data || data.stores.length < 2) return null

  const by = new Map(stores.map(s => [s.slug, s]))
  const unit = basisLabel(data.basis)
  const per = data.basis === 'lb' ? 'per lb' : data.basis === 'gal' ? 'per gallon' : data.basis === 'ct' ? 'per item' : 'per package'
  const missing = stores.filter(s => !data.stores.some(r => r.slug === s.slug) && !data.otherBasis.some(d => d.merchant_slug === s.slug))
  const rows = open ? data.stores : data.stores.slice(0, SHOWN)
  // a bookmark store's old prices get a nudge to press that bookmark again
  const oldBookmarked = data.stores.filter(r => BOOKMARK_STORES.has(r.slug) && staleAge(r.deal.last_seen))

  return (
    <section className="mt-4 rounded-xl border border-line bg-card px-4 py-3" aria-label={`Best price for ${query}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold truncate">Best price for “{query}”</h2>
        <span className="shrink-0 text-xs text-neutral-500">{per}, this week</span>
      </div>
      <ol className="mt-2 flex flex-col">
        {rows.map((r, i) => {
          const store = by.get(r.slug)
          return (
            <li key={r.slug} className="border-t border-line first:border-t-0">
              <button onClick={() => onOpen(r.deal)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-neutral-800/40 rounded-md -mx-1 px-1">
                <Img src={store?.logo_url ?? r.deal.merchant_logo} alt=""
                  className="w-7 h-7 rounded-full object-contain bg-white border border-line shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <span className="truncate">{r.name}</span>
                    {i === 0 && <span className="shrink-0 rounded-[5px] bg-badge text-on-badge px-1.5 py-0.5 text-[11px] leading-tight">Cheapest</span>}
                  </span>
                  <span className="block text-xs text-neutral-500 truncate">
                    {priceNote(r.deal.regular, staleAge(r.deal.last_seen))}{r.deal.name}{whereLabel(r.slug, store?.distance_miles ?? r.deal.distance_miles ?? null)}
                    {r.others > 0 ? ` · +${r.others} more` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right leading-tight">
                  <span className="block font-condensed font-extrabold text-lg tabular-nums">
                    ${r.unitPrice.toFixed(2)}<span className="text-xs font-bold">{unit}</span>
                  </span>
                  {i > 0 && <span className="block text-xs text-neutral-500 tabular-nums">+${r.vsBest.toFixed(2)}{unit}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {oldBookmarked.length > 0 && (
        <p className="mt-1 text-xs text-amber-400">
          {oldBookmarked.map(r => `${r.name} was last sent ${staleAge(r.deal.last_seen)}`).join(', ')}, so {oldBookmarked.length > 1 ? 'those prices' : 'that price'} may have changed.{' '}
          <Link href="/bookmarks" className="underline hover:text-amber-300">{oldBookmarked.length > 1 ? 'Press their bookmarks' : 'Press its bookmark'}</Link> to update.
        </p>
      )}
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-neutral-500">
        <span className="min-w-0 truncate">
          {missing.length > 0 && <>Not on sale at {missing.map(s => s.name).join(', ')}</>}
        </span>
        {data.stores.length > SHOWN && (
          <button onClick={() => setOpen(o => !o)} className="shrink-0 text-sky-400 hover:underline">
            {open ? 'Show less' : `All ${data.stores.length} stores`}
          </button>
        )}
      </div>
    </section>
  )
}

/** "Regular price · ", "Seen 5d ago · ", "Regular price, seen 5d ago · " or nothing. */
export function priceNote(regular: boolean | undefined, age: string | null): string {
  if (regular) return age ? `Regular price, seen ${age} · ` : 'Regular price · '
  return age ? `Seen ${age} · ` : ''
}
