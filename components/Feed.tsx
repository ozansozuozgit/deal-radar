'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DealCard, type DealRecord } from './DealCard'
import { Chips } from './Chips'
import { SkeletonCards } from './Skeleton'
import { DealSheet } from './DealSheet'
import { ListView } from './ListView'
import { addWatch, loadWatches, removeWatch, type Watch } from '@/lib/client/watches'
import { addListItem } from '@/lib/client/list'
import { currentPushStatus, enablePush, type PushStatus } from '@/lib/client/push'
import { savePrefs, type Prefs } from '@/lib/client/prefs'
import { hoursSince, timeAgo } from '@/lib/dates'
import { useOnline } from '@/lib/client/online'
import type { DinnerIdea } from '@/lib/dinner'

interface Meta {
  stores: Array<{ slug: string; name: string; distance_miles: number | null; logo_url: string | null; deal_count: number }>
  freshness: Array<{ source: string; finished_at: string; deal_count: number; error: string | null }>
  lastSuccess: string | null
}

const CATEGORIES: Array<[string, string]> = [
  ['produce', '🥬 produce'], ['meat', '🥩 meat'], ['seafood', '🐟 seafood'], ['dairy', '🥛 dairy'],
  ['bakery', '🥐 bakery'], ['frozen', '🧊 frozen'], ['beverages', '🥤 drinks'], ['pantry', '🥫 pantry'],
  ['snacks', '🍿 snacks'], ['household', '🧻 household'], ['personal-care', '🧴 care'],
]
const SORTS = [
  { value: 'discount', label: '🔥 Biggest discount' },
  { value: 'price', label: '💲 Lowest price' },
  { value: 'ending', label: '⏳ Ending soon' },
]
const DEALS_LIMIT = 200
const DEALS_MAX = 500 // /api/deals clamps here

interface Results { key: string; baseKey: string; deals: DealRecord[]; error: boolean }

