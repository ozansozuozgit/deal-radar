'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addListItem, loadList, removeListItem, removeListItems, updateListItem, type ListItem } from '@/lib/client/list'
import { assignItems, compareList, type CompareDeal, type CompareItem, type DealPick } from '@/lib/compare'
import { formatQty, parseItem, qtyStep } from '@/lib/quantity'
import { tripOptions, type LatLng } from '@/lib/trip'
import { MatchPicker } from './MatchPicker'
import { canonicalize } from '@/lib/parse/canonical'
import { cycleText, type PriceStats } from '@/lib/priceCheck'
import { TripMap, type MapStore } from './TripMap'

export interface StoreInfo { slug: string; name: string; lat?: number | null; lng?: number | null }

interface ServerItem {
  text: string; qty: number | null; unit: string | null
  pinned_deal_id: number | null; rejected_deal_ids: number[] | null; checked: boolean | null
}

const fromServer = (i: ServerItem): ListItem => ({
  text: i.text, qty: Number(i.qty ?? 1), unit: i.unit,
  pinnedDealId: i.pinned_deal_id, rejectedDealIds: i.rejected_deal_ids ?? [], checked: !!i.checked,
})

const money = (n: number) => `$${n.toFixed(2)}`

export function ListView({ code, storeSlugs, stores, home }: {
  code: string | null
  storeSlugs: string[]
  stores: StoreInfo[]
  home: LatLng | null
}) {
  const [items, setItems] = useState<ListItem[]>(() => (code ? [] : loadList()))
  const [draft, setDraft] = useState('')
  const [deals, setDeals] = useState<CompareDeal[] | null>(null)
  const [stats, setStats] = useState<Map<string, PriceStats>>(new Map())
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [mode, setMode] = useState<'plan' | 'shop'>('plan')
  const [planKey, setPlanKey] = useState<string | null>(null) // null = recommended
  const [picking, setPicking] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [allOptions, setAllOptions] = useState(false)
  const [tripState, setTripState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

  const refetchShared = useCallback((c: string) =>
    fetch(`/api/list?code=${encodeURIComponent(c)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(d => { if (d) setItems((d.items ?? []).map(fromServer)) })
      .catch(() => { /* offline: keep what we have */ }), [])

  // load the shared list, and refresh it when returning to the tab
  useEffect(() => {
    if (!code) return
    refetchShared(code)
    const onFocus = () => refetchShared(code)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [code, refetchShared])

  // match server-side against every active deal (not just one page of the feed);
  // keyed on what affects matching so checking items off doesn't re-fetch
  const compareItems: CompareItem[] = useMemo(() => items.map(i => ({
    text: i.text, qty: i.qty ?? 1, unit: i.unit ?? null,
    pinnedDealId: i.pinnedDealId ?? null, rejectedDealIds: i.rejectedDealIds ?? [],
  })), [items])
  const fetchKey = JSON.stringify(compareItems.map(i => [i.text, i.pinnedDealId]))
  useEffect(() => {
    const body: Array<{ text: string; pinnedDealId: number | null }> =
      JSON.parse(fetchKey).map(([text, pinnedDealId]: [string, number | null]) => ({ text, pinnedDealId }))
    if (!body.length) return
    const ctrl = new AbortController()
    const t = setTimeout(() =>
      fetch('/api/compare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ items: body, stores: storeSlugs }),
      }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(d => {
          setDeals((d.deals ?? []) as CompareDeal[])
          setStats(new Map(((d.stats ?? []) as PriceStats[]).map(st => [st.canonical, st])))
        })
        .catch(() => { if (!ctrl.signal.aborted) setDeals([]) }), 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [fetchKey, storeSlugs])

  const result = useMemo(
    () => (deals && items.length ? compareList(compareItems, deals) : null),
    [deals, items.length, compareItems])

  const locations = useMemo(() => new Map(stores
    .filter(s => s.lat != null && s.lng != null)
    .map(s => [s.slug, { lat: s.lat!, lng: s.lng! }])), [stores])
  const options = useMemo(() => (result ? tripOptions(result, locations, home) : []), [result, locations, home])
  const plan = options.find(o => o.key === planKey) ?? options.find(o => o.recommended) ?? null
  const assignment = useMemo(() => (result ? assignItems(result, plan?.slugs ?? null) : new Map<string, DealPick | null>()), [result, plan])

  const mapStores: MapStore[] = useMemo(() => (result?.stores ?? []).flatMap(s => {
    const loc = locations.get(s.slug)
    return loc ? [{ slug: s.slug, name: s.name, matched: s.matched, ...loc }] : []
  }), [result, locations])
  const route = useMemo(() => plan?.stops ?? [], [plan])

  // ---- mutations: optimistic locally, then the server (or local storage) ----
  async function add() {
    const parsed = parseItem(draft)
    if (!parsed.text) return
    setDraft('')
    const item: ListItem = { text: parsed.text, qty: parsed.qty, unit: parsed.unit }
    if (code) {
      setItems(cur => cur.some(i => i.text.toLowerCase() === item.text.toLowerCase()) ? cur : [...cur, item])
      await fetch('/api/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...item }) })
      refetchShared(code)
    } else {
      setItems(addListItem(item))
    }
  }

  function change(text: string, patch: Partial<ListItem>) {
    if (code) {
      setItems(cur => cur.map(i => (i.text === text ? { ...i, ...patch } : i)))
      fetch('/api/list', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, text, ...patch }) })
        .catch(() => {})
    } else {
      setItems(updateListItem(text, patch))
    }
  }

  async function remove(text: string) {
    if (code) {
      setItems(cur => cur.filter(i => i.text !== text))
      await fetch('/api/list', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, text }) })
    } else {
      setItems(removeListItem(text))
    }
  }

  function step(it: ListItem, dir: 1 | -1) {
    const s = qtyStep(it.unit ?? null)
    const next = Math.round(((it.qty ?? 1) + dir * s) * 100) / 100
    if (next <= 0) return
    change(it.text, { qty: next })
  }

  async function finishTrip() {
    const done = items.filter(i => i.checked)
    if (!done.length) return
    setTripState('busy')
    try {
      if (code) {
        const res = await fetch('/api/purchases', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            items: done.map(i => {
              const p = assignment.get(i.text)
              return {
                text: i.text, qty: i.qty ?? 1, unit: i.unit ?? null,
                dealId: p?.deal.id ?? null, name: p?.deal.name ?? null,
                merchantSlug: p?.deal.merchant_slug ?? null, merchantName: p?.deal.merchant_name ?? null,
                category: p?.deal.category ?? null, cost: p?.cost ?? null, regularCost: p?.regularCost ?? null,
              }
            }),
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setItems(cur => cur.filter(i => !i.checked))
        await fetch('/api/list', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, checked: true }) })
      } else {
        setItems(removeListItems(done.map(i => i.text)))
      }
      setTripState('done')
      setMode('plan')
      setTimeout(() => setTripState('idle'), 4000)
    } catch { setTripState('error') }
  }

  async function copyLink() {
    if (!code) return
    await navigator.clipboard.writeText(`${window.location.origin}/?list=${code}`).catch(() => {})
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 3000)
  }

  const pickingItem = picking ? result?.items.find(r => r.text === picking) : null
  const checkedCount = items.filter(i => i.checked).length

  // shop mode: group by the store each item is bought at under the chosen plan
  const groups = useMemo(() => {
    const order = plan?.stops ?? []
    const by = new Map<string, { name: string; items: ListItem[] }>()
    for (const it of items) {
      const p = assignment.get(it.text)
      const slug = p?.deal.merchant_slug ?? '_none'
      const name = p?.deal.merchant_name ?? 'Anywhere (no deal this week)'
      if (!by.has(slug)) by.set(slug, { name, items: [] })
      by.get(slug)!.items.push(it)
    }
    return [...by.entries()].sort(([a], [b]) =>
      (a === '_none' ? 99 : order.indexOf(a) < 0 ? 50 : order.indexOf(a)) - (b === '_none' ? 99 : order.indexOf(b) < 0 ? 50 : order.indexOf(b)))
  }, [items, assignment, plan])

  return (
    <div className="mt-4 flex flex-col gap-4 max-w-2xl">
      <div className="flex gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add an item… (e.g. 2 lb chicken breast)" aria-label="Add an item"
          className="flex-1 min-w-0 rounded-xl bg-neutral-800 px-4 py-2.5 text-sm outline-none focus:ring-2 ring-emerald-600" />
        <button onClick={add} disabled={!draft.trim()}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 text-sm font-medium disabled:opacity-50">Add</button>
      </div>

      <div className="flex items-center gap-2 text-xs flex-wrap">
        {items.length > 0 && (
          <div className="flex rounded-lg bg-neutral-900 p-0.5">
            <button onClick={() => setMode('plan')} aria-pressed={mode === 'plan'}
              className={`px-2.5 py-1 rounded-md ${mode === 'plan' ? 'bg-neutral-700 font-medium' : 'text-neutral-400'}`}>Plan</button>
            <button onClick={() => setMode('shop')} aria-pressed={mode === 'shop'}
              className={`px-2.5 py-1 rounded-md ${mode === 'shop' ? 'bg-neutral-700 font-medium' : 'text-neutral-400'}`}>🛒 In store</button>
          </div>
        )}
        <div className="flex-1" />
        {code && (
          <>
            <span className="text-neutral-500">Synced as <b className="text-neutral-300">{code}</b></span>
            <button onClick={copyLink} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-neutral-300 hover:bg-neutral-800">
              {shareState === 'copied' ? '✓ Link copied' : '🔗 Copy link'}
            </button>
          </>
        )}
      </div>
      {tripState === 'done' && <div className="text-sm text-emerald-400" role="status">✓ Trip saved — see it under Savings.</div>}

      {items.length === 0 ? (
        <div className="text-center text-neutral-500 mt-16">
          <div className="text-4xl mb-2">🛒</div>
          Your list is empty.<br />Add items above (try “2 lb chicken breast”) or from any deal.
        </div>
      ) : mode === 'plan' ? (
        <>
          {plan && (
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Where to shop</div>
                {home && mapStores.length > 0 && (
                  <button onClick={() => setShowMap(m => !m)} className="text-xs text-sky-400 hover:text-sky-300">
                    {showMap ? 'Hide map' : '🗺️ Map'}
                  </button>
                )}
              </div>
              <div className="text-sm mt-2">
                {plan.recommended ? '🏆 ' : ''}<b>{plan.label}</b> covers {plan.covered}/{items.length} items for{' '}
                <span className="text-emerald-400 font-semibold">{money(plan.total)}</span>
                {plan.savings > 0 && <> · <span className="text-amber-300">save {money(plan.savings)}</span></>}
                {plan.walkMinutes != null && <span className="text-neutral-400"> · ~{plan.walkMinutes} min walk</span>}
              </div>
              {showMap && home && <div className="mt-3"><TripMap home={home} stores={mapStores} route={route} /></div>}
              {options.length > 1 && (
                <div className="mt-3 flex flex-col gap-1">
                  {(allOptions ? options : options.filter((o, i) => i < 4 || o.key === plan.key)).map(o => (
                    <button key={o.key} onClick={() => setPlanKey(o.key)} aria-pressed={o.key === plan.key}
                      className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs ${o.key === plan.key ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'}`}>
                      <span className="min-w-0 truncate">{o.recommended && '★ '}{o.label} <span className="text-neutral-500">({o.covered}/{items.length})</span></span>
                      <span className="shrink-0 text-neutral-400">
                        <span className="text-emerald-400">{money(o.total)}</span>
                        {o.walkMinutes != null && ` · ${o.walkMinutes} min`}
                      </span>
                    </button>
                  ))}
                  {options.length > 4 && (
                    <button onClick={() => setAllOptions(a => !a)} className="text-xs text-sky-400 hover:text-sky-300 text-left px-2.5 py-1">
                      {allOptions ? 'Fewer options' : `${options.length - 4} more options`}
                    </button>
                  )}
                  <div className="text-[11px] text-neutral-600 mt-1">★ = best price once walking time is counted at $15/hour</div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {items.map(it => {
              const r = result?.items.find(x => x.text === it.text)
              const p = assignment.get(it.text) ?? r?.bestPick ?? null
              const q = formatQty(it.qty ?? 1, it.unit ?? null)
              return (
                <div key={it.text} className="rounded-xl bg-neutral-900 p-3 flex items-center gap-3">
                  <div className="flex items-center rounded-lg bg-neutral-800 text-xs shrink-0">
                    <button onClick={() => step(it, -1)} aria-label={`Less ${it.text}`} className="px-2 py-1.5 text-neutral-400 hover:text-white">−</button>
                    <span className="min-w-8 text-center tabular-nums">{q || '1'}</span>
                    <button onClick={() => step(it, 1)} aria-label={`More ${it.text}`} className="px-2 py-1.5 text-neutral-400 hover:text-white">+</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.text}</div>
                    {p ? (
                      <button onClick={() => setPicking(it.text)} className="block text-left text-xs text-neutral-400 mt-0.5 hover:text-neutral-200">
                        <span className="text-emerald-400 font-medium">{money(p.cost)}</span>
                        {p.packs !== 1 && <span className="text-neutral-500"> ({p.packs} × {money(p.deal.price!)}{p.deal.unit === 'lb' ? '/lb' : ''})</span>}
                        {' '}at {p.deal.merchant_name} — {p.deal.name}
                        {p.regularCost != null && <span className="text-amber-300"> · save {money(p.regularCost - p.cost)}</span>}
                        {it.pinnedDealId != null && it.pinnedDealId === p.deal.id && ' 📌'}
                        <span className="text-sky-400"> · change</span>
                      </button>
                    ) : deals ? (
                      <div className="text-xs text-neutral-500 mt-0.5">
                        no deal {plan?.slugs ? 'at this plan’s stores' : 'this week'}
                        {!r?.matches.length && (() => {
                          const c = canonicalize(it.text)
                          const t = c ? cycleText(stats.get(c) ?? null) : null
                          return t ? <span className="text-neutral-400"> · {t.charAt(0).toLowerCase() + t.slice(1)}</span> : null
                        })()}
                        {r && r.matches.length > 0 && <button onClick={() => setPicking(it.text)} className="text-sky-400 ml-1">· see {r.matches.length} elsewhere</button>}
                        {r && r.matches.length === 0 && (it.rejectedDealIds?.length ?? 0) > 0 &&
                          <button onClick={() => change(it.text, { rejectedDealIds: [] })} className="text-sky-400 ml-1">· undo hidden matches</button>}
                      </div>
                    ) : null}
                  </div>
                  <button onClick={() => remove(it.text)}
                    aria-label={`Remove ${it.text}`}
                    className="text-neutral-500 hover:text-red-400 px-2 text-lg">×</button>
                </div>
              )
            })}
          </div>

          {result && result.stores.length > 1 && (
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Store totals (matched items)</div>
              {result.stores.slice(0, 6).map(s => (
                <div key={s.slug} className="flex justify-between text-sm py-1">
                  <span>{s.name} <span className="text-neutral-500">({s.matched}/{items.length})</span></span>
                  <span className="text-emerald-400">{money(s.total)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {plan && (
            <div className="text-xs text-neutral-400">
              Shopping <b className="text-neutral-200">{plan.label}</b> · {money(plan.total)} expected
              {plan.savings > 0 && <> · save <span className="text-amber-300">{money(plan.savings)}</span></>}
            </div>
          )}
          {groups.map(([slug, g]) => (
            <div key={slug}>
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">{g.name}</div>
              <div className="flex flex-col gap-1.5">
                {[...g.items].sort((a, b) => Number(!!a.checked) - Number(!!b.checked)).map(it => {
                  const p = assignment.get(it.text)
                  const q = formatQty(it.qty ?? 1, it.unit ?? null)
                  return (
                    <label key={it.text}
                      className={`rounded-xl p-3.5 flex items-center gap-3 cursor-pointer ${it.checked ? 'bg-neutral-900/50 text-neutral-500' : 'bg-neutral-900'}`}>
                      <input type="checkbox" checked={!!it.checked} onChange={e => change(it.text, { checked: e.target.checked })}
                        className="w-5 h-5 accent-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[15px] ${it.checked ? 'line-through' : ''}`}>{q && <span className="text-neutral-400">{q} </span>}{it.text}</div>
                        {p && <div className="text-xs text-neutral-500 truncate">{p.deal.name} · {money(p.cost)}</div>}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="sticky bottom-4 flex gap-2">
            <button onClick={finishTrip} disabled={!checkedCount || tripState === 'busy'}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-semibold disabled:opacity-50 shadow-lg shadow-black/40">
              {tripState === 'busy' ? 'Saving…' : tripState === 'error' ? '⚠️ Couldn’t save — try again'
                : `Finish trip${checkedCount ? ` (${checkedCount} bought)` : ''}`}
            </button>
          </div>
          <p className="text-[11px] text-neutral-600 -mt-2">Finishing logs checked items to Savings and clears them from the list.</p>
        </>
      )}

      {pickingItem && (
        <MatchPicker item={pickingItem}
          pinnedDealId={items.find(i => i.text === pickingItem.text)?.pinnedDealId ?? null}
          onPin={id => { change(pickingItem.text, { pinnedDealId: id }); setPicking(null) }}
          onReject={id => {
            const cur = items.find(i => i.text === pickingItem.text)
            change(pickingItem.text, {
              rejectedDealIds: [...(cur?.rejectedDealIds ?? []), id],
              ...(cur?.pinnedDealId === id ? { pinnedDealId: null } : {}),
            })
          }}
          onClose={() => setPicking(null)} />
      )}
    </div>
  )
}
