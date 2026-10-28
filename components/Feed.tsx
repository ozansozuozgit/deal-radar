'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DealCard, type DealRecord } from './DealCard'
import { Chips } from './Chips'
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
import { savePrefs, type Prefs } from '@/lib/client/prefs'
import { timeAgo } from '@/lib/dates'

interface DinnerIdea {
  title: string; emoji: string; description: string
  ingredients: Array<{ name: string; dealName?: string; store?: string; price?: number }>
  estCost: number
}

interface Meta {
  stores: Array<{
    slug: string; name: string; distance_miles: number | null; logo_url: string | null; deal_count: number
    lat: number | null; lng: number | null
  }>
  freshness: Array<{ source: string; finished_at: string; deal_count: number; error: string | null }>
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
type Tab = 'deals' | 'list' | 'meals' | 'savings'
const TABS: Array<[Tab, string]> = [['deals', 'Deals'], ['list', 'List'], ['meals', 'Meals'], ['savings', 'Savings']]

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
      radiusMiles: Number(p.radius_miles), label: p.label, enabledStores: null,
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
  const owner = useMemo(() => watchOwner(code), [code])
  useEffect(() => {
    if (!code) return
    syncWatches(code).then(setWatches).catch(() => {})
    linkPush(code)
  }, [code])
  useEffect(() => {
    fetch('/api/dinner').then(r => r.json()).then(d => setDinner(d.ideas ?? [])).catch(() => {})
  }, [])
  useEffect(() => {
    fetch(`/api/meta?lat=${prefs.lat}&lng=${prefs.lng}`).then(r => r.json()).then(setMeta)
      .catch(() => setMeta({ stores: [], freshness: [] }))
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

  // remember store picks across visits
  useEffect(() => { savePrefs({ ...prefs, enabledStores: storeSel }) }, [prefs, storeSel])

  const baseKey = useMemo(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    const stores = storeSel ?? inRadius.map(s => s.slug)
    if (stores.length) params.set('stores', stores.join(','))
    if (catSel?.length === 1) params.set('category', catSel[0])
    params.set('status', upcoming ? 'upcoming' : 'active')
    params.set('sort', sort)
    return params.toString()
  }, [q, storeSel, catSel, sort, upcoming, inRadius])
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
      const params = new URLSearchParams({ q: w.term, sort: 'price', limit: '20', status: 'active' })
      if (stores) params.set('stores', stores)
      const d = await fetch(`/api/deals?${params}`).then(r => r.json()).catch(() => ({ deals: [] }))
      const hit = (d.deals as DealRecord[] | undefined)?.find(x => meetsWatch(w, x)) ?? null
      return [w.term, hit] as const
    })).then(entries => { if (!cancelled) setWatchHits(new Map(entries)) })
    return () => { cancelled = true }
  }, [watches, meta, inRadius])

  // For you: picked server-side from the list, watches and purchases
  const [forYou, setForYou] = useState<ForYouItem[]>([])
  const storesKey = inRadiusSlugs.join(',')
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

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
      <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur pt-4 pb-2 flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <div className="flex shrink-0 rounded-xl bg-neutral-900 p-1 text-sm">
            {TABS.map(([value, label]) => (
              <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value}
                className={`px-2 sm:px-3 py-1.5 rounded-lg whitespace-nowrap ${tab === value ? 'bg-neutral-700 font-medium' : 'text-neutral-400'}`}>{label}</button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 flex justify-end">
            <button onClick={() => setPlacesOpen(o => !o)} aria-label="Places and settings" aria-expanded={placesOpen}
              className="max-w-full rounded-xl px-3 py-2 border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-900 truncate">
              📍 {prefs.label ?? prefs.address.split(',')[0]} · {prefs.radiusMiles}mi ▾
            </button>
            {placesOpen && (
              <PlacesMenu places={places} prefs={prefs} onPick={pickPlace} onDelete={deletePlace}
                onAdd={() => { setPlacesOpen(false); onOpenSetup('add') }}
                onEdit={() => { setPlacesOpen(false); onOpenSetup('edit') }}
                onClose={() => setPlacesOpen(false)} />
            )}
          </div>
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

      {tab === 'list' ? <ListView key={code ?? 'local'} code={code} storeSlugs={inRadiusSlugs} stores={inRadius} home={home} />
        : tab === 'savings' ? <SavingsView code={code} />
        : tab === 'meals' ? <MealsView code={code} storeSlugs={inRadiusSlugs} onSearch={term => { setQ(term); setTab('deals') }} /> : (
        <>
          {meta && inRadius.length === 0 && (
            <div className="mt-4 rounded-xl border border-sky-900 bg-sky-950/40 p-4 text-sm">
              <div className="font-medium">No scanned stores within {prefs.radiusMiles} mi of {prefs.label ?? 'here'} yet.</div>
              <div className="text-neutral-400 mt-1">This place is saved, so the next morning scan includes it. Want deals sooner?</div>
              <button onClick={refreshNow} disabled={refreshState !== 'idle' && refreshState !== 'error'}
                className="mt-2 rounded-lg border border-sky-800 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-900/40 disabled:opacity-60">
                {refreshState === 'done' ? '✓ Scan started — check back in a few minutes' : '🔄 Scan now'}
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
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-4">
              <button onClick={() => setDinnerOpen(o => !o)} className="w-full flex items-center justify-between">
                <span className="text-sm font-semibold">🍳 Dinner ideas from this week&apos;s deals</span>
                <span className="text-neutral-500 text-xs">{dinnerOpen ? 'hide' : 'show'}</span>
              </button>
              {dinnerOpen && (
                <button onClick={() => setTab('meals')} className="mt-1 text-xs text-sky-400 hover:text-sky-300">
                  Plan the whole week and add it to your list →
                </button>
              )}
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
              <div className="text-xs text-neutral-500">{shown.length}{deals.length === limit ? '+' : ''} deals{qTerm ? ` for “${q.trim()}”` : ''}</div>
              {hidden.length > 0 && (
                <button onClick={() => setHiddenOpen(o => !o)} aria-expanded={hiddenOpen} className="text-xs text-neutral-600 hover:text-neutral-300">
                  🙈 {hiddenCount > 0 ? `${hiddenCount} hidden` : `${hidden.length} hidden term${hidden.length === 1 ? '' : 's'}`}
                </button>
              )}
              {canWatchQuery && (
                <button onClick={() => doWatch(qTerm)}
                  className="text-xs rounded-lg border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800">
                  👀 Watch “{q.trim()}”
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
              <div className="text-4xl mb-2">📡</div>
              Couldn&apos;t load deals.
              <div>
                <button onClick={() => { setResults(null); setRetry(n => n + 1) }}
                  className="mt-3 rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800">Try again</button>
              </div>
            </div>
          ) : loading && !loadingMore ? <SkeletonCards />
            : shown.length === 0 ? (
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 mt-1">{shown.map(d => <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />)}</div>
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
          onWatch={doWatch} onAddToList={doAddToList} onHide={code ? hideTerm : undefined} />
      )}
    </div>
  )
}
