'use client'
import { useState } from 'react'
import { Img } from './Img'
import { Icon } from './Icon'

interface Store { slug: string; name: string; distance_miles: number | null; logo_url: string | null }

const label = 'text-xs font-bold uppercase tracking-wider text-neutral-500'
const chip = (on: boolean) =>
  `shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] border transition-colors ${on ? 'bg-ink border-ink text-white' : 'bg-card border-neutral-700 text-neutral-300 hover:border-neutral-500'}`

/** Sort, week, my stores and categories. A sidebar on desktop, a bottom sheet on phones. */
export function FilterPanel({ sorts, sort, onSort, upcoming, onUpcoming, stores, mySlugs, allMine, onToggleMine, storeFilter, onToggleFilter, categories, catSel, onToggleCat }: {
  sorts: Array<{ value: string; label: string }>
  sort: string; onSort: (s: string) => void
  upcoming: boolean; onUpcoming: (u: boolean) => void
  stores: Store[]                  // every scanned store in radius
  mySlugs: string[]; allMine: boolean
  onToggleMine: (slug: string) => void
  storeFilter: string[] | null; onToggleFilter: (slug: string) => void
  categories: Array<[string, string]>; catSel: string[] | null; onToggleCat: (c: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const mine = stores.filter(s => mySlugs.includes(s.slug))
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className={label}>Sort</h3>
        <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Sort">
          {sorts.map(s => (
            <button key={s.value} role="radio" aria-checked={sort === s.value} onClick={() => onSort(s.value)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left ${sort === s.value ? 'bg-neutral-800 font-bold' : 'hover:bg-neutral-800/60'}`}>
              {s.label}{sort === s.value && <Icon name="check" className="w-4 h-4" />}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 rounded-lg bg-neutral-800 p-0.5 text-sm" role="group" aria-label="Which week">
          {[false, true].map(u => (
            <button key={String(u)} onClick={() => onUpcoming(u)} aria-pressed={upcoming === u}
              className={`rounded-md py-1.5 ${upcoming === u ? 'bg-card font-bold shadow-sm' : 'text-neutral-400'}`}>{u ? 'Next week' : 'This week'}</button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className={label}>My stores</h3>
          {stores.length > 1 && (
            <button onClick={() => setEditing(e => !e)} className="text-sm font-bold text-sky-400 hover:underline">
              {editing ? 'Done' : 'Choose'}
            </button>
          )}
        </div>
        {editing ? (
          <>
            <p className="text-xs text-neutral-500">Deals, For you, your list and meal plans only use the stores you check.</p>
            <ul className="flex flex-col">
              {stores.map(s => {
                const on = mySlugs.includes(s.slug)
                return (
                  <li key={s.slug}>
                    <label className="flex items-center gap-3 py-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => onToggleMine(s.slug)}
                        disabled={on && mySlugs.length === 1} className="w-5 h-5 accent-[#15201a]" />
                      <Img src={s.logo_url} alt="" className="w-5 h-5 rounded-full object-contain bg-white border border-line" />
                      <span className="flex-1 min-w-0 truncate">{s.name}</span>
                      {s.distance_miles != null && <span className="text-xs text-neutral-500 tabular-nums">{s.distance_miles} mi</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            {!allMine && <p className="text-xs text-neutral-500">{mine.length} of {stores.length} nearby stores. Tap to show just one.</p>}
            {allMine && stores.length > 1 && <p className="text-xs text-neutral-500">All {stores.length} nearby stores. Choose the ones you shop at.</p>}
            <div className="flex flex-wrap gap-1.5">
              {mine.map(s => (
                <button key={s.slug} onClick={() => onToggleFilter(s.slug)} aria-pressed={!!storeFilter?.includes(s.slug)} className={chip(!!storeFilter?.includes(s.slug))}>
                  <Img src={s.logo_url} alt="" className="w-4 h-4 rounded-full object-contain bg-white" />
                  {s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className={label}>Category</h3>
        <div className="flex flex-wrap gap-1.5">
          {categories.map(([value, text]) => (
            <button key={value} onClick={() => onToggleCat(value)} aria-pressed={!!catSel?.includes(value)} className={chip(!!catSel?.includes(value))}>{text}</button>
          ))}
        </div>
      </section>
    </div>
  )
}
