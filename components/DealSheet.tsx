'use client'
import { useEffect, useRef, useState } from 'react'
import { isHistoricalLow, type DealRecord } from './DealCard'
import { FlyerCrop } from './FlyerCrop'
import { Img, NoImage } from './Img'
import { Icon } from './Icon'
import { Price } from './Price'
import { daysLeft as daysUntil } from '@/lib/dates'
import { basisSuffix, cycleText, verdictText, type PriceStats } from '@/lib/priceCheck'

interface HistoryPoint { valid_from: string | null; price: number | null; original_price: number | null }

function itemLink(deal: DealRecord): { href: string; label: string } | null {
  const flyerId = (deal as unknown as { flyer_external_id?: string | null }).flyer_external_id
  switch ((deal as unknown as { source?: string }).source) {
    case 'flipp':
      return flyerId ? { href: `https://flipp.com/en-us/flyers/${flyerId}`, label: 'View flyer on Flipp' } : null
    case 'wholefoods':
      return { href: `https://www.wholefoodsmarket.com/search?text=${encodeURIComponent(deal.name)}`, label: 'View on wholefoodsmarket.com' }
    case 'fairway':
      return { href: 'https://www.fairwaymarket.com/sm/planning/rsid/4000/circulars', label: 'View Fairway circular' }
    default:
      return null
  }
}

