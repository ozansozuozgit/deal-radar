'use client'
import { DealCard, type DealRecord } from './DealCard'

export interface ForYouItem { deal: DealRecord; reason: 'list' | 'watch' | 'bought' | 'great'; term: string | null }

const REASON: Record<ForYouItem['reason'], string> = {
  list: 'On your list', watch: 'Watching', bought: 'You buy this', great: 'Great price',
}

export function ForYouRow({ items, onOpen }: { items: ForYouItem[]; onOpen: (d: DealRecord) => void }) {
  return (
    <section id="foryou" className="mt-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">For you this week</h2>
      <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none snap-x scroll-px-4 lg:mx-0 lg:px-0 lg:scroll-px-0">
        {items.map(it => (
          <div key={it.deal.id} className="shrink-0 w-36 sm:w-40 snap-start flex flex-col gap-1">
            <div className="text-xs text-neutral-500 truncate">
              <b className="text-neutral-200">{REASON[it.reason]}</b>{it.term && it.reason !== 'great' ? `: ${it.term}` : ''}
            </div>
            <DealCard deal={it.deal} compact onClick={() => onOpen(it.deal)} />
          </div>
        ))}
      </div>
    </section>
  )
}
