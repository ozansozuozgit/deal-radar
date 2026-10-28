'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DealCard, type DealRecord } from './DealCard'
import { SkeletonCards } from './Skeleton'
import { DealSheet } from './DealSheet'
import { ListView } from './ListView'
import { SavingsView } from './SavingsView'
import { MealsView } from './MealsView'
import { WatchChips } from './WatchChips'
import { ForYouRow, type ForYouItem } from './ForYouRow'
import { PlacesMenu, type SavedPlace } from './PlacesMenu'
import { hiddenMatchers, isHidden } from '@/lib/foryou'
import { addWatch, loadWatches, removeWatch, syncWatches, updateWatch, watchOwner, type PriceBasis, type Watch } from '@/lib/client/watches'
import { addToActiveList } from '@/lib/client/list'
import { createCode, initialCode } from '@/lib/client/sync'
import { currentPushStatus, enablePush, linkPush, type PushStatus } from '@/lib/client/push'
import { pricePerLb } from '@/lib/compare'
import type { Prefs } from '@/lib/client/prefs'
import { Icon, type IconName } from './Icon'
import { FilterPanel } from './FilterPanel'
import { hoursSince, timeAgo } from '@/lib/dates'
import { useOnline } from '@/lib/client/online'
import type { DinnerIdea } from '@/lib/dinner'

interface Meta {
  stores: Array<{
    slug: string; name: string; distance_miles: number | null; logo_url: string | null; deal_count: number
    lat: number | null; lng: number | null
  }>
  freshness: Array<{ source: string; finished_at: string; deal_count: number; error: string | null }>
  lastSuccess: string | null
}

const CATEGORIES: Array<[string, string]> = [
  ['produce', 'Produce'], ['meat', 'Meat'], ['seafood', 'Seafood'], ['dairy', 'Dairy'],
  ['bakery', 'Bakery'], ['frozen', 'Frozen'], ['beverages', 'Drinks'], ['pantry', 'Pantry'],
  ['snacks', 'Snacks'], ['household', 'Household'], ['personal-care', 'Personal care'],
]
const SORTS = [
  { value: 'best', label: 'Best vs. history' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'price', label: 'Lowest price' },
  { value: 'ending', label: 'Ending soon' },
]
const DEALS_LIMIT = 200
const DEALS_MAX = 500 // /api/deals clamps here
type Tab = 'deals' | 'list' | 'meals' | 'savings'
const TABS: Array<[Tab, string, IconName]> = [['deals', 'Deals', 'tag'], ['list', 'List', 'list'], ['meals', 'Meals', 'meals'], ['savings', 'Savings', 'savings']]

/** Does a deal meet a watch's target price, if it has one? */
function meetsWatch(w: Watch, d: DealRecord): boolean {
  if (d.price == null) return false
  if (w.maxPrice == null) return true
  if (w.basis === 'lb') { const perLb = pricePerLb(d); return perLb != null && perLb <= w.maxPrice }
  return d.price <= w.maxPrice
}

interface Results { key: string; baseKey: string; deals: DealRecord[]; error: boolean }