export function DealSheet({ deal, onClose, onWatch, onAddToList, onHide }: {
  deal: DealRecord
  onClose: () => void
  onWatch: (term: string) => void
  onAddToList: (deal: DealRecord) => void
  onHide?: (term: string) => void
}) {
  const name = (deal as unknown as { normalized_name?: string }).normalized_name
  const [fetched, setFetched] = useState<HistoryPoint[] | null>(null)
  const points = name ? fetched : []
  const [done, setDone] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [stats, setStats] = useState<PriceStats | null>(null)
  const [hiding, setHiding] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // modal hygiene: freeze the page behind, move focus in, hand it back on close
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => { document.body.style.overflow = prevOverflow; prevFocus?.focus?.() }
  }, [])

  useEffect(() => {
    if (!name) return
    const ctrl = new AbortController()
    const params = new URLSearchParams({ name, store: deal.merchant_slug })
    fetch(`/api/history?${params}`, { signal: ctrl.signal })
      .then(r => r.json()).then(d => setFetched(d.points ?? []))
      .catch(() => { if (!ctrl.signal.aborted) setFetched([]) })
    return () => ctrl.abort()
  }, [name, deal.merchant_slug])

  useEffect(() => {
    if (!deal.canonical) return
    const ctrl = new AbortController()
    fetch(`/api/stats?c=${encodeURIComponent(deal.canonical)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null)).then(d => setStats(d?.stats?.[0] ?? null)).catch(() => {})
    return () => ctrl.abort()
  }, [deal.canonical])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (zoomed) setZoomed(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed, onClose])

  const numeric = (points ?? []).filter(p => p.price != null) as Array<{ valid_from: string; price: number }>
  const daysLeft = daysUntil(deal.valid_to)
  const link = itemLink(deal)
  const hasVisual = !!(deal.crop || deal.image_url)

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={deal.name}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1}
        className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[90vh] max-w-xl mx-auto rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 p-5 sm:p-6 max-h-[88vh] overflow-y-auto overscroll-contain outline-none animate-sheet-in"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto w-10 h-1 rounded-full bg-neutral-700 mb-4 sm:hidden" />
        <button onClick={onClose} aria-label="Close"
          className="hidden sm:flex absolute top-4 right-4 w-8 h-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:text-neutral-100">×</button>

        <div className="flex gap-5">
          <button onClick={() => hasVisual && setZoomed(true)}
            className={`w-36 sm:w-44 shrink-0 self-start relative group ${hasVisual ? 'cursor-zoom-in' : 'cursor-default'}`}
            aria-label={hasVisual ? 'Expand image' : undefined}>
            <div className="w-full aspect-square rounded-lg bg-tile p-2 overflow-hidden">
              {deal.crop ? <FlyerCrop crop={deal.crop} alt={deal.name} />
                : <Img src={deal.image_url} alt="" className="w-full h-full object-contain mix-blend-multiply" fallback={<NoImage size="text-4xl" />} />}
            </div>
            {hasVisual && (
              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 text-white text-xs px-1.5 py-0.5 opacity-80 group-hover:opacity-100">⤢</span>
            )}
          </button>
          <div className="min-w-0">
            <h2 className="font-condensed font-extrabold text-2xl leading-tight">{deal.name}</h2>
            {deal.description && <p className="text-sm text-neutral-400 mt-1">{deal.description}</p>}
            <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
              {deal.price != null ? (
                <>
                  <Price value={deal.price} unit={deal.unit} size="lg" className="self-center" />
                  <span className="flex flex-col leading-tight">
                    {deal.original_price != null && deal.original_price > deal.price &&
                      <span className="text-neutral-500 line-through">${deal.original_price.toFixed(2)}</span>}
                    {deal.original_price != null && deal.original_price > deal.price
                      ? <span className="text-save font-bold text-sm">Save ${(deal.original_price - deal.price).toFixed(2)}</span>
                      : deal.discount_pct != null ? <span className="text-save font-bold text-sm">−{deal.discount_pct}%</span> : null}
                  </span>
                </>
              ) : <span className="bg-tag text-ink font-condensed font-extrabold rounded-md px-2 py-1 text-xl">{deal.sale_story ?? deal.price_text ?? 'See flyer price'}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 empty:hidden">
              {deal.unit_price != null && deal.unit !== 'lb' && deal.size_unit &&
                <span className="text-xs text-neutral-400">${deal.unit_price.toFixed(2)} per {deal.size_unit}</span>}
              {isHistoricalLow(deal) &&
                <span className="text-xs font-bold bg-ink text-tag rounded px-1.5 py-0.5">Lowest price here in {deal.hist_weeks} weeks</span>}
            </div>
            {deal.prime_price != null && <div className="text-sm text-sky-300 mt-1">${deal.prime_price.toFixed(2)} with Prime</div>}
            <div className="text-sm text-neutral-400 mt-2.5">
              <Img src={deal.merchant_logo} alt="" className="inline w-4 h-4 mr-1.5 -mt-0.5 rounded-full bg-white object-contain border border-line" />
              {deal.merchant_name}{deal.distance_miles != null ? ` · ${deal.distance_miles} mi` : ''}
              {daysLeft != null && <> · <span className={daysLeft <= 1 ? 'text-urgent font-bold' : ''}>{daysLeft === 0 ? 'ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</span></>}
            </div>
            <div className="flex items-center gap-4 flex-wrap mt-2">
              {link && (
                <a href={link.href} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300">
                  {link.label} ↗
                </a>
              )}
              <button onClick={() => shareDeal(deal).then(ok => ok && setDone('share'))}
                className="text-sm text-sky-400 hover:text-sky-300">
                {done === 'share' ? 'Copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {(stats || deal.price_verdict) && (
          <div className="mt-5 rounded-xl bg-neutral-950 p-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Price check{deal.canonical ? ` · ${deal.canonical}` : ''}</h3>
            {verdictText(deal.price_verdict, deal.cmp_price, stats) && <p className="text-sm">{verdictText(deal.price_verdict, deal.cmp_price, stats)}</p>}
            {stats && deal.cmp_price != null && deal.cmp_basis === stats.basis && <PriceRange now={Number(deal.cmp_price)} stats={stats} />}
            {cycleText(stats) && <p className="text-xs text-neutral-500 mt-2">{cycleText(stats)} (from {stats!.samples} weekly prices at {stats!.stores} store{stats!.stores === 1 ? '' : 's'}).</p>}
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Price history at this store</h3>
          {points === null ? <div className="h-14 rounded bg-neutral-800 animate-pulse" />
            : numeric.length >= 2 ? <Sparkline points={numeric} />
            : <p className="text-sm text-neutral-500">History builds up week by week. Check back after a few scans.</p>}
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto] gap-2.5">
          <button onClick={() => { onAddToList(deal); setDone('list') }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-white py-3 text-sm font-bold hover:bg-neutral-300 transition-colors">
            <Icon name={done === 'list' ? 'check' : 'plus'} className="w-4 h-4" />{done === 'list' ? 'On your list' : 'Add to list'}
          </button>
          <button onClick={() => { onWatch(deal.name); setDone('watch') }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 px-4 py-3 text-sm font-bold hover:bg-neutral-800 transition-colors">
            <Icon name={done === 'watch' ? 'check' : 'eye'} className="w-4 h-4" />{done === 'watch' ? 'Watching' : 'Watch'}
          </button>
        </div>
        {onHide && (
          <div className="mt-3 text-center">
            {done === 'hide' ? <span className="text-xs text-neutral-500">Hidden from your feed. Undo under “hidden” next to the deal count.</span>
              : !hiding ? (
                <button onClick={() => setHiding(true)} className="text-xs text-neutral-500 hover:text-neutral-300">Not interested…</button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-neutral-500">Hide</span>
                  {[...new Set([deal.canonical, name].filter((t): t is string => !!t))].map(t => (
                    <button key={t} onClick={() => { onHide(t); setDone('hide') }}
                      className="rounded-full border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800">all “{t}”</button>
                  ))}
                  <button onClick={() => setHiding(false)} className="text-neutral-500 hover:text-neutral-100 px-1">cancel</button>
                </div>
              )}
          </div>
        )}
      </div>

      {zoomed && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomed(false)} role="dialog" aria-label="Expanded image">
          {deal.crop ? (
            // show the FULL flyer page so the item is visible in context
            <img src={deal.crop.image} alt={deal.name}
              className="max-w-full max-h-full object-contain rounded-lg" />
          ) : (
            <img src={deal.image_url!} alt={deal.name}
              className="max-w-full max-h-full object-contain rounded-lg bg-white" />
          )}
          <button onClick={() => setZoomed(false)} aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-neutral-800/90 text-white text-lg">×</button>
          {deal.crop && (
            <div className="absolute bottom-5 inset-x-0 text-center text-sm text-neutral-300 bg-black/40 py-2">
              Full flyer page — {deal.name}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

async function shareDeal(deal: DealRecord): Promise<boolean> {
  const price = deal.price != null ? `$${deal.price.toFixed(2)}${deal.unit ? `/${deal.unit}` : ''}` : deal.sale_story ?? deal.price_text ?? ''
  const text = `${deal.name}${price ? ` — ${price}` : ''} at ${deal.merchant_name}`
  try {
    if (navigator.share) { await navigator.share({ title: 'Deal Radar', text, url: window.location.origin }); return false }
    await navigator.clipboard.writeText(`${text}\n${window.location.origin}`)
    return true
  } catch { return false } // share sheet dismissed / clipboard blocked
}

function Sparkline({ points }: { points: Array<{ valid_from: string; price: number }> }) {
  const w = 280, h = 48, pad = 4
  const prices = points.map(p => p.price)
  const min = Math.min(...prices), max = Math.max(...prices)
  const span = max - min || 1
  const step = (w - pad * 2) / Math.max(points.length - 1, 1)
  const coords = points.map((p, i) => `${pad + i * step},${h - pad - ((p.price - min) / span) * (h - pad * 2)}`)
  return (
    <div className="flex items-center gap-3">
      <svg width={w} height={h} className="shrink-0">
        <polyline points={coords.join(' ')} fill="none" stroke="#15201a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => {
          const [x, y] = c.split(',').map(Number)
          return <circle key={i} cx={x} cy={y} r="2.5" fill="#15201a" />
        })}
      </svg>
      <div className="text-xs text-neutral-400 whitespace-nowrap">
        <div>low <span className="text-emerald-400 font-medium">${min.toFixed(2)}</span></div>
        <div>high <span className="text-neutral-300">${max.toFixed(2)}</span></div>
      </div>
    </div>
  )
}

/** Where this week's price sits between the lowest sale seen around here and well above typical. */
function PriceRange({ now, stats }: { now: number; stats: PriceStats }) {
  const low = Number(stats.low), typical = Number(stats.median), good = Number(stats.p25)
  const high = Math.max(typical * 1.5, now * 1.1, low + 0.01)
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100))}%`
  const suffix = basisSuffix(stats.basis)
  return (
    <div className="mt-3" aria-label={`This week $${now.toFixed(2)}${suffix}; lowest seen $${low.toFixed(2)}; typical $${typical.toFixed(2)}`}>
      <div className="relative h-2 rounded-full bg-neutral-800">
        <div className="absolute inset-y-0 left-0 rounded-full bg-save/70" style={{ width: pos(good) }} />
        <div className="absolute -top-0.5 w-0.5 h-3 bg-neutral-500" style={{ left: pos(typical) }} />
        <div className="absolute -top-1.5 -ml-[3px] w-1.5 h-5 rounded-full bg-ink ring-2 ring-neutral-950" style={{ left: pos(now) }} />
      </div>
      <div className="flex justify-between gap-2 mt-1.5 text-[11px] text-neutral-500 tabular-nums">
        <span>Lowest seen ${low.toFixed(2)}{suffix}</span>
        <span>Tick: typical ${typical.toFixed(2)}{suffix}</span>
      </div>
    </div>
  )
}
