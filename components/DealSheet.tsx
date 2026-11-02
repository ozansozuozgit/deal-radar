'use client'
import { useEffect, useRef, useState } from 'react'
import { isHistoricalLow, isSteadyPrice, type DealRecord } from './DealCard'
import { FlyerCrop } from './FlyerCrop'
import { Img, NoImage } from './Img'
import { Icon } from './Icon'
import { Price } from './Price'
import { daysLeft as daysUntil, shortDate } from '@/lib/dates'
import { cycleText, verdictLine, type PriceStats } from '@/lib/priceCheck'
import { CHART, layoutChart, usualPackagePrice, type ChartPoint } from '@/lib/priceChart'

interface HistoryPoint { valid_from: string | null; price: number | null; original_price: number | null }
interface OtherStore { merchant_slug: string; merchant_name: string; price: number; unit: string | null }

const SIZE_LABEL: Record<string, string> = { floz: 'fl oz', l: 'liter' }

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

export function DealSheet({ deal, storeSlugs, onClose, onWatch, onAddToList, onHide }: {
  deal: DealRecord
  storeSlugs?: string[]   // the shopper's stores, for the cheaper-this-week line
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
  const [others, setOthers] = useState<OtherStore[]>([])
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
    const params = new URLSearchParams({ name, store: deal.merchant_slug, shops: (storeSlugs ?? []).join(',') })
    fetch(`/api/history?${params}`, { signal: ctrl.signal })
      .then(r => r.json()).then(d => { setFetched(d.points ?? []); setOthers(d.others ?? []) })
      .catch(() => { if (!ctrl.signal.aborted) setFetched([]) })
    return () => ctrl.abort()
  }, [name, deal.merchant_slug, storeSlugs])

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

  const numeric = (points ?? []).filter(p => p.price != null && p.valid_from != null) as ChartPoint[]
  const usual = usualPackagePrice(deal, stats)
  // same product, same unit, for less at another of the shopper's stores this week
  const cheaper = deal.price == null ? [] : others.filter(o => o.price < deal.price! && (o.unit ?? null) === (deal.unit ?? null)).slice(0, 3)
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
                <span className="text-xs text-neutral-400">${deal.unit_price.toFixed(2)} per {SIZE_LABEL[deal.size_unit] ?? deal.size_unit}</span>}
              {isHistoricalLow(deal) &&
                <span className="text-xs font-bold bg-ink text-tag rounded px-1.5 py-0.5">
                  {shortDate(deal.hist_since) ? `Lowest price here since ${shortDate(deal.hist_since)}` : 'Lowest price here'}
                </span>}
              {isSteadyPrice(deal) &&
                <span className="text-xs text-neutral-400">
                  Same ${deal.price!.toFixed(2)} at all {deal.hist_weeks} sales here{shortDate(deal.hist_since) ? ` since ${shortDate(deal.hist_since)}` : ''}
                </span>}
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

        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Price history at {deal.merchant_name}</h3>
          {verdictLine(deal.price_verdict, usual) && <p className="text-sm mb-2">{verdictLine(deal.price_verdict, usual)}</p>}
          {points === null ? <div className="h-28 rounded bg-neutral-800 animate-pulse" />
            : numeric.length >= 2 ? <PriceChart points={numeric} currentFrom={deal.valid_from} usual={usual} />
            : <p className="text-sm text-neutral-500">History builds up week by week. Check back after a few scans.</p>}
          {cheaper.length > 0 &&
            <p className="text-sm font-bold text-save mt-2">Cheaper this week: {cheaper.map(o => `${o.merchant_name} $${o.price.toFixed(2)}`).join(' · ')}</p>}
          {cycleText(stats) && <p className="text-xs text-neutral-500 mt-2">{cycleText(stats)} (from {stats!.samples} weekly prices at {stats!.stores} store{stats!.stores === 1 ? '' : 's'}).</p>}
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

/** This store's sales on a real time axis, the deal's own week marked, the usual nearby price dashed. */
function PriceChart({ points, currentFrom, usual }: { points: ChartPoint[]; currentFrom: string | null; usual: number | null }) {
  const { dots, usualY, dates, min, max } = layoutChart(points, currentFrom, usual)
  const { w, h, left, right } = CHART
  const cur = dots.find(d => d.current)
  const label = `Prices from ${dates[0]?.label} to ${dates[1]?.label ?? dates[0]?.label}, low $${min.toFixed(2)}, high $${max.toFixed(2)}`
    + (cur ? `, now $${cur.price.toFixed(2)}` : '') + (usual != null ? `, usual nearby $${usual.toFixed(2)}` : '')
  const topY = Math.min(...dots.map(d => d.y)), bottomY = Math.max(...dots.map(d => d.y))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-md h-auto text-neutral-100 overflow-visible" role="img" aria-label={label}>
      <text x={left - 6} y={topY + 3} textAnchor="end" className="fill-neutral-500 text-[9px] tabular-nums">${Math.max(...dots.map(d => d.price)).toFixed(2)}</text>
      {bottomY - topY > 12 && <text x={left - 6} y={bottomY + 3} textAnchor="end" className="fill-neutral-500 text-[9px] tabular-nums">${Math.min(...dots.map(d => d.price)).toFixed(2)}</text>}
      {usualY != null && usual != null && <>
        <line x1={left} x2={w - right} y1={usualY} y2={usualY} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="4 4" />
        <text x={w - right} y={usualY - 4} textAnchor="end" className="fill-neutral-500 text-[9px]">usual nearby ${usual.toFixed(2)}</text>
      </>}
      <polyline points={dots.map(d => `${d.x},${d.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={2.5} fill="currentColor" />)}
      {cur && <>
        <circle cx={cur.x} cy={cur.y} r={5} className="fill-tag" stroke="currentColor" strokeWidth={2} />
        <text x={cur.x} y={cur.y + 16} textAnchor={cur.x > w - 60 ? 'end' : cur.x < left + 40 ? 'start' : 'middle'} className="fill-current text-[10px] font-bold">${cur.price.toFixed(2)} now</text>
      </>}
      {dates.map(d => <text key={d.anchor} x={d.x} y={h - 4} textAnchor={d.anchor} className="fill-neutral-500 text-[9px]">{d.label}</text>)}
    </svg>
  )
}
