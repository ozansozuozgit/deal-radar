export interface DealsParams {
  q: string | null; stores: string[] | null; category: string | null
  status: 'active' | 'upcoming'; sort: 'best' | 'discount' | 'price' | 'ending'; limit: number
  ids: number[] | null   // fetch specific deals (e.g. from a notification), whatever their dates
}

/** Trim, collapse whitespace, cap length. `*` is PostgREST's alias for `%`, so drop it. */
export function sanitizeSearch(raw: string | null | undefined): string | null {
  const q = (raw ?? '').replace(/[*\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return q || null
}

/**
 * Case-insensitive substring match on any of `columns`, as a PostgREST `or=(…)` filter.
 * The term is matched literally: LIKE wildcards are backslash-escaped, then the value is
 * double-quoted so commas, parentheses, dots and colons can't break the filter syntax
 * (e.g. "milk, 2%" used to 500, and "w/Aloe" or "2% milk" must still match).
 */
export function ilikeAny(columns: string[], term: string): string {
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  const quoted = `"${like.replace(/[\\"]/g, '\\$&')}"`
  return columns.map(c => `${c}.ilike.${quoted}`).join(',')
}

export function parseDealsParams(sp: URLSearchParams): DealsParams {
  const status = sp.get('status') === 'upcoming' ? 'upcoming' : 'active'
  const sortParam = sp.get('sort')
  const sort = sortParam === 'best' || sortParam === 'price' || sortParam === 'ending' ? sortParam : 'discount'
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 500)
  const ids = sp.get('ids')?.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 100) ?? null
  const stores = sp.get('stores')?.split(',').map(s => s.trim()).filter(Boolean) ?? null
  return {
    q: sanitizeSearch(sp.get('q')),
    stores: stores?.length ? stores : null,
    category: sp.get('category')?.trim() || null,
    status, sort, limit,
    ids: ids?.length ? ids : null,
  }
}

/**
 * The search filter: the term anywhere in the name or canonical product, plus an exact
 * canonical match for synonyms ("hamburger meat" also finds deals filed as "ground beef").
 */
export function searchFilter(term: string, canonical: string | null): string {
  const base = ilikeAny(['name', 'normalized_name', 'canonical'], term)
  return canonical ? `${base},canonical.eq.${JSON.stringify(canonical)}` : base
}
