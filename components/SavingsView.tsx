'use client'
import { useEffect, useMemo, useState } from 'react'
import { summarize, type Purchase } from '@/lib/savings'

const money = (n: number) => `$${n.toFixed(2)}`

export function SavingsView({ code }: { code: string | null }) {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!code) return
    const ctrl = new AbortController()
    fetch(`/api/purchases?code=${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => setPurchases(d.purchases ?? []))
      .catch(() => { if (!ctrl.signal.aborted) setFailed(true) })
    return () => ctrl.abort()
  }, [code])

  const s = useMemo(() => (purchases ? summarize(purchases) : null), [purchases])

  async function undo(id: number) {
    setPurchases(cur => cur?.filter(p => p.id !== id) ?? null)
    await fetch('/api/purchases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, id }) }).catch(() => {})
  }

  if (!code) return <p className="mt-16 text-center text-neutral-500">Savings need a synced list. Reload once you’re online.</p>
  if (failed) return <p className="mt-16 text-center text-neutral-500" role="alert">Couldn’t load your purchases.</p>
  if (!s || !purchases) return <div className="mt-4 h-32 rounded-xl bg-neutral-900 animate-pulse" />
  if (!purchases.length) {
    return (
      <div className="text-center text-neutral-500 mt-16 max-w-sm mx-auto">
        <div className="text-4xl mb-2">💰</div>
        Nothing logged yet. On <b className="text-neutral-300">My list</b>, switch to <b className="text-neutral-300">🛒 In store</b>,
        check items off as you shop, then tap <b className="text-neutral-300">Finish trip</b>.
      </div>
    )
  }

  const maxMonth = Math.max(1, ...s.months.map(m => m.spent + m.saved))
  const maxCat = Math.max(1, ...s.byCategory.map(c => c.spent))

  return (
    <div className="mt-4 flex flex-col gap-4 max-w-2xl">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Saved this month" value={money(s.month.saved)} accent="text-amber-300" />
        <Stat label="Spent this month" value={money(s.month.spent)} accent="text-emerald-400" />
        <Stat label="Trips" value={String(s.month.trips)} accent="text-neutral-100" />
      </div>

      <section className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Last 6 months</h3>
        <div className="flex items-end gap-2 h-28">
          {s.months.map(m => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
              title={`${m.label}: spent ${money(m.spent)}, saved ${money(m.saved)}`}>
              <div className="w-full max-w-10 flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${((m.spent + m.saved) / maxMonth) * 100}%` }}>
                <div className="bg-amber-400/80" style={{ flex: m.saved }} />
                <div className="bg-emerald-600" style={{ flex: m.spent }} />
              </div>
              <div className="text-[11px] text-neutral-500">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-[11px] text-neutral-500 mt-2">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-600 mr-1" />spent</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-400/80 mr-1" />saved vs regular price</span>
        </div>
      </section>

      {s.habits.length > 0 && (
        <section className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Habits (last 60 days)</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {s.habits.slice(0, 6).map(h => (
              <li key={h.text}>
                <b>{h.text}</b> {h.count}× at {h.stores.join(', ') || 'various stores'}
                {h.onDeal === 0
                  ? <span className="text-amber-300"> — never on sale; try watching it 👀</span>
                  : <span className="text-neutral-400"> — on sale {h.onDeal} of {h.count} times</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">By category (90 days)</h3>
          {s.byCategory.slice(0, 8).map(c => (
            <div key={c.category} className="py-1">
              <div className="flex justify-between text-xs"><span>{c.category}</span><span className="text-neutral-400">{money(c.spent)}</span></div>
              <div className="h-1.5 rounded bg-neutral-800 mt-1"><div className="h-full rounded bg-emerald-600" style={{ width: `${(c.spent / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </section>
        <section className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">By store (90 days)</h3>
          {s.byStore.slice(0, 8).map(st => (
            <div key={st.name} className="flex justify-between text-sm py-1">
              <span className="truncate">{st.name}</span>
              <span className="shrink-0 text-neutral-400">{money(st.spent)}{st.saved > 0 && <span className="text-amber-300"> (−{money(st.saved)})</span>}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Recent purchases</h3>
        {purchases.slice(0, 25).map(p => (
          <div key={p.id} className="flex items-center gap-3 py-1.5 text-sm">
            <div className="flex-1 min-w-0">
              <div className="truncate">{p.text}</div>
              <div className="text-xs text-neutral-500 truncate">
                {new Date(p.bought_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {p.merchant_name && ` · ${p.merchant_name}`}
                {p.cost != null && ` · ${money(p.cost)}`}
              </div>
            </div>
            <button onClick={() => undo(p.id)} aria-label={`Remove ${p.text}`} className="text-neutral-600 hover:text-red-400 px-1">×</button>
          </div>
        ))}
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
      <div className={`text-xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  )
}
