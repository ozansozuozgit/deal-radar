'use client'
import { useEffect } from 'react'
import type { ItemResult } from '@/lib/compare'

/** Choose which deal a list item means: pin one, or hide wrong matches. */
export function MatchPicker({ item, pinnedDealId, onPin, onReject, onClose }: {
  item: ItemResult
  pinnedDealId: number | null
  onPin: (dealId: number | null) => void
  onReject: (dealId: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={`Matches for ${item.text}`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit max-w-xl mx-auto rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 p-5 max-h-[85vh] overflow-y-auto overscroll-contain animate-sheet-in"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Which “{item.text}”?</h2>
            <p className="text-xs text-neutral-500 mt-0.5">📌 Use one to always pick it. ✕ hides a wrong match for this item.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-full bg-neutral-800 text-neutral-400 hover:text-white">×</button>
        </div>
        {pinnedDealId != null && (
          <button onClick={() => onPin(null)} className="mt-3 text-xs text-sky-400 hover:text-sky-300">Unpin — go back to cheapest automatically</button>
        )}
        <div className="mt-3 flex flex-col gap-1.5">
          {item.matches.length === 0 && <p className="text-sm text-neutral-500">No matching deals this week.</p>}
          {item.matches.map(m => {
            const pinned = m.deal.id != null && m.deal.id === pinnedDealId
            return (
              <div key={`${m.deal.id ?? m.deal.name}-${m.deal.merchant_slug}`}
                className={`rounded-xl p-3 flex items-center gap-3 ${pinned ? 'bg-emerald-950/50 border border-emerald-800' : 'bg-neutral-800/60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm leading-snug">{m.deal.name}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {m.deal.merchant_name} · <span className="text-emerald-400">${m.cost.toFixed(2)}</span>
                    {m.packs !== 1 && ` (${m.packs} × $${m.deal.price!.toFixed(2)}${m.deal.unit === 'lb' ? '/lb' : ''})`}
                    {m.regularCost != null && <span className="text-amber-300"> · save ${(m.regularCost - m.cost).toFixed(2)}</span>}
                  </div>
                </div>
                {m.deal.id != null && (
                  <>
                    <button onClick={() => onPin(m.deal.id!)} disabled={pinned}
                      className="shrink-0 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-60">
                      {pinned ? '📌 Pinned' : '📌 Use'}
                    </button>
                    <button onClick={() => onReject(m.deal.id!)} aria-label={`Not ${m.deal.name}`}
                      className="shrink-0 w-8 h-8 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-700">✕</button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
