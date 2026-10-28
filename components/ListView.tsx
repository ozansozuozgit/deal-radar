'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addListItem, loadList, removeListItem, saveList, type ListItem } from '@/lib/client/list'
import { compareList, type CompareDeal } from '@/lib/compare'
import { readJson, readString, writeJson, writeString } from '@/lib/client/storage'

const CODE_KEY = 'deal-radar-listcode-v1'
// last priced matches, so the list still shows prices in a store with no signal
const COMPARE_CACHE_KEY = 'deal-radar-compare-v1'
// codes come from /api/list (6 chars); anything else is a mangled link or old junk
const isCode = (c: string | null | undefined): c is string => !!c && /^[A-Z0-9]{6}$/.test(c)

// URL join code (?list=XXXXXX) > stored code. A join code is remembered and stripped
// from the URL so a reload doesn't re-join. Idempotent, so safe as a state initializer.
function initialCode(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const param = url.searchParams.get('list')
  const joinCode = param?.trim().toUpperCase() ?? null
  if (param != null) {
    if (isCode(joinCode)) writeString(CODE_KEY, joinCode)
    url.searchParams.delete('list')
    window.history.replaceState({}, '', url.toString())
  }
  const stored = readString(CODE_KEY)
  return isCode(joinCode) ? joinCode : isCode(stored) ? stored : null
}

export function ListView({ storeSlugs }: { storeSlugs: string[] }) {
  // ListView only mounts client-side (inside Feed), so reading localStorage here is safe
  const [code, setCode] = useState<string | null>(initialCode)
  const [items, setItems] = useState<ListItem[]>(() => (code ? [] : loadList()))
  const [draft, setDraft] = useState('')
  const [deals, setDeals] = useState<CompareDeal[] | null>(() => {
    const cached = readJson<unknown>(COMPARE_CACHE_KEY, null)
    return Array.isArray(cached) ? cached as CompareDeal[] : null
  })
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle')

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

  // match server-side against every active deal (not just one page of the feed);
  // keyed on the item texts so adding/removing an item re-prices the list
  const itemsKey = JSON.stringify(items.map(i => i.text))
  useEffect(() => {
    const texts: string[] = JSON.parse(itemsKey)
    if (!texts.length) return
    const ctrl = new AbortController()
    const t = setTimeout(() =>
      fetch('/api/compare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ items: texts, stores: storeSlugs }),
      }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(d => {
          const fresh = (Array.isArray(d.deals) ? d.deals : []) as CompareDeal[]
          setDeals(fresh)
          writeJson(COMPARE_CACHE_KEY, fresh)
        })
        // offline or server trouble: keep the last prices rather than claiming "no deal"
        .catch(() => { if (!ctrl.signal.aborted) setDeals(cur => cur ?? []) }), 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [itemsKey, storeSlugs])

  const result = useMemo(
    () => (deals && items.length ? compareList(items.map(i => i.text), deals) : null),
    [deals, items])

  const [syncError, setSyncError] = useState(false)
  async function sync(method: 'POST' | 'DELETE', text: string): Promise<boolean> {
    const ok = await fetch('/api/list', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, text }),
    }).then(r => r.ok, () => false)
    setSyncError(!ok)
    return ok
  }

  async function add() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    if (code) {
      setItems(cur => cur.some(i => i.text.toLowerCase() === text.toLowerCase()) ? cur : [...cur, { text }])
      // on failure keep the optimistic item visible; a refetch would silently drop it
      if (await sync('POST', text)) refetchShared(code)
    } else {
      setItems(addListItem(text))
    }
  }

  async function remove(text: string) {
    if (code) {
      setItems(cur => cur.filter(i => i.text !== text))
      if (!(await sync('DELETE', text))) refetchShared(code)
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
      if (!res.ok || !isCode(newCode)) throw new Error('share failed')
      writeString(CODE_KEY, newCode)
      setCode(newCode)
      await navigator.clipboard.writeText(`${window.location.origin}/?list=${newCode}`).catch(() => {})
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 3000)
    } catch { setShareState('error'); setTimeout(() => setShareState('idle'), 3000) }
  }

  // stop syncing: keep the current items as a local list on this device
  function leaveShared() {
    saveList(items)
    writeString(CODE_KEY, null)
    setCode(null)
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
            <button onClick={leaveShared} className="text-neutral-500 hover:text-neutral-300 underline-offset-2 hover:underline">Stop sharing</button>
          </>
        ) : items.length > 0 && (
          <button onClick={share} disabled={shareState === 'busy'}
            className="rounded-lg border border-neutral-700 px-2.5 py-1 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">
            {shareState === 'busy' ? 'Creating…' : shareState === 'copied' ? '✓ Link copied' : shareState === 'error' ? '⚠️ Could not share — try again' : '🔗 Share this list'}
          </button>
        )}
      </div>

      {code && syncError && (
        <div className="text-xs text-amber-400" role="status">⚠️ Couldn&apos;t sync with the shared list — check your connection. Changes may not reach other devices.</div>
      )}

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
