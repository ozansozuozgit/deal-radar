import type { CropRect } from '@/lib/types'
import { FlyerCrop } from './FlyerCrop'
import { daysLeft as daysUntil } from '@/lib/dates'

export interface DealRecord {
  id: number; name: string; description: string | null
  price: number | null; original_price: number | null; prime_price: number | null
  unit: string | null; price_text: string | null; sale_story: string | null
  category: string; image_url: string | null; crop: CropRect | null
  merchant_slug: string; merchant_name: string; merchant_logo?: string | null
  distance_miles: number | null
  valid_from: string | null; valid_to: string | null; discount_pct: number | null
  unit_price?: number | null; size_unit?: string | null
  hist_min_price?: number | null; hist_weeks?: number | null
}

export function isHistoricalLow(deal: DealRecord): boolean {
  return deal.price != null && deal.hist_min_price != null
    && (deal.hist_weeks ?? 0) >= 4 && deal.price <= deal.hist_min_price
}

export function DealCard({ deal, onClick }: { deal: DealRecord; onClick?: () => void }) {
  const daysLeft = daysUntil(deal.valid_to)
  return (
    <button onClick={onClick}
      className="text-left rounded-xl bg-neutral-900 p-3 flex flex-col gap-2 hover:bg-neutral-800/80 active:scale-[0.98] transition">
      {deal.crop ? <FlyerCrop crop={deal.crop} alt={deal.name} />
        : deal.image_url ? <img src={deal.image_url} alt="" loading="lazy" className="w-full aspect-square object-contain rounded-lg bg-white" />
        : <div className="w-full aspect-square rounded-lg bg-neutral-800 flex items-center justify-center text-3xl">🛒</div>}
      <div className="text-sm font-medium leading-tight line-clamp-2">{deal.name}</div>
      {deal.description && <div className="text-xs text-neutral-400 line-clamp-1">{deal.description}</div>}
      <div className="mt-auto flex items-baseline gap-2 flex-wrap">
        {deal.price != null ? (
          <>
            <span className="text-emerald-400 text-lg font-bold">${deal.price.toFixed(2)}{deal.unit ? `/${deal.unit}` : ''}</span>
            {deal.original_price != null && deal.original_price > deal.price &&
              <span className="text-neutral-500 line-through text-sm">${deal.original_price.toFixed(2)}</span>}
            {deal.discount_pct != null && <span className="text-xs bg-emerald-900/60 text-emerald-300 rounded px-1.5 py-0.5">-{deal.discount_pct}%</span>}
            {deal.price_text?.includes('/$') && <span className="text-xs text-neutral-400">{deal.price_text}</span>}
          </>
        ) : deal.sale_story ? <span className="text-emerald-400 font-semibold text-sm">{deal.sale_story}</span>
          : deal.price_text ? <span className="text-emerald-400 font-semibold text-sm">{deal.price_text}</span>
          : null}
      </div>
      <div className="flex items-center gap-2 flex-wrap empty:hidden">
        {deal.unit_price != null && deal.unit !== 'lb' && deal.size_unit &&
          <span className="text-[11px] text-neutral-500">${deal.unit_price.toFixed(2)}/{deal.size_unit}</span>}
        {isHistoricalLow(deal) &&
          <span className="text-[11px] bg-amber-900/50 text-amber-300 rounded px-1.5 py-0.5">🏷️ lowest in {deal.hist_weeks}w</span>}
      </div>
      {deal.prime_price != null && <div className="text-xs text-sky-300">${deal.prime_price.toFixed(2)} with Prime</div>}
      <div className="flex items-center justify-between text-xs text-neutral-400 gap-1">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {deal.merchant_logo && <img src={deal.merchant_logo} alt="" className="w-4 h-4 rounded-full object-contain bg-white shrink-0" />}
          <span className="truncate">{deal.merchant_name}{deal.distance_miles != null ? ` · ${deal.distance_miles} mi` : ''}</span>
        </span>
        {daysLeft != null && <span className="shrink-0">{daysLeft === 0 ? 'ends today' : `${daysLeft}d left`}</span>}
      </div>
    </button>
  )
}
