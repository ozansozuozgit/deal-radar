// Plain-language price verdicts from price_stats. Pure, unit-tested.

export interface PriceStats {
  canonical: string; basis: string; median: number; p25: number; low: number
  samples: number; stores: number; cycle_days: number | null; last_sale: string | null
}

export function basisSuffix(basis: string | null | undefined): string {
  return basis === 'lb' ? '/lb' : basis === 'ct' ? ' each' : ''
}

export function verdictText(verdict: string | null | undefined, cmp: number | null | undefined, stats: PriceStats | null): string | null {
  if (!verdict || !stats || cmp == null) return null
  const typical = `$${Number(stats.median).toFixed(2)}${basisSuffix(stats.basis)}`
  const now = `$${Number(cmp).toFixed(2)}${basisSuffix(stats.basis)}`
  if (verdict === 'great') return `💎 Great price — stock up. Sales around here are usually ${typical}; this is ${now}.`
  if (verdict === 'weak') return `😐 Weak sale. It usually goes on sale for ${typical} around here (this is ${now}) — worth waiting.`
  return `👍 A normal sale price (usually ${typical} on sale around here).`
}

/** "On sale about every 4 weeks; last seen 2 weeks ago" */
export function cycleText(stats: PriceStats | null, now = Date.now()): string | null {
  if (!stats?.cycle_days) return null
  const weeks = Math.max(1, Math.round(Number(stats.cycle_days) / 7))
  let text = `Goes on sale about every ${weeks === 1 ? 'week' : `${weeks} weeks`}`
  if (stats.last_sale) {
    const ago = Math.round((now - +new Date(stats.last_sale)) / (7 * 86_400_000))
    if (ago >= 1) text += `; last sale ${ago} week${ago === 1 ? '' : 's'} ago`
  }
  return text
}
