'use client'
import { DealCard, type DealRecord } from './DealCard'

export interface ForYouItem { deal: DealRecord; reason: 'list' | 'watch' | 'bought' | 'great'; term: string | null }

const REASON: Record<ForYouItem['reason'], string> = {
  list: '🧾 on your list', watch: '👀 you watch this', bought: '🔁 you buy this', great: '💎 great price',
}

export function ForYouRow({ items, onOpen }: { items: ForYouItem[]; onOpen: (d: DealRecord) => void }) {
  return (
    <section id="foryou" className="mt-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">✨ For you this week</div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none snap-x">
        {items.map(it => (
          <div key={it.deal.id} className="shrink-0 w-40 sm:w-44 snap-start flex flex-col gap-1">
            <div className="text-[11px] text-neutral-400 truncate">{REASON[it.reason]}{it.term && it.reason !== 'great' ? `: ${it.term}` : ''}</div>
            <DealCard deal={it.deal} onClick={() => onOpen(it.deal)} />
          </div>
        ))}
      </div>
    </section>
  )
}
