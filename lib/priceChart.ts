// Layout for the deal sheet's dated price chart. Pure, unit-tested.
import { shortDate } from '@/lib/dates'

export interface ChartPoint { valid_from: string; price: number }
export interface ChartLayout {
  dots: Array<{ x: number; y: number; price: number; current: boolean }>
  usualY: number | null
  // the "usual nearby" label sits at the end of its line away from the current dot
  usualLabel: { x: number; anchor: 'start' | 'end' } | null
  dates: Array<{ x: number; label: string; anchor: 'start' | 'middle' | 'end' }>
  min: number; max: number
}

export const CHART = { w: 320, h: 120, left: 34, right: 10, top: 18, bottom: 22 }

/**
 * Sales spaced by their real dates (a three-week gap looks like one), the deal's own
 * week highlighted, and the usual nearby price as a reference line when it's on scale.
 */
export function layoutChart(points: ChartPoint[], currentFrom: string | null, usual: number | null): ChartLayout {
  const { w, h, left, right, top, bottom } = CHART
  const times = points.map(p => +new Date(p.valid_from))
  const t0 = Math.min(...times), t1 = Math.max(...times)
  const prices = points.map(p => p.price)
  const min = Math.min(...prices, ...(usual != null ? [usual] : []))
  const max = Math.max(...prices, ...(usual != null ? [usual] : []))
  const span = max - min || 1
  const x = (t: number) => (t1 === t0 ? (left + w - right) / 2 : left + ((t - t0) / (t1 - t0)) * (w - left - right))
  const y = (v: number) => top + (1 - (v - min) / span) * (h - top - bottom)
  // the deal's own week; fall back to the latest sale when its week isn't in history
  const cur = currentFrom != null && times.includes(+new Date(currentFrom)) ? +new Date(currentFrom) : t1
  const dots = points.map((p, i) => ({ x: x(times[i]), y: y(p.price), price: p.price, current: times[i] === cur }))
  const first = dots[0], last = dots[dots.length - 1]
  const dates: ChartLayout['dates'] = [{ x: first.x, label: shortDate(points[0].valid_from) ?? '', anchor: 'start' }]
  if (dots.length > 1) {
    dates.push({ x: last.x, label: shortDate(points[points.length - 1].valid_from) ?? '', anchor: 'end' })
    // a middle date only when it has room between the ends
    const mid = (first.x + last.x) / 2
    const i = dots.reduce((best, d, j) => (Math.abs(d.x - mid) < Math.abs(dots[best].x - mid) ? j : best), 0)
    if (dots[i].x - first.x > 60 && last.x - dots[i].x > 60) dates.push({ x: dots[i].x, label: shortDate(points[i].valid_from) ?? '', anchor: 'middle' })
  }
  const curDot = dots.find(d => d.current)!
  const usualLabel = usual == null ? null
    : curDot.x > (left + w - right) / 2 ? { x: left, anchor: 'start' as const } : { x: w - right, anchor: 'end' as const }
  return { dots, usualY: usual != null ? y(usual) : null, usualLabel, dates, min, max }
}

/**
 * "Was $1.49 here on Sep 24 (17% less)" when this store's lowest sale over at least four
 * sales is 15% or more below the deal's price; the date is the latest sale at that low.
 */
export function wasCheaperNote(points: ChartPoint[], price: number | null): string | null {
  if (price == null || points.length < 4) return null
  const low = Math.min(...points.map(p => p.price))
  if (low <= 0 || price < low * 1.15) return null
  const when = shortDate(points.filter(p => p.price === low).at(-1)!.valid_from)
  return `Was $${low.toFixed(2)} here${when ? ` on ${when}` : ''} (${Math.round((1 - low / price) * 100)}% less)`
}

/**
 * The usual nearby sale price for this deal's package, from the product's typical
 * comparable price. Null when the bases differ or the result looks implausible.
 */
export function usualPackagePrice(
  deal: { price: number | null; cmp_price?: number | null; cmp_basis?: string | null },
  stats: { basis: string; median: number } | null,
): number | null {
  if (!stats || deal.price == null || deal.cmp_price == null || Number(deal.cmp_price) <= 0) return null
  if (deal.cmp_basis !== stats.basis) return null
  const usual = Math.round(Number(stats.median) * (deal.price / Number(deal.cmp_price)) * 100) / 100
  // a bad size parse elsewhere can make the median nonsense; don't draw that
  return usual >= deal.price * 0.4 && usual <= deal.price * 2.5 ? usual : null
}
