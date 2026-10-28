export interface DealsParams {
  q: string | null; stores: string[] | null; category: string | null
  status: 'active' | 'upcoming'; sort: 'discount' | 'price' | 'ending'; limit: number
}

/**
 * The search term is interpolated into a PostgREST `or=(…)` filter, where commas and
 * parentheses are syntax and `%`, `_`, `*` are LIKE wildcards. A query like "milk, 2%"
 * used to break the filter and 500. Keep only characters that can't change its meaning.
 */
export function sanitizeSearch(raw: string | null | undefined): string | null {
  const q = (raw ?? '').replace(/[^\p{L}\p{N}\s'&.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return q || null
}

export function parseDealsParams(sp: URLSearchParams): DealsParams {
  const status = sp.get('status') === 'upcoming' ? 'upcoming' : 'active'
  const sortParam = sp.get('sort')
  const sort = sortParam === 'price' ? 'price' : sortParam === 'ending' ? 'ending' : 'discount'
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 500)
  const stores = sp.get('stores')?.split(',').map(s => s.trim()).filter(Boolean) ?? null
  return {
    q: sanitizeSearch(sp.get('q')),
    stores: stores?.length ? stores : null,
    category: sp.get('category')?.trim() || null,
    status, sort, limit,
  }
}
