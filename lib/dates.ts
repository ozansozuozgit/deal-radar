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

/** Short calendar date for "since" labels: "Jul 24", plus the year once it's a different year. */
export function shortDate(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(+d)) return null
  // flyer dates are calendar days stored at midnight UTC or ET, so read them in UTC
  const otherYear = d.getUTCFullYear() !== new Date(now).getUTCFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC', ...(otherYear && { year: 'numeric' }) })
}

/** Hours elapsed since `iso`, or null for a missing/unparseable date. */
export function hoursSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const t = +new Date(iso)
  return Number.isFinite(t) ? (now - t) / 3_600_000 : null
}

/** A daily scan re-sees its prices within a day, so anything older than this gets its age shown. */
export const STALE_AFTER_HOURS = 48

/** "5d ago" for a price last seen over two days ago, null while it's fresh (or undated). */
export function staleAge(lastSeen: string | null | undefined, now: number = Date.now()): string | null {
  const h = hoursSince(lastSeen, now)
  return h != null && h > STALE_AFTER_HOURS ? timeAgo(lastSeen, now) : null
}
