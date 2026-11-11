// Stores the scan leaves out entirely: their flyers aren't fetched, and deals already saved
// from them are retired, so they drop off the store list. Slugs as the app shows them in
// URLs (e.g. "c-town"). Override with SKIP_STORES="slug-a,slug-b" (empty string = none).
const DEFAULT_SKIP = ['c-town']

export function skippedStores(env: string | undefined = process.env.SKIP_STORES): Set<string> {
  const list = env == null ? DEFAULT_SKIP : env.split(',')
  return new Set(list.map(s => s.trim().toLowerCase()).filter(Boolean))
}

/**
 * Leave skipped stores out of a deals query. The store list already hides them, but a
 * stale copy of that list (offline cache, older tab) or a scan that hasn't run since a
 * store was skipped would otherwise still surface their deals.
 */
export function excludeSkipped<Q>(query: Q): Q {
  const skip = [...skippedStores()]
  if (!skip.length) return query
  const list = `(${skip.map(s => `"${s.replace(/"/g, '')}"`).join(',')})`
  return (query as unknown as { not(column: string, op: string, value: string): Q }).not('merchant_slug', 'in', list)
}