export function Feed({ prefs, onOpenSetup, onChangePrefs }: {
  prefs: Prefs
  onOpenSetup: (mode: 'edit' | 'add') => void
  onChangePrefs: (p: Prefs) => void
}) {
  const [tab, setTab] = useState<Tab>('deals')
  // the list code syncs list, watches and purchases across devices; every browser gets one
  const [code, setCode] = useState<string | null>(initialCode)
  useEffect(() => { if (!code) createCode().then(c => { if (c) setCode(c) }) }, [code])

  // saved places: the morning scan covers each one; the current address is saved as one
  const [places, setPlaces] = useState<SavedPlace[]>([])
  const [placesOpen, setPlacesOpen] = useState(false)
  useEffect(() => {
    if (!code) return
    fetch(`/api/places?code=${code}`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return
      const list: SavedPlace[] = d.places ?? []
      setPlaces(list)
      const known = list.some(p => Math.abs(p.lat - prefs.lat) < 1e-6 && Math.abs(p.lng - prefs.lng) < 1e-6)
      if (!known) {
        fetch('/api/places', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code, label: prefs.label ?? (list.length ? prefs.address.split(',')[0] : 'Home'),
            address: prefs.address, lat: prefs.lat, lng: prefs.lng, zip: prefs.zip, radius: prefs.radiusMiles,
          }),
        }).then(r => (r.ok ? r.json() : null)).then(res => {
          if (res?.place) setPlaces(cur => [...cur.filter(p => p.id !== res.place.id), res.place])
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [code, prefs])
  function pickPlace(p: SavedPlace) {
    setPlacesOpen(false)
    onChangePrefs({
      address: p.address, lat: p.lat, lng: p.lng, zip: p.zip ?? prefs.zip,
      radiusMiles: Number(p.radius_miles), label: p.label, enabledStores: prefs.enabledStores,
    })
  }
  function deletePlace(p: SavedPlace) {
    setPlaces(cur => cur.filter(x => x.id !== p.id))
    fetch('/api/places', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, id: p.id }) }).catch(() => {})
  }

  // "not interested" terms, synced with the list code
  const [hidden, setHidden] = useState<string[]>([])
  const [hiddenOpen, setHiddenOpen] = useState(false)
  useEffect(() => {
    if (!code) return
    fetch(`/api/hidden?code=${code}`).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setHidden(d.terms ?? []) }).catch(() => {})
  }, [code])
  const hiddenM = useMemo(() => hiddenMatchers(hidden), [hidden])
  const hideTerm = useCallback((term: string) => {
    const t = term.trim().toLowerCase()
    setHidden(cur => (cur.includes(t) ? cur : [...cur, t]))
    if (code) fetch('/api/hidden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, term: t }) }).catch(() => {})
  }, [code])
  function unhide(term: string) {
    setHidden(cur => cur.filter(t => t !== term))
    if (code) fetch('/api/hidden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, term }) }).catch(() => {})
  }
  const [meta, setMeta] = useState<Meta | null>(null)
  // results are tagged with the query that produced them, so a stale response is
  // never shown for newer filters and "loading" is simply "results don't match yet"
  const [results, setResults] = useState<Results | null>(null)
  const [retry, setRetry] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  // a quick narrowing within your stores, for this visit only
  const [storeFilter, setStoreFilter] = useState<string[] | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [catSel, setCatSel] = useState<string[] | null>(null)
  const [sort, setSort] = useState('best')
  const [upcoming, setUpcoming] = useState(false)
  const [selected, setSelected] = useState<DealRecord | null>(null)
  // Feed only mounts client-side after prefs load, so reading localStorage here is safe
  const [watches, setWatches] = useState<Watch[]>(() => loadWatches())
  const [watchHits, setWatchHits] = useState<Map<string, DealRecord | null>>(new Map())
  const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported')
  const [dinner, setDinner] = useState<DinnerIdea[]>([])
  const [dinnerOpen, setDinnerOpen] = useState(false)

  useEffect(() => { currentPushStatus().then(setPushStatus) }, [])
  const owner = useMemo(() => watchOwner(code), [code])
  useEffect(() => {
    if (!code) return
    syncWatches(code).then(setWatches).catch(() => {})
    linkPush(code)
  }, [code])
  useEffect(() => {
    fetch('/api/dinner').then(r => r.json()).then(d => setDinner(Array.isArray(d?.ideas) ? d.ideas : [])).catch(() => {})
  }, [])
  useEffect(() => {
    fetch(`/api/meta?lat=${prefs.lat}&lng=${prefs.lng}`).then(r => r.json())
      .then(d => setMeta({
        stores: Array.isArray(d?.stores) ? d.stores : [],
        freshness: Array.isArray(d?.freshness) ? d.freshness : [],
        lastSuccess: typeof d?.lastSuccess === 'string' ? d.lastSuccess : null,
      }))
      .catch(() => setMeta({ stores: [], freshness: [], lastSuccess: null }))
  }, [prefs.lat, prefs.lng])
  const home = useMemo(() => ({ lat: prefs.lat, lng: prefs.lng }), [prefs.lat, prefs.lng])
  const distanceBySlug = useMemo(() => new Map((meta?.stores ?? []).map(s => [s.slug, s.distance_miles])), [meta])

  const wantForYou = useRef(false)
  // open a specific deal: from a notification (?deal=ID) or the alerts list
  const openDealById = useCallback((id: number) => {
    fetch(`/api/deals?ids=${id}`).then(r => (r.ok ? r.json() : null))
      .then(d => { const deal = d?.deals?.[0]; if (deal) setSelected(deal) }).catch(() => {})
  }, [])
  const openUrl = useCallback((raw: string) => {
    const url = new URL(raw, window.location.origin)
    const id = Number(url.searchParams.get('deal'))
    if (Number.isInteger(id) && id > 0) { setTab('deals'); openDealById(id) }
  }, [openDealById])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('foryou')) { // from the weekly digest
      wantForYou.current = true
      url.searchParams.delete('foryou')
      window.history.replaceState({}, '', url.toString())
    }
    const id = Number(url.searchParams.get('deal'))
    if (url.searchParams.has('deal')) {
      if (Number.isInteger(id) && id > 0) openDealById(id) // the feed tab is already showing
      url.searchParams.delete('deal')
      window.history.replaceState({}, '', url.toString())
    }
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'open' && typeof e.data.url === 'string') openUrl(e.data.url) }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [openUrl, openDealById])

  const inRadius = useMemo(() =>
    (meta?.stores ?? []).filter(s => s.distance_miles == null || s.distance_miles <= prefs.radiusMiles),
    [meta, prefs.radiusMiles])
  const inRadiusSlugs = useMemo(() => inRadius.map(s => s.slug), [inRadius])
  // "my stores": the ones you actually shop at, used everywhere (feed, For you, list, meals).
  // Saved picks can point at stores that are out of radius here; if none are left, use all.
  const mine = useMemo(() => {
    const picked = prefs.enabledStores ? inRadius.filter(s => prefs.enabledStores!.includes(s.slug)) : []
    return picked.length ? picked : inRadius
  }, [inRadius, prefs.enabledStores])
  const mySlugs = useMemo(() => mine.map(s => s.slug), [mine])
  function toggleMyStore(slug: string) {
    // start from what the checkboxes show, keeping picks for stores out of radius here
    const base = [...(prefs.enabledStores ?? []).filter(s => !inRadiusSlugs.includes(s)), ...mySlugs]
    const next = base.includes(slug) ? base.filter(s => s !== slug) : [...base, slug]
    if (!next.some(s => inRadiusSlugs.includes(s))) return // keep at least one
    onChangePrefs({ ...prefs, enabledStores: inRadiusSlugs.every(s => next.includes(s)) ? null : next })
    setStoreFilter(cur => cur?.filter(s => next.includes(s)) || null)
  }

  const baseKey = useMemo(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    // saved picks can point at stores that are now out of radius or gone; ignore those
    const picked = storeFilter?.filter(s => mySlugs.includes(s))
    const stores = picked?.length ? picked : mySlugs
    if (stores.length) params.set('stores', stores.join(','))
    if (catSel?.length === 1) params.set('category', catSel[0])
    params.set('status', upcoming ? 'upcoming' : 'active')
    params.set('sort', sort)
    return params.toString()
  }, [q, storeFilter, catSel, sort, upcoming, mySlugs])
  // "Show more" raises the limit for the current filters only; any filter change resets it
  const [more, setMore] = useState({ baseKey: '', limit: DEALS_LIMIT })
  const limit = more.baseKey === baseKey ? more.limit : DEALS_LIMIT
  const dealsKey = `${baseKey}&limit=${limit}`
  const loading = results?.key !== dealsKey
  // while loading more, keep showing what we have instead of flashing skeletons
  const loadingMore = loading && results?.baseKey === baseKey && !results.error
  const failed = !loading && !!results?.error
  // distances are from where you are, not from where the daily scan runs
  const deals = useMemo(() => (results && (!loading || loadingMore) ? results.deals : [])
    .map(d => (distanceBySlug.has(d.merchant_slug) ? { ...d, distance_miles: distanceBySlug.get(d.merchant_slug) ?? null } : d)),
  [results, loading, loadingMore, distanceBySlug])
  const canShowMore = !loading && !failed && deals.length === limit && limit < DEALS_MAX
  const shown = useMemo(() => (hidden.length ? deals.filter(d => !isHidden(d, hiddenM)) : deals), [deals, hidden.length, hiddenM])
  const hiddenCount = deals.length - shown.length

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
  const closestMiles = Math.min(...(meta?.stores ?? []).map(s => s.distance_miles ?? Infinity))

  const hasFilters = !!q.trim() || !!storeFilter || !!catSel || upcoming
  const filterCount = (storeFilter?.length ?? 0) + (catSel?.length ?? 0) + (upcoming ? 1 : 0) + (sort !== 'best' ? 1 : 0)
  function clearFilters() { setQ(''); setStoreFilter(null); setCatSel(null); setUpcoming(false) }
  const qTerm = q.trim().toLowerCase()
  const canWatchQuery = qTerm.length >= 3 && !watches.some(w => w.term === qTerm)

  // watches: cheapest current match per term, within radius stores
  useEffect(() => {
    if (!meta || watches.length === 0) return
    const stores = mySlugs.join(',')
    let cancelled = false
    Promise.all(watches.map(async w => {
      const params = new URLSearchParams({ q: w.term, sort: 'price', limit: '20', status: 'active' })
      if (stores) params.set('stores', stores)
      const d = await fetch(`/api/deals?${params}`).then(r => r.json()).catch(() => ({ deals: [] }))
      const hit = (d.deals as DealRecord[] | undefined)?.find(x => meetsWatch(w, x)) ?? null
      return [w.term, hit] as const
    })).then(entries => { if (!cancelled) setWatchHits(new Map(entries)) })
    return () => { cancelled = true }
  }, [watches, meta, mySlugs])

  // For you: picked server-side from the list, watches and purchases
  const [forYou, setForYou] = useState<ForYouItem[]>([])
  const storesKey = mySlugs.join(',')
  useEffect(() => {
    if (!code || !meta || tab !== 'deals') return
    const ctrl = new AbortController()
    fetch('/api/foryou', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ code, stores: storesKey ? storesKey.split(',') : [] }),
    }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setForYou(d.items ?? []) }).catch(() => {})
    return () => ctrl.abort()
  }, [code, meta, tab, storesKey, hidden.length, watches.length])
  const forYouShown = useMemo(() => forYou.filter(f => !isHidden(f.deal, hiddenM)), [forYou, hiddenM])
  useEffect(() => {
    if (!wantForYou.current || !forYouShown.length) return
    wantForYou.current = false
    requestAnimationFrame(() => document.getElementById('foryou')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [forYouShown.length])

  const doWatch = useCallback((term: string) => setWatches(addWatch(term, owner)), [owner])
  // adding from a deal pins that exact deal, so the list prices what you looked at
  const doAddToList = useCallback((deal: DealRecord) => {
    addToActiveList(code, { text: deal.name, qty: 1, pinnedDealId: deal.id })
  }, [code])

  const [refreshState, setRefreshState] = useState<'idle' | 'busy' | 'done' | 'running' | 'cooldown' | 'error'>('idle')
  async function refreshNow() {
    setRefreshState('busy')
    try {
      const res = await fetch('/api/refresh', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      setRefreshState(res.ok ? (body.alreadyRunning ? 'running' : 'done') : body.reason === 'cooldown' ? 'cooldown' : 'error')
    } catch { setRefreshState('error') }
  }


  const placeLabel = `${prefs.label ?? prefs.address.split(',')[0]} · ${prefs.radiusMiles} mi`
  const storeName = (slug: string) => inRadius.find(s => s.slug === slug)?.name ?? slug
  const filterPanel = (
    <FilterPanel sorts={SORTS} sort={sort} onSort={setSort} upcoming={upcoming} onUpcoming={setUpcoming}
      stores={inRadius} mySlugs={mySlugs} allMine={!prefs.enabledStores || mine.length === inRadius.length}
      onToggleMine={toggleMyStore} storeFilter={storeFilter}
      onToggleFilter={v => setStoreFilter(cur => {
        const base = cur ?? []
        const next = base.includes(v) ? base.filter(x => x !== v) : [...base, v]
        return next.length ? next : null
      })}
      categories={CATEGORIES} catSel={catSel} onToggleCat={v => setCatSel(cur => (cur?.includes(v) ? null : [v]))} />
  )
  const placeButton = (align: 'left' | 'right', className: string) => (
    <div className="relative min-w-0">
      <button onClick={() => setPlacesOpen(o => !o)} aria-label="Places and settings" aria-expanded={placesOpen}
        className={`max-w-full inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-100 ${className}`}>
        <Icon name="pin" className="w-4 h-4" />
        <span className="truncate">{placeLabel}</span>
        <Icon name="chevron" className="w-3.5 h-3.5" />
      </button>
      {placesOpen && (
        <PlacesMenu places={places} prefs={prefs} onPick={pickPlace} onDelete={deletePlace} align={align}
          onAdd={() => { setPlacesOpen(false); onOpenSetup('add') }}
          onEdit={() => { setPlacesOpen(false); onOpenSetup('edit') }}
          onClose={() => setPlacesOpen(false)} />
      )}
    </div>
  )
  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [
    ...(storeFilter ?? []).map(s => ({ key: `s-${s}`, label: storeName(s), clear: () => setStoreFilter(cur => cur?.filter(x => x !== s).length ? cur.filter(x => x !== s) : null) })),
    ...(catSel ?? []).map(c => ({ key: `c-${c}`, label: CATEGORIES.find(([v]) => v === c)?.[1] ?? c, clear: () => setCatSel(null) })),
    ...(upcoming ? [{ key: 'up', label: 'Next week', clear: () => setUpcoming(false) }] : []),
    ...(sort !== 'best' ? [{ key: 'sort', label: SORTS.find(x => x.value === sort)?.label ?? sort, clear: () => setSort('best') }] : []),
  ]

  return (
    <div className="w-full max-w-[1440px] mx-auto lg:flex">
      {/* desktop: navigation and filters live in a sidebar */}
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-screen w-64 xl:w-72 shrink-0 overflow-y-auto border-r border-line px-5 py-6">
        <div className="flex flex-col gap-1">
          <div className="font-condensed font-extrabold text-[28px] leading-none tracking-tight">Deal Radar</div>
          {placeButton('left', 'text-sm')}
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Sections">
          {TABS.map(([value, label, icon]) => (
            <button key={value} onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] ${tab === value ? 'bg-ink text-white font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}>
              <Icon name={icon} />{label}
            </button>
          ))}
        </nav>
        {tab === 'deals' && <div className="border-t border-line pt-5">{filterPanel}</div>}
      </aside>

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10">
        <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 flex flex-col gap-2.5 lg:pt-6">
          <div className="flex items-end justify-between gap-3 lg:hidden">
            <h1 className="font-condensed font-extrabold text-[28px] leading-none tracking-tight">{TABS.find(t => t[0] === tab)?.[1]}</h1>
            {placeButton('right', 'text-[13px]')}
          </div>
          {tab === 'deals' && (
            <>
              <div className="flex gap-2 items-center">
                <div className="relative min-w-0 flex-1">
                  <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                  <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search deals (e.g. chicken)"
                    type="search" aria-label="Search deals" enterKeyHint="search"
                    onKeyDown={e => { if (e.key === 'Escape') setQ('') }}
                    className="w-full rounded-xl bg-card border border-line pl-10 pr-9 py-2.5 text-[15px] outline-none focus:border-ink focus:ring-1 ring-ink [&::-webkit-search-cancel-button]:hidden" />
                  {q && (
                    <button onClick={() => { setQ(''); searchRef.current?.focus() }} aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full grid place-items-center text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800">
                      <Icon name="x" className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button onClick={() => setFiltersOpen(true)} aria-label="Filters and my stores"
                  className="lg:hidden relative w-11 h-11 shrink-0 rounded-xl bg-card border border-line grid place-items-center">
                  <Icon name="sliders" />
                  {filterCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-ink text-white text-[11px] font-bold grid place-items-center">{filterCount}</span>}
                </button>
              </div>
              {activeChips.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                  {activeChips.map(c => (
                    <button key={c.key} onClick={c.clear} aria-label={`Remove filter ${c.label}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-ink text-white pl-3 pr-2 py-1 text-xs">
                      {c.label}<Icon name="x" className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!online && (
          <div className="mt-2 rounded-xl border border-line bg-card px-3 py-2 text-sm text-neutral-400" role="status">
            You&apos;re offline. Showing deals saved on this device; prices may have changed.
          </div>
        )}
        {online && stale && (
          <div className="mt-2 rounded-xl border border-line bg-card px-3 py-2 text-sm text-neutral-400" role="status">
            {lastGood ? <>Deals were last updated {timeAgo(lastGood)}</> : <>The latest deal scans all failed</>}. The daily scan may be failing, so some may have ended.
          </div>
        )}

        {tab === 'list' ? <ListView key={code ?? 'local'} code={code} storeSlugs={mySlugs} stores={mine} home={home} />
          : tab === 'savings' ? <SavingsView code={code} />
          : tab === 'meals' ? <MealsView code={code} storeSlugs={mySlugs} onSearch={term => { setQ(term); setTab('deals') }} /> : (
          <>
            {meta && inRadius.length === 0 && (
              <div className="mt-4 rounded-xl border border-line bg-card p-4 text-sm">
                <div className="font-bold">No scanned stores within {prefs.radiusMiles} mi of {prefs.label ?? 'here'} yet.</div>
                <div className="text-neutral-400 mt-1">
                  Showing everything nearby for now{Number.isFinite(closestMiles) ? <> (the closest scanned store is {closestMiles.toFixed(1)} mi away)</> : null}.
                  This place is saved, so the next morning scan includes it. Want deals sooner?
                </div>
                <button onClick={() => onOpenSetup('edit')}
                  className="mt-2 mr-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">Change radius</button>
                <button onClick={refreshNow} disabled={refreshState !== 'idle' && refreshState !== 'error'}
                  className="mt-2 rounded-lg bg-ink text-white px-3 py-1.5 text-xs disabled:opacity-60">
                  {refreshState === 'done' ? 'Scan started. Check back in a few minutes' : 'Scan now'}
                </button>
              </div>
            )}

            {!hasFilters && forYouShown.length > 0 && <ForYouRow items={forYouShown} onOpen={setSelected} />}

            {watches.length > 0 && (
              <WatchChips watches={watches} hits={watchHits} pushStatus={pushStatus}
                onEnablePush={() => enablePush(code).then(setPushStatus)}
                onUpdate={(term, patch: { maxPrice: number | null; basis: PriceBasis }) => setWatches(updateWatch(term, owner, patch))}
                onRemove={term => setWatches(removeWatch(term, owner))}
                onOpen={setSelected} onOpenUrl={openUrl} />
            )}

            {dinner.length > 0 && !q && (
              <div className="mt-4 rounded-xl border border-line bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setDinnerOpen(o => !o)} aria-expanded={dinnerOpen} className="flex items-center gap-2 text-sm font-bold min-w-0">
                    <Icon name="meals" className="w-4 h-4" />
                    <span className="truncate">Dinner ideas from this week&apos;s deals</span>
                    <Icon name="chevron" className={`w-4 h-4 transition-transform ${dinnerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={() => setTab('meals')} className="shrink-0 text-sm text-sky-400 hover:underline">Plan meals</button>
                </div>
                {dinnerOpen && (
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-3">
                    {dinner.map(idea => (
                      <div key={idea.title} className="rounded-lg bg-neutral-950 p-3">
                        <div className="font-bold text-sm">{idea.emoji} {idea.title}</div>
                        <div className="text-xs text-neutral-400 mt-1 leading-relaxed">{idea.description}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {idea.ingredients.filter(i => i.dealName).map(i => (
                            <button key={i.name} onClick={() => setQ(i.name)}
                              className="text-xs rounded-full bg-card border border-line px-2 py-0.5 hover:border-neutral-600">
                              {i.name}{i.price != null ? <b className="ml-1">${i.price.toFixed(2)}</b> : null}
                            </button>
                          ))}
                        </div>
                        <div className="text-xs text-neutral-500 mt-2">About ${idea.estCost.toFixed(2)} in sale items</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(!loading || loadingMore) && !failed && (
              <div className="flex items-center gap-3 mt-5 mb-2 min-h-7 flex-wrap">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  {qTerm ? `${shown.length}${deals.length === limit ? '+' : ''} deals for “${q.trim()}”` : `${SORTS.find(x => x.value === sort)?.label} · ${shown.length}${deals.length === limit ? '+' : ''} deals`}
                </h2>
                {hidden.length > 0 && (
                  <button onClick={() => setHiddenOpen(o => !o)} aria-expanded={hiddenOpen} className="text-xs text-neutral-500 hover:text-neutral-100">
                    {hiddenCount > 0 ? `${hiddenCount} hidden` : `${hidden.length} hidden term${hidden.length === 1 ? '' : 's'}`}
                  </button>
                )}
                {canWatchQuery && (
                  <button onClick={() => doWatch(qTerm)}
                    className="inline-flex items-center gap-1 text-xs rounded-lg border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800">
                    <Icon name="eye" className="w-3.5 h-3.5" />Watch “{q.trim()}”
                  </button>
                )}
              </div>
            )}
            {hiddenOpen && hidden.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {hidden.map(t => (
                  <button key={t} onClick={() => unhide(t)} aria-label={`Show ${t} again`}
                    className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800">{t} ×</button>
                ))}
              </div>
            )}
            {failed ? (
              <div className="text-center text-neutral-400 mt-20" role="alert">
                {online ? <>Couldn&apos;t load deals.</> : <>You&apos;re offline, and these deals aren&apos;t saved on this device yet.</>}
                <div>
                  <button onClick={() => { setResults(null); setRetry(n => n + 1) }}
                    className="mt-3 rounded-xl bg-ink text-white px-4 py-2 text-sm">Try again</button>
                </div>
              </div>
            ) : loading && !loadingMore ? <SkeletonCards />
              : shown.length === 0 ? (
                <div className="text-center text-neutral-500 mt-20">
                  No deals match{qTerm ? ` “${q.trim()}”` : ''}.
                  {hasFilters ? (
                    <div>
                      <button onClick={clearFilters}
                        className="mt-3 rounded-xl bg-ink text-white px-4 py-2 text-sm">Clear filters</button>
                    </div>
                  ) : <><br />Try widening your radius in settings.</>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">{shown.map(d => <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />)}</div>
                  {(canShowMore || loadingMore) && (
                    <div className="flex justify-center mt-6">
                      <button onClick={() => setMore({ baseKey, limit: Math.min(limit + DEALS_LIMIT, DEALS_MAX) })} disabled={loadingMore}
                        className="rounded-xl border border-neutral-700 bg-card px-5 py-2.5 text-sm hover:border-ink disabled:opacity-60">
                        {loadingMore ? 'Loading…' : 'Show more deals'}
                      </button>
                    </div>
                  )}
                </>
              )}

            {meta && (
              <div className="mt-10 text-xs text-neutral-500 flex flex-wrap items-end justify-between gap-3">
                <div>
                  {meta.freshness.map(f => (
                    <div key={f.source}>
                      {f.source}: {f.error ? `last attempt failed ${timeAgo(f.finished_at)}, showing older data` : `updated ${timeAgo(f.finished_at)}, ${f.deal_count} deals`}
                    </div>
                  ))}
                </div>
                <button onClick={refreshNow} disabled={refreshState !== 'idle' && refreshState !== 'error'}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-400 hover:text-neutral-100 hover:border-neutral-600 disabled:opacity-60 transition-colors">
                  {refreshState === 'idle' && 'Refresh now'}
                  {refreshState === 'busy' && 'Starting…'}
                  {refreshState === 'done' && 'Scan started. New deals in about 3 min'}
                  {refreshState === 'running' && 'A scan is already running'}
                  {refreshState === 'cooldown' && 'Deals were just refreshed'}
                  {refreshState === 'error' && 'Could not start. Try again'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* phones: tabs at the bottom, in thumb reach */}
      <nav aria-label="Sections"
        className="lg:hidden fixed inset-x-0 bottom-0 z-20 bg-card/95 backdrop-blur border-t border-line grid grid-cols-4 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map(([value, label, icon]) => (
          <button key={value} onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-1 text-[11px] font-bold ${tab === value ? 'text-ink' : 'text-neutral-500'}`}>
            <Icon name={icon} className="w-6 h-6" />{label}
            <span className={`w-1 h-1 rounded-full bg-current ${tab === value ? '' : 'opacity-0'}`} />
          </button>
        ))}
      </nav>

      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal aria-label="Filters and my stores">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-card px-4 pt-3 animate-sheet-in"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto w-10 h-1 rounded-full bg-neutral-700 mb-3" />
            {filterPanel}
            <button onClick={() => setFiltersOpen(false)}
              className="sticky bottom-0 mt-5 w-full rounded-xl bg-ink text-white py-3 text-sm font-bold">Show deals</button>
          </div>
        </div>
      )}

      {selected && (
        <DealSheet deal={selected} onClose={() => setSelected(null)}
          onWatch={doWatch} onAddToList={doAddToList} onHide={code ? hideTerm : undefined} />
      )}
    </div>
  )
}
