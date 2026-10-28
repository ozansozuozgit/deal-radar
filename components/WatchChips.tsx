'use client'
import { useState } from 'react'
import type { DealRecord } from './DealCard'
import type { PriceBasis, Watch } from '@/lib/client/watches'
import type { PushStatus } from '@/lib/client/push'
import { getDeviceId } from '@/lib/client/device'
import { timeAgo } from '@/lib/dates'

interface SentAlert { title: string; body: string; url: string | null; created_at: string }

export function WatchChips({ watches, hits, pushStatus, onEnablePush, onUpdate, onRemove, onOpen, onOpenUrl }: {
  watches: Watch[]
  hits: Map<string, DealRecord | null>
  pushStatus: PushStatus
  onEnablePush: () => void
  onUpdate: (term: string, patch: { maxPrice: number | null; basis: PriceBasis }) => void
  onRemove: (term: string) => void
  onOpen: (deal: DealRecord) => void
  onOpenUrl: (url: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<SentAlert[] | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)

  function toggleAlerts() {
    const open = !alertsOpen
    setAlertsOpen(open)
    if (open && alerts === null) {
      fetch(`/api/alerts?device=${encodeURIComponent(getDeviceId())}`)
        .then(r => (r.ok ? r.json() : { alerts: [] })).then(d => setAlerts(d.alerts ?? []))
        .catch(() => setAlerts([]))
    }
  }

  const edited = watches.find(w => w.term === editing)

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
        <div className="text-xs uppercase tracking-wide text-neutral-500">👀 Watching</div>
        {pushStatus === 'idle' && (
          <button onClick={onEnablePush}
            className="text-xs rounded-lg border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800">
            🔔 Notify me when these go on sale
          </button>
        )}
        {pushStatus === 'subscribed' && (
          <button onClick={toggleAlerts} aria-expanded={alertsOpen} className="text-xs text-emerald-500 hover:text-emerald-400">
            🔔 alerts on · {alertsOpen ? 'hide recent' : 'recent alerts'}
          </button>
        )}
        {pushStatus === 'denied' && <span className="text-xs text-neutral-600">notifications blocked in browser settings</span>}
      </div>

      {alertsOpen && (
        <div className="mb-2 rounded-xl border border-neutral-800 bg-neutral-900 p-2 max-h-56 overflow-y-auto">
          {alerts === null ? <div className="h-10 rounded bg-neutral-800 animate-pulse" />
            : alerts.length === 0 ? <div className="text-xs text-neutral-500 p-1.5">No alerts yet. You’ll get one the morning a watched item goes on sale.</div>
            : alerts.map(a => (
              <button key={a.created_at + a.title} onClick={() => a.url && onOpenUrl(a.url)}
                className="block w-full text-left rounded-lg px-2 py-1.5 hover:bg-neutral-800">
                <div className="text-xs font-medium">{a.title}</div>
                <div className="text-[11px] text-neutral-500">{a.body} · {timeAgo(a.created_at)}</div>
              </button>
            ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
        {watches.map(w => {
          const hit = hits.get(w.term)
          const target = w.maxPrice != null ? `under $${w.maxPrice.toFixed(2)}${w.basis === 'lb' ? '/lb' : ''}` : null
          return (
            <div key={w.term}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs border ${hit ? 'border-emerald-700 bg-emerald-950/40' : 'border-neutral-800 bg-neutral-900'}`}>
              <div className="flex items-center gap-2">
                <button onClick={() => hit && onOpen(hit)} className="text-left">
                  <div className="font-medium">{w.term}{target && <span className="text-neutral-500 font-normal"> · {target}</span>}</div>
                  {hit
                    ? <div className="text-emerald-400">${hit.price!.toFixed(2)}{hit.unit === 'lb' ? '/lb' : ''} at {hit.merchant_name}</div>
                    : <div className="text-neutral-500">{target ? 'not at your price yet' : 'no deal this week'}</div>}
                </button>
                <button onClick={() => setEditing(w.term)} aria-label={`Set target price for ${w.term}`}
                  className="text-neutral-500 hover:text-neutral-200">✎</button>
                <button onClick={() => onRemove(w.term)} aria-label={`Stop watching ${w.term}`}
                  className="text-neutral-600 hover:text-red-400">×</button>
              </div>
            </div>
          )
        })}
      </div>

      {edited && (
        <TargetEditor key={edited.term} watch={edited}
          onSave={patch => { onUpdate(edited.term, patch); setEditing(null) }}
          onCancel={() => setEditing(null)} />
      )}
    </div>
  )
}

function TargetEditor({ watch, onSave, onCancel }: {
  watch: Watch
  onSave: (patch: { maxPrice: number | null; basis: PriceBasis }) => void
  onCancel: () => void
}) {
  const [price, setPrice] = useState(watch.maxPrice != null ? String(watch.maxPrice) : '')
  const [basis, setBasis] = useState<PriceBasis>(watch.basis ?? 'item')
  const value = Number(price)
  const valid = price.trim() === '' || (Number.isFinite(value) && value > 0)
  return (
    <form onSubmit={e => { e.preventDefault(); if (valid) onSave({ maxPrice: price.trim() ? Math.round(value * 100) / 100 : null, basis }) }}
      className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3 flex items-center gap-2 flex-wrap text-sm">
      <span className="text-neutral-400">Alert me for <b className="text-neutral-200">{watch.term}</b> under</span>
      <span className="inline-flex items-center rounded-lg bg-neutral-800 px-2">
        $<input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="any" autoFocus
          aria-label="Target price" className="w-16 bg-transparent py-1.5 px-1 outline-none" />
      </span>
      <select value={basis} onChange={e => setBasis(e.target.value as PriceBasis)} aria-label="Price basis"
        className="rounded-lg bg-neutral-800 px-2 py-1.5 outline-none">
        <option value="item">each</option>
        <option value="lb">per lb</option>
      </select>
      <div className="flex gap-2 ml-auto">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-neutral-400 hover:text-white">Cancel</button>
        <button type="submit" disabled={!valid} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 font-medium disabled:opacity-50">Save</button>
      </div>
    </form>
  )
}
