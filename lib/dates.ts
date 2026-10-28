const DAY_MS = 86_400_000

/** Whole days until `iso` (0 once it's today or past), or null when there's no end date. */
export function daysLeft(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const t = +new Date(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.ceil((t - now) / DAY_MS))
}
