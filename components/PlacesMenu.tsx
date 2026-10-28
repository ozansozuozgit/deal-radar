'use client'
import { useEffect, useRef } from 'react'
import type { Prefs } from '@/lib/client/prefs'

export interface SavedPlace { id: number; label: string; address: string; lat: number; lng: number; zip: string | null; radius_miles: number }

/** Switch between saved places, add one, or edit the current one. */
export function PlacesMenu({ places, prefs, onPick, onAdd, onEdit, onDelete, onClose, align = 'right' }: {
  places: SavedPlace[]
  prefs: Prefs
  onPick: (p: SavedPlace) => void
  onAdd: () => void
  onEdit: () => void
  onDelete: (p: SavedPlace) => void
  onClose: () => void
  align?: 'left' | 'right'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const isCurrent = (p: SavedPlace) => Math.abs(p.lat - prefs.lat) < 1e-6 && Math.abs(p.lng - prefs.lng) < 1e-6
  return (
    <div ref={ref} role="menu"
      className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-1.5 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl shadow-black/15 p-1.5`}>
      {places.length === 0 && <div className="px-3 py-2 text-xs text-neutral-500">No saved places yet.</div>}
      {places.map(p => (
        <div key={p.id} className={`flex items-center rounded-lg ${isCurrent(p) ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'}`}>
          <button role="menuitem" onClick={() => onPick(p)} className="flex-1 min-w-0 text-left px-3 py-2">
            <div className="text-sm font-medium">{p.label} <span className="text-neutral-500 font-normal">· {Number(p.radius_miles)}mi</span></div>
            <div className="text-xs text-neutral-500 truncate">{p.address}</div>
          </button>
          {!isCurrent(p) && (
            <button onClick={() => onDelete(p)} aria-label={`Remove ${p.label}`} className="px-2.5 text-neutral-600 hover:text-red-400">×</button>
          )}
        </div>
      ))}
      <div className="border-t border-neutral-800 mt-1.5 pt-1.5 flex">
        <button role="menuitem" onClick={onAdd} className="flex-1 text-left rounded-lg px-3 py-2 text-sm text-emerald-400 hover:bg-neutral-800">+ Add a place</button>
        <button role="menuitem" onClick={onEdit} className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Edit current</button>
      </div>
      <p className="px-3 pb-1.5 pt-1 text-[11px] text-neutral-600">Every saved place is included in the morning scan.</p>
    </div>
  )
}
