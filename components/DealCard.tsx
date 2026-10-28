import type { CropRect } from '@/lib/types'
import { FlyerCrop } from './FlyerCrop'
import { Img, NoImage } from './Img'
import { daysLeft as daysUntil } from '@/lib/dates'
import { dealSignal, usualPrice } from '@/lib/history'
import { Price } from './Price'

export interface DealRecord {
  id: number; name: string; description: string | null
  price: number | null; original_price: number | null; prime_price: number | null
  unit: string | null; price_text: string | null; sale_story: string | null
  category: string; image_url: string | null; crop: CropRect | null
  merchant_slug: string; merchant_name: string; merchant_logo?: string | null
  distance_miles: number | null
  valid_from: string | null; valid_to: string | null; discount_pct: number | null
  unit_price?: number | null; size_qty?: number | null; size_unit?: string | null
  hist_min_price?: number | null; hist_weeks?: number | null
  canonical?: string | null; normalized_name?: string
  cmp_price?: number | null; cmp_basis?: string | null
  typical_price?: number | null; price_verdict?: string | null
}

export { isHistoricalLow } from '@/lib/history'

export function DealCard({ deal, onClick, compact = false }: { deal: DealRecord; onClick?: () => void; compact?: boolean }) {
  const daysLeft = daysUntil(deal.valid_to)
  const signal = dealSignal(deal)
  const usual = usualPrice(deal)
  const was = deal.original_price != null && deal.price != null && deal.original_price > deal.price ? deal.original_price : null
  return (
    <button onClick={onClick}
      className="group h-full w-full text-left rounded-xl bg-card border border-line p-2 flex flex-col gap-1.5 hover:border-neutral-600 hover:shadow-md hover:shadow-black/5 active:scale-[0.98] transition">
      <div className={`relative w-full ${compact ? 'aspect-[16/10]' : 'aspect-[4/3]'} rounded-lg bg-tile overflow-hidden p-1.5`}>
        {deal.crop ? <FlyerCrop crop={deal.crop} alt={deal.name} boxRatio={compact ? 1.6 : 4 / 3} />
          : <Img src={deal.image_url} alt="" loading="lazy" className="w-full h-full object-contain mix-blend-multiply" fallback={<NoImage />} />}
        {signal && (
          <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-ink text-tag px-1.5 py-0.5 text-[11px] font-bold leading-tight">
            {signal.kind === 'low' ? `Lowest in ${signal.weeks} wks` : 'Great price'}
          </span>
        )}
      </div>
      <div className={`font-bold leading-snug line-clamp-2 ${compact ? 'text-[13px]' : 'text-sm'}`}>{deal.name}</div>
      {!compact && deal.description && <div className="text-xs text-neutral-500 line-clamp-1 -mt-1">{deal.description}</div>}
      <div className="mt-auto pt-0.5 flex items-end gap-x-1.5 gap-y-1 flex-wrap">
        {deal.price != null ? (
          <>
            <Price value={deal.price} unit={deal.unit} size={compact ? 'sm' : 'md'} />
            <span className="flex flex-col leading-tight text-xs">
              {was != null && <span className="text-neutral-500 line-through">${was.toFixed(2)}</span>}
              {usual != null ? <span className="text-save font-bold">usually ${usual.toFixed(2)}</span>
                : deal.discount_pct != null ? <span className="text-save font-bold">−{deal.discount_pct}%</span> : null}
            </span>
          </>
        ) : (deal.sale_story ?? deal.price_text) ? (
          <span className="bg-tag text-ink font-condensed font-extrabold rounded-[4px] px-1.5 py-0.5 text-base leading-tight">{deal.sale_story ?? deal.price_text}</span>
        ) : null}
      </div>
      {!compact && (
        <div className="flex items-center justify-between text-xs text-neutral-500 gap-1">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Img src={deal.merchant_logo} alt="" className="w-4 h-4 rounded-full object-contain bg-white border border-line shrink-0" />
            <span className="truncate">{deal.merchant_name}{deal.distance_miles != null ? ` · ${deal.distance_miles} mi` : ''}</span>
          </span>
          {daysLeft != null && <span className={`shrink-0 ${daysLeft <= 1 ? 'text-urgent font-bold' : ''}`}>{daysLeft === 0 ? 'Ends today' : daysLeft === 1 ? 'Ends tomorrow' : `${daysLeft}d left`}</span>}
        </div>
      )}
    </button>
  )
}