export function Feed({ prefs, onOpenSetup }: { prefs: Prefs; onOpenSetup: () => void }) {
  const [tab, setTab] = useState<'deals' | 'list'>('deals')
  const [meta, setMeta] = useState<Meta | null>(null)
  // results are tagged with the query that produced them, so a stale response is
  // never shown for newer filters and "loading" is simply "results don't match yet"
  const [results, setResults] = useState<Results | null>(null)
  const [retry, setRetry] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [storeSel, setStoreSel] = useState<string[] | null>(prefs.enabledStores)
  const [catSel, setCatSel] = useState<string[] | null>(null)
  const [sort, setSort] = useState('discount')
  const [upcoming, setUpcoming] = useState(false)
  const [selected, setSelected] = useState<DealRecord | null>(null)
  // Feed only mounts client-side after prefs load, so reading localStorage here is safe
  const [watches, setWatches] = useState<Watch[]>(() => loadWatches())
  const [watchHits, setWatchHits] = useState<Map<string, DealRecord | null>>(new Map())
  const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported')
  const [dinner, setDinner] = useState<DinnerIdea[]>([])
  const [dinnerOpen, setDinnerOpen] = useState(true)

  useEffect(() => { currentPushStatus().then(setPushStatus) }, [])
  useEffect(() => {
    fetch('/api/dinner').then(r => r.json()).then(d => setDinner(Array.isArray(d?.ideas) ? d.ideas : [])).catch(() => {})
  }, [])
  useEffect(() => {
    fetch('/api/meta').then(r => r.json())
      .then(d => setMeta({
        stores: Array.isArray(d?.stores) ? d.stores : [],
        freshness: Array.isArray(d?.freshness) ? d.freshness : [],
        lastSuccess: typeof d?.lastSuccess === 'string' ? d.lastSuccess : null,
      }))
      .catch(() => setMeta({ stores: [], freshness: [], lastSuccess: null }))
  }, [])

  const inRadius = useMemo(() =>
    (meta?.stores ?? []).filter(s => s.distance_miles == null || s.distance_miles <= prefs.radiusMiles),
    [meta, prefs.radiusMiles])
  const inRadiusSlugs = useMemo(() => inRadius.map(s => s.slug), [inRadius])

  // remember store picks across visits
  useEffect(() => { savePrefs({ ...prefs, enabledStores: storeSel }) }, [prefs, storeSel])

  const baseKey = useMemo(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    // saved picks can point at stores that are now out of radius or gone; ignore those
    const picked = storeSel?.filter(s => inRadiusSlugs.includes(s))
    const stores = picked?.length ? picked : inRadiusSlugs
    if (stores.length) params.set('stores', stores.join(','))
    if (catSel?.length === 1) params.set('category', catSel[0])
    params.set('status', upcoming ? 'upcoming' : 'active')
    params.set('sort', sort)
    return params.toString()
  }, [q, storeSel, catSel, sort, upcoming, inRadiusSlugs])
  // "Show more" raises the limit for the current filters only; any filter change resets it
  const [more, setMore] = useState({ baseKey: '', limit: DEALS_LIMIT })
  const limit = more.baseKey === baseKey ? more.limit : DEALS_LIMIT
  const dealsKey = `${baseKey}&limit=${limit}`
  const loading = results?.key !== dealsKey
  // while loading more, keep showing what we have instead of flashing skeletons
  const loadingMore = loading && results?.baseKey === baseKey && !results.error
  const failed = !loading && !!results?.error
  const deals = useMemo(() => (results && (!loading || loadingMore) ? results.deals : []), [results, loading, loadingMore])
  const canShowMore = !loading && !failed && deals.length === limit && limit < DEALS_MAX

  useEffect(() => {
    if (!meta || tab !== 'deals') return
    const ctrl = new AbortController()
    const done = (deals: DealRecord[], error: boolean) => setResults({ key: dealsKey, baseKey, deals, error })
    const t = setTimeout(() =>
      fetch(`/api/deals?${dealsKey}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(d => done(d.deals ?? [], false))
        .catch(() => { if (!ctrl.signal.aborted) done([], true) }), 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [dealsKey, baseKey, meta, tab, retry])

  // "/" jumps to search, like most sites
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key !== '/' || selected || el?.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const online = useOnline()
  // the daily scan runs at ~6am; if the newest successful run is much older, it's failing
  const lastGood = meta?.lastSuccess ?? null
  const allFailing = !!meta?.freshness.length && meta.freshness.every(f => f.error)
  const stale = (hoursSince(lastGood) ?? 0) > 36 || (allFailing && !lastGood)

  const hasFilters = !!q.trim() || !!storeSel || !!catSel || upcoming
  function clearFilters() { setQ(''); setStoreSel(null); setCatSel(null); setUpcoming(false) }
  const qTerm = q.trim().toLowerCase()
  const canWatchQuery = qTerm.length >= 3 && !watches.some(w => w.term === qTerm)

  // watches: cheapest current match per term, within radius stores
  useEffect(() => {
    if (!meta || watches.length === 0) return
    const stores = inRadius.map(s => s.slug).join(',')
    let cancelled = false
    Promise.all(watches.map(async w => {
      const params = new URLSearchParams({ q: w.term, sort: 'price', limit: '5', status: 'active' })
      if (stores) params.set('stores', stores)
      const d = await fetch(`/api/deals?${params}`).then(r => r.json()).catch(() => ({ deals: [] }))
      const hit = (d.deals as DealRecord[] | undefined)?.find(x =>
        x.price != null && (w.maxPrice == null || x.price <= w.maxPrice)) ?? null
      return [w.term, hit] as const
    })).then(entries => { if (!cancelled) setWatchHits(new Map(entries)) })
    return () => { cancelled = true }
  }, [watches, meta, inRadius])

  const doWatch = useCallback((term: string) => setWatches(addWatch(term)), [])
  const doAddToList = useCallback((text: string) => { addListItem(text) }, [])

  const [refreshState, setRefreshState] = useState<'idle' | 'busy' | 'done' | 'running' | 'cooldown' | 'error'>('idle')
  async function refreshNow() {
    setRefreshState('busy')
    try {
      const res = await fetch('/api/refresh', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      setRefreshState(res.ok ? (body.alreadyRunning ? 'running' : 'done') : body.reason === 'cooldown' ? 'cooldown' : 'error')
    } catch { setRefreshState('error') }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
      <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur pt-4 pb-2 flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <div className="flex rounded-xl bg-neutral-900 p-1 text-sm">
            <button onClick={() => setTab('deals')} aria-pressed={tab === 'deals'}
              className={`px-3 py-1.5 rounded-lg ${tab === 'deals' ? 'bg-neutral-700 font-medium' : 'text-neutral-400'}`}>Deals</button>
            <button onClick={() => setTab('list')} aria-pressed={tab === 'list'}
              className={`px-3 py-1.5 rounded-lg ${tab === 'list' ? 'bg-neutral-700 font-medium' : 'text-neutral-400'}`}>My list</button>
          </div>
          <div className="flex-1" />
          <button onClick={onOpenSetup} aria-label="Settings"
            className="rounded-xl px-3 py-2 border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-900 max-w-[45%] truncate">
            📍 {prefs.address.split(',')[0]} · {prefs.radiusMiles}mi
          </button>
        </div>

        {tab === 'deals' && (
          <>
            <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
              <div className="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search deals… (e.g. chicken)"
                  type="search" aria-label="Search deals" enterKeyHint="search"
                  onKeyDown={e => { if (e.key === 'Escape') setQ('') }}
                  className="w-full rounded-xl bg-neutral-800 pl-4 pr-9 py-2.5 text-sm outline-none focus:ring-2 ring-emerald-600 [&::-webkit-search-cancel-button]:hidden" />
                {q && (
                  <button onClick={() => { setQ(''); searchRef.current?.focus() }} aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-700">×</button>
                )}
              </div>
              <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"
                className="flex-1 sm:flex-none rounded-xl bg-neutral-800 border-r-8 border-transparent px-2 py-2.5 text-sm outline-none">
                {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button onClick={() => setUpcoming(u => !u)} aria-pressed={upcoming}
                className={`rounded-xl px-3 py-2.5 text-xs border whitespace-nowrap ${upcoming ? 'bg-sky-700 border-sky-500' : 'border-neutral-700 text-neutral-300'}`}>
                {upcoming ? 'Upcoming' : 'This week'}
              </button>
            </div>
            <Chips
              options={inRadius.map(s => ({
                value: s.slug,
                label: `${s.name}${s.distance_miles != null ? ` · ${s.distance_miles}mi` : ''}`,
                imgSrc: s.logo_url,
              }))}
              selected={storeSel}
              onToggle={v => setStoreSel(cur => {
                const base = cur ?? []
                const next = base.includes(v) ? base.filter(x => x !== v) : [...base, v]
                return next.length ? next : null
              })} />
            <Chips options={CATEGORIES.map(([value, label]) => ({ value, label }))} selected={catSel}
              onToggle={v => setCatSel(cur => (cur?.includes(v) ? null : [v]))} />
          </>
        )}
      </div>

      {!online && (
        <div className="mt-3 rounded-xl border border-sky-900 bg-sky-950/40 px-3 py-2 text-xs text-sky-200" role="status">
          📴 You&apos;re offline — showing deals saved on this device. Prices may have changed.
        </div>
      )}
      {meta && meta.stores.length > 0 && inRadius.length === 0 && (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 flex items-center gap-3" role="status">
          <span className="flex-1">No stores with deals within {prefs.radiusMiles} mi — showing everything nearby. The closest is {Math.min(...meta.stores.map(s => s.distance_miles ?? Infinity)).toFixed(1)} mi away.</span>
          <button onClick={onOpenSetup} className="shrink-0 rounded-lg border border-neutral-700 px-2 py-1 hover:bg-neutral-800">Change radius</button>
        </div>
      )}
      {online && stale && (
        <div className="mt-3 rounded-xl border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200" role="status">
          ⚠️ {lastGood ? <>Deals were last updated {timeAgo(lastGood)}</> : <>The latest deal scans all failed</>} — the daily scan may be failing, so some may have ended.
        </div>
      )}

      {tab === 'list' ? <ListView storeSlugs={inRadiusSlugs} /> : (
        <>
          {watches.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="text-xs uppercase tracking-wide text-neutral-500">👀 Watching</div>
                {(pushStatus === 'idle' || pushStatus === 'error') && (
                  <button onClick={() => enablePush().then(setPushStatus)}
                    className="text-xs rounded-lg border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800">
                    {pushStatus === 'error' ? '⚠️ Couldn’t turn on alerts — try again' : '🔔 Notify me when these go on sale'}
                  </button>
                )}
                {pushStatus === 'needs-install' && <span className="text-xs text-neutral-500">🔔 For alerts: Share → Add to Home Screen, then open it from there</span>}
                {pushStatus === 'subscribed' && <span className="text-xs text-emerald-500">🔔 alerts on</span>}
                {pushStatus === 'denied' && <span className="text-xs text-neutral-600">notifications blocked in browser settings</span>}
              </div>
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
                {watches.map(w => {
                  const hit = watchHits.get(w.term)
                  return (
                    <div key={w.term}
                      className={`shrink-0 rounded-xl px-3 py-2 text-xs border ${hit ? 'border-emerald-700 bg-emerald-950/40' : 'border-neutral-800 bg-neutral-900'}`}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => hit && setSelected(hit)} className="text-left">
                          <div className="font-medium">{w.term}</div>
                          {hit
                            ? <div className="text-emerald-400">${hit.price!.toFixed(2)} at {hit.merchant_name}</div>
                            : <div className="text-neutral-500">no deal this week</div>}
                        </button>
                        <button onClick={() => setWatches(removeWatch(w.term))} aria-label={`Stop watching ${w.term}`}
                          className="text-neutral-600 hover:text-red-400">×</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {dinner.length > 0 && !q && (
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-4">
              <button onClick={() => setDinnerOpen(o => !o)} className="w-full flex items-center justify-between">
                <span className="text-sm font-semibold">🍳 Dinner ideas from this week&apos;s deals</span>
                <span className="text-neutral-500 text-xs">{dinnerOpen ? 'hide' : 'show'}</span>
              </button>
              {dinnerOpen && (
                <div className="grid sm:grid-cols-3 gap-3 mt-3">
                  {dinner.map(idea => (
                    <div key={idea.title} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3.5">
                      <div className="text-2xl">{idea.emoji}</div>
                      <div className="font-medium text-sm mt-1.5">{idea.title}</div>
                      <div className="text-xs text-neutral-400 mt-1 leading-relaxed">{idea.description}</div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {idea.ingredients.filter(i => i.dealName).map(i => (
                          <button key={i.name} onClick={() => setQ(i.name)}
                            className="text-[11px] rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-300 px-2 py-0.5 hover:bg-emerald-900/50">
                            {i.name}{i.price != null ? ` $${i.price.toFixed(2)}` : ''}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs text-neutral-500 mt-2">~${idea.estCost.toFixed(2)} in sale items</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(!loading || loadingMore) && !failed && (
            <div className="flex items-center gap-3 mt-3 min-h-7">
              <div className="text-xs text-neutral-500">{deals.length}{deals.length === limit ? '+' : ''} deals{qTerm ? ` for “${q.trim()}”` : ''}</div>
              {canWatchQuery && (
                <button onClick={() => doWatch(qTerm)}
                  className="text-xs rounded-lg border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800">
                  👀 Watch “{q.trim()}”
                </button>
              )}
            </div>
          )}
          {failed ? (
            <div className="text-center text-neutral-400 mt-20" role="alert">
              <div className="text-4xl mb-2">📡</div>
              {online ? <>Couldn&apos;t load deals.</> : <>You&apos;re offline, and these deals aren&apos;t saved on this device yet.</>}
              <div>
                <button onClick={() => { setResults(null); setRetry(n => n + 1) }}
                  className="mt-3 rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800">Try again</button>
              </div>
            </div>
          ) : loading && !loadingMore ? <SkeletonCards />
            : deals.length === 0 ? (
              <div className="text-center text-neutral-500 mt-20">
                <div className="text-4xl mb-2">🔍</div>
                No deals match{qTerm ? ` “${q.trim()}”` : ''}.
                {hasFilters ? (
                  <div>
                    <button onClick={clearFilters}
                      className="mt-3 rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800">Clear filters</button>
                  </div>
                ) : <><br />Try widening your radius in settings.</>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 mt-1">{deals.map(d => <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />)}</div>
                {(canShowMore || loadingMore) && (
                  <div className="flex justify-center mt-6">
                    <button onClick={() => setMore({ baseKey, limit: Math.min(limit + DEALS_LIMIT, DEALS_MAX) })} disabled={loadingMore}
                      className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60">
                      {loadingMore ? 'Loading…' : 'Show more deals'}
                    </button>
                  </div>
                )}
              </>
            )}

          {meta && (
            <div className="mt-8 text-xs text-neutral-600 flex flex-wrap items-end justify-between gap-3">
              <div>
                {meta.freshness.map(f => (
                  <div key={f.source}>
                    {f.source}: {f.error ? `⚠️ last attempt failed ${timeAgo(f.finished_at)} — showing older data` : `updated ${timeAgo(f.finished_at)}, ${f.deal_count} deals`}
                  </div>
                ))}
              </div>
              <button onClick={refreshNow} disabled={refreshState !== 'idle' && refreshState !== 'error'}
                className="rounded-lg border border-neutral-800 px-3 py-1.5 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 disabled:opacity-60 transition-colors">
                {refreshState === 'idle' && '🔄 Refresh now'}
                {refreshState === 'busy' && 'Starting…'}
                {refreshState === 'done' && '✓ Scan started — new deals in ~3 min'}
                {refreshState === 'running' && '⏳ A scan is already running'}
                {refreshState === 'cooldown' && '✓ Deals were just refreshed'}
                {refreshState === 'error' && '⚠️ Could not start — try again'}
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <DealSheet deal={selected} onClose={() => setSelected(null)}
          onWatch={doWatch} onAddToList={doAddToList} />
      )}
    </div>
  )
}
