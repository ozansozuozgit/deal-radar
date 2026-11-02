// Plain-language price verdicts from price_stats. Pure, unit-tested.

export interface PriceStats {
  canonical: string; basis: string; median: number; p25: number; low: number
  samples: number; stores: number; cycle_days: number | null; last_sale: string | null
}

/**
 * One sentence for a deal that's clearly good or clearly weak, in the deal's own package
 * price. A typical price needs no sentence: the chart's "usual nearby" line says it.
 */
export function verdictLine(verdict: string | null | undefined, usual: number | null): string | null {
  if (usual == null) return null
  if (verdict === 'great') return `Great price. It usually goes on sale for $${usual.toFixed(2)} around here.`
  if (verdict === 'weak') return `Weak sale. It usually goes on sale for $${usual.toFixed(2)} around here, so it may be worth waiting.`
  return null
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
