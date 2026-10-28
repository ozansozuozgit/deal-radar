const DAY_MS = 86_400_000

/** Whole days until `iso` (0 once it's today or past), or null when there's no end date. */
export function daysLeft(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const t = +new Date(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.ceil((t - now) / DAY_MS))
}

/** Compact relative time for freshness labels: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const t = +new Date(iso)
  if (!Number.isFinite(t)) return null
  const min = Math.max(0, Math.floor((now - t) / 60_000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
