// Stores the scan leaves out entirely: their flyers aren't fetched, and deals already saved
// from them are retired, so they drop off the store list. Slugs as the app shows them in
// URLs (e.g. "c-town"). Override with SKIP_STORES="slug-a,slug-b" (empty string = none).
const DEFAULT_SKIP = ['c-town']

export function skippedStores(env: string | undefined = process.env.SKIP_STORES): Set<string> {
  const list = env == null ? DEFAULT_SKIP : env.split(',')
  return new Set(list.map(s => s.trim().toLowerCase()).filter(Boolean))
}
