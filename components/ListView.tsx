'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addListItem, loadList, removeListItem, type ListItem } from '@/lib/client/list'
import { compareList, type CompareDeal } from '@/lib/compare'

const CODE_KEY = 'deal-radar-listcode-v1'

// URL join code (?list=XXXXXX) > stored code. A join code is remembered and stripped
// from the URL so a reload doesn't re-join. Idempotent, so safe as a state initializer.
function initialCode(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const joinCode = url.searchParams.get('list')?.toUpperCase() ?? null
  if (joinCode) {
    localStorage.setItem(CODE_KEY, joinCode)
    url.searchParams.delete('list')
    window.history.replaceState({}, '', url.toString())
  }
  return joinCode ?? localStorage.getItem(CODE_KEY)
}

export function ListView({ storeSlugs }: { storeSlugs: string[] }) {
  // ListView only mounts client-side (inside Feed), so reading localStorage here is safe
  const [code, setCode] = useState<string | null>(initialCode)
  const [items, setItems] = useState<ListItem[]>(() => (code ? [] : loadList()))
  const [draft, setDraft] = useState('')
  const [deals, setDeals] = useState<CompareDeal[] | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'copied'>('idle')

  const refetchShared = useCallback((c: string) =>
    fetch(`/api/list?code=${encodeURIComponent(c)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(d => { if (d) setItems((d.items ?? []).map((i: { text: string }) => ({ text: i.text }))) })
      .catch(() => { /* offline: keep what we have */ }), [])

  // load the shared list, and refresh it when returning to the tab
  useEffect(() => {
    if (!code) return
    refetchShared(code)
    const onFocus = () => refetchShared(code)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [code, refetchShared])

  const hasItems = items.length > 0
  useEffect(() => {
    if (!hasItems) return
    const ctrl = new AbortController()
    const params = new URLSearchParams({ status: 'active', limit: '500' })
    if (storeSlugs.length) params.set('stores', storeSlugs.join(','))
    fetch(`/api/deals?${params}`, { signal: ctrl.signal }).then(r => r.json())
      .then(d => setDeals((d.deals ?? []) as CompareDeal[]))
      .catch(() => { if (!ctrl.signal.aborted) setDeals([]) })
    return () => ctrl.abort()
  }, [hasItems, storeSlugs])

  const result = useMemo(
    () => (deals && items.length ? compareList(items.map(i => i.text), deals) : null),
    [deals, items])

  async function add() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    if (code) {
      setItems(cur => cur.some(i => i.text.toLowerCase() === text.toLowerCase()) ? cur : [...cur, { text }])
      await fetch('/api/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, text }) })
      refetchShared(code)
    } else {
      setItems(addListItem(text))
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

  async function share() {
    setShareState('busy')
    try {
      const res = await fetch('/api/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: items.map(i => i.text) }),
      })
      const { code: newCode } = await res.json()
      localStorage.setItem(CODE_KEY, newCode)
      setCode(newCode)
      await navigator.clipboard.writeText(`${window.location.origin}/?list=${newCode}`).catch(() => {})
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 3000)
    } catch { setShareState('idle') }
  }

  async function copyLink() {
    if (!code) return
    await navigator.clipboard.writeText(`${window.location.origin}/?list=${code}`).catch(() => {})
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 3000)
  }

  return (
    <div className="mt-4 flex flex-col gap-4 max-w-2xl">
      <div className="flex gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add an item… (e.g. chicken breast)" aria-label="Add an item"
          className="flex-1 rounded-xl bg-neutral-800 px-4 py-2.5 text-sm outline-none focus:ring-2 ring-emerald-600" />
        <button onClick={add} disabled={!draft.trim()}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 text-sm font-medium disabled:opacity-50">Add</button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {code ? (
          <>
            <span className="text-neutral-500">Shared list <b className="text-neutral-300">{code}</b> — syncs across devices</span>
            <button onClick={copyLink} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-neutral-300 hover:bg-neutral-800">
              {shareState === 'copied' ? '✓ Link copied' : '🔗 Copy link'}
            </button>
          </>
        ) : items.length > 0 && (
          <button onClick={share} disabled={shareState === 'busy'}
            className="rounded-lg border border-neutral-700 px-2.5 py-1 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">
            {shareState === 'busy' ? 'Creating…' : shareState === 'copied' ? '✓ Link copied' : '🔗 Share this list'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center text-neutral-500 mt-16">
          <div className="text-4xl mb-2">🛒</div>
          Your list is empty.<br />Add items above or from any deal.
        </div>
      ) : (
        <>
          {result?.bestSingle && (
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Where to shop</div>
              <div className="text-sm">
                🏆 <b>{result.bestSingle.name}</b> covers {result.bestSingle.matched}/{items.length} items
                for <span className="text-emerald-400 font-semibold">${result.bestSingle.total.toFixed(2)}</span>
              </div>
              {result.bestPair && result.bestPair.covered > result.bestSingle.matched && (
                <div className="text-sm mt-1.5">
                  🚶 Split trip: <b>{result.bestPair.names[0]}</b> + <b>{result.bestPair.names[1]}</b> covers{' '}
                  {result.bestPair.covered}/{items.length} for{' '}
                  <span className="text-emerald-400 font-semibold">${result.bestPair.total.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {items.map(it => {
              const r = result?.items.find(x => x.text === it.text)
              return (
                <div key={it.text} className="rounded-xl bg-neutral-900 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{it.text}</div>
                    {r?.best ? (
                      <div className="text-xs text-neutral-400 mt-0.5">
                        best: <span className="text-emerald-400 font-medium">${r.best.price!.toFixed(2)}</span>{' '}
                        at {r.best.merchant_name} — {r.best.name}
                      </div>
                    ) : deals ? <div className="text-xs text-neutral-500 mt-0.5">no current deal — regular price this week</div> : null}
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
                  <span className="text-emerald-400">${s.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
