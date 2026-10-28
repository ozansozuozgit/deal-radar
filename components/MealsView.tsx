'use client'
import { useEffect, useState } from 'react'
import { addToActiveList } from '@/lib/client/list'
import { amountToQty, type Dinner, type MealPrefs } from '@/lib/meals'

interface DailyIdea { title: string; emoji: string; description: string; ingredients: Array<{ name: string; dealName?: string; store?: string; price?: number }>; estCost: number }

const money = (n: number) => `$${n.toFixed(2)}`

export function MealsView({ code, storeSlugs, onSearch }: {
  code: string | null
  storeSlugs: string[]
  onSearch: (term: string) => void
}) {
  const [dinners, setDinners] = useState<Dinner[] | null>(null)
  const [prefs, setPrefs] = useState<MealPrefs>({ notes: '', count: 5, budget: null })
  const [canGenerate, setCanGenerate] = useState(true)
  const [daily, setDaily] = useState<DailyIdea[]>([])
  const [busy, setBusy] = useState<string | null>(null) // 'all' | dinner title
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [withStaples, setWithStaples] = useState(false)
  const [added, setAdded] = useState<number | null>(null)

  useEffect(() => {
    if (!code) return
    fetch(`/api/meals?code=${code}`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return
      setCanGenerate(!!d.canGenerate)
      const list: Dinner[] = d.plan?.dinners ?? []
      setDinners(list)
      setPicked(new Set(list.map(x => x.title)))
      if (d.plan?.prefs) setPrefs(p => ({ ...p, ...d.plan.prefs }))
    }).catch(() => setDinners([]))
    fetch('/api/dinner').then(r => r.json()).then(d => setDaily(d.ideas ?? [])).catch(() => {})
  }, [code])

  async function plan(keep: Dinner[], key: string) {
    if (!code) return
    setBusy(key); setError(null)
    try {
      const res = await fetch('/api/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stores: storeSlugs, prefs, keep }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 503) { setCanGenerate(false); return }
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      const list: Dinner[] = d.plan.dinners
      setDinners(list)
      setPicked(cur => new Set([...[...cur].filter(t => keep.some(k => k.title === t)), ...list.filter(x => !keep.includes(x)).map(x => x.title)]))
    } catch (e) { setError(e instanceof Error ? e.message : 'Planning failed') }
    finally { setBusy(null) }
  }

  function swap(d: Dinner) {
    const keep = (dinners ?? []).filter(x => x !== d)
    plan(keep, d.title)
  }

  function remove(d: Dinner) {
    const next = (dinners ?? []).filter(x => x !== d)
    setDinners(next)
    fetch('/api/meals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, dinners: next }) }).catch(() => {})
  }

  const chosen = (dinners ?? []).filter(d => picked.has(d.title))
  const toAdd = new Map<string, Dinner['ingredients'][number]>()
  for (const d of chosen) for (const i of d.ingredients) if ((i.dealId || withStaples) && !toAdd.has(i.name)) toAdd.set(i.name, i)

  async function addAll() {
    const items = [...toAdd.values()]
    await Promise.all(items.map(i => {
      const { qty, unit } = amountToQty(i.amount)
      return addToActiveList(code, { text: i.name, qty, unit, pinnedDealId: i.dealId ?? null })
    }))
    setAdded(items.length)
    setTimeout(() => setAdded(null), 4000)
  }

  if (!code) return <p className="mt-16 text-center text-neutral-500">Meal plans need a synced list. Reload once you’re online.</p>

  return (
    <div className="mt-4 flex flex-col gap-4 max-w-3xl">
      {canGenerate ? (
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 flex flex-col gap-3">
          <div className="text-sm font-semibold">🍳 Plan this week’s dinners from what’s on sale</div>
          <input value={prefs.notes ?? ''} onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
            placeholder="Preferences (e.g. high protein, no pork, 30 minutes max)" aria-label="Meal preferences"
            className="rounded-xl bg-neutral-800 px-4 py-2.5 text-sm outline-none focus:ring-2 ring-emerald-600" />
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <label className="flex items-center gap-2 text-neutral-400">Dinners
              <select value={prefs.count} onChange={e => setPrefs(p => ({ ...p, count: Number(e.target.value) }))}
                className="rounded-lg bg-neutral-800 px-2 py-1.5 text-neutral-100 outline-none">
                {[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-neutral-400">Under
              <span className="inline-flex items-center rounded-lg bg-neutral-800 px-2 text-neutral-100">$
                <input value={prefs.budget ?? ''} inputMode="decimal" placeholder="any" aria-label="Budget per dinner"
                  onChange={e => setPrefs(p => ({ ...p, budget: Number(e.target.value) > 0 ? Number(e.target.value) : null }))}
                  className="w-12 bg-transparent py-1.5 px-1 outline-none" />
              </span>each
            </label>
            <button onClick={() => plan([], 'all')} disabled={!!busy}
              className="ml-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium disabled:opacity-50">
              {busy === 'all' ? 'Planning…' : dinners?.length ? '↻ New plan' : 'Plan my week'}
            </button>
          </div>
          {error && <div className="text-sm text-red-400" role="alert">{error}</div>}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          The planner needs <code className="text-neutral-200">GEMINI_API_KEY</code> set in the app’s environment (Vercel).
          Until then, here are today’s ideas from the morning scan.
        </div>
      )}

      {dinners === null ? <div className="h-40 rounded-xl bg-neutral-900 animate-pulse" />
        : dinners.length > 0 ? (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {dinners.map(d => (
                <div key={d.title} className={`rounded-xl border p-3.5 ${picked.has(d.title) ? 'bg-neutral-900 border-neutral-700' : 'bg-neutral-950 border-neutral-800 opacity-60'}`}>
                  <div className="flex items-start gap-2">
                    <div className="text-2xl">{d.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{d.title}</div>
                      <div className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{d.description}</div>
                    </div>
                    <input type="checkbox" checked={picked.has(d.title)} aria-label={`Include ${d.title}`}
                      onChange={e => setPicked(cur => { const n = new Set(cur); if (e.target.checked) n.add(d.title); else n.delete(d.title); return n })}
                      className="w-4 h-4 mt-1 accent-emerald-500" />
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {d.ingredients.map(i => i.dealId ? (
                      <button key={i.name} onClick={() => onSearch(i.name)} title={`${i.dealName} at ${i.store}`}
                        className="text-[11px] rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-300 px-2 py-0.5 hover:bg-emerald-900/50">
                        {i.name}{i.price != null ? ` ${money(i.price)}${i.unit === 'lb' ? '/lb' : ''}` : ''}
                      </button>
                    ) : (
                      <span key={i.name} className="text-[11px] rounded-full border border-neutral-800 text-neutral-400 px-2 py-0.5">{i.name}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2.5 text-xs">
                    <span className="text-neutral-500">~{money(d.estCost)} in sale items</span>
                    {canGenerate && (
                      <span className="flex gap-3">
                        <button onClick={() => swap(d)} disabled={!!busy} className="text-sky-400 hover:text-sky-300 disabled:opacity-50">
                          {busy === d.title ? 'Swapping…' : '↻ Swap'}
                        </button>
                        <button onClick={() => remove(d)} className="text-neutral-500 hover:text-red-400">Remove</button>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-4 rounded-xl bg-neutral-900/95 backdrop-blur border border-neutral-800 p-3 flex items-center gap-3 flex-wrap shadow-lg shadow-black/40">
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                <input type="checkbox" checked={withStaples} onChange={e => setWithStaples(e.target.checked)} className="accent-emerald-500" />
                include ingredients that aren’t on sale
              </label>
              <button onClick={addAll} disabled={!toAdd.size}
                className="ml-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50">
                {added != null ? `✓ Added ${added} to your list` : `🛒 Add ${toAdd.size} ingredient${toAdd.size === 1 ? '' : 's'} to list`}
              </button>
            </div>
          </>
        ) : !canGenerate && daily.length > 0 ? (
          <div className="grid sm:grid-cols-3 gap-3">
            {daily.map(idea => (
              <div key={idea.title} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3.5">
                <div className="text-2xl">{idea.emoji}</div>
                <div className="font-medium text-sm mt-1.5">{idea.title}</div>
                <div className="text-xs text-neutral-400 mt-1 leading-relaxed">{idea.description}</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {idea.ingredients.filter(i => i.dealName).map(i => (
                    <button key={i.name} onClick={() => onSearch(i.name)}
                      className="text-[11px] rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-300 px-2 py-0.5 hover:bg-emerald-900/50">
                      {i.name}{i.price != null ? ` ${money(i.price)}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : canGenerate ? (
          <div className="text-center text-neutral-500 mt-10">
            <div className="text-4xl mb-2">🥘</div>
            No plan yet. Set your preferences and tap <b className="text-neutral-300">Plan my week</b>.
          </div>
        ) : null}
    </div>
  )
}
