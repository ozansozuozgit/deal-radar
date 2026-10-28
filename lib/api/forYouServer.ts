import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/db'
import { pickForYou, type ForYouDeal, type Signal } from '@/lib/foryou'

const LIGHT = 'id, name, normalized_name, canonical, merchant_slug, price, original_price, unit, size_qty, size_unit, category, price_verdict, discount_pct, flyers!inner(merchant_name)'

export interface Profile {
  signals: Signal[]
  hidden: string[]
  categories: string[]        // what you buy most, for "great price" extras
  list: Array<{ text: string; qty: number; unit: string | null; pinnedDealId: number | null; rejectedDealIds: number[] }>
}

/** Everything a list code tells us about what Ozan buys. */
export async function loadProfile(db: SupabaseClient, code: string): Promise<Profile> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const [items, watches, bought, hidden] = await Promise.all([
    db.from('list_items').select('text, qty, unit, pinned_deal_id, rejected_deal_ids').eq('code', code),
    db.from('watches').select('term').eq('device_id', `list:${code}`),
    db.from('purchases').select('text, category').eq('list_code', code).gte('bought_at', since).limit(1000),
    db.from('hidden_terms').select('term').eq('list_code', code),
  ])
  const counts = new Map<string, number>()
  const catCounts = new Map<string, number>()
  for (const p of bought.data ?? []) {
    counts.set(p.text.toLowerCase(), (counts.get(p.text.toLowerCase()) ?? 0) + 1)
    if (p.category) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1)
  }
  return {
    signals: [
      ...(items.data ?? []).map(i => ({ term: i.text, reason: 'list' as const })),
      ...(watches.data ?? []).map(w => ({ term: w.term, reason: 'watch' as const })),
      ...[...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([term]) => ({ term, reason: 'bought' as const })),
    ],
    hidden: (hidden.data ?? []).map(h => h.term),
    categories: [...catCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c),
    list: (items.data ?? []).map(i => ({
      text: i.text, qty: Number(i.qty ?? 1), unit: i.unit,
      pinnedDealId: i.pinned_deal_id, rejectedDealIds: i.rejected_deal_ids ?? [],
    })),
  }
}

type Row = Omit<ForYouDeal, 'merchant_name'> & { flyers?: { merchant_name?: string } | null }

/** Every running priced deal at these stores (all stores when empty), light columns only. */
export async function activeDeals(db: SupabaseClient, stores: string[]): Promise<ForYouDeal[]> {
  const now = new Date().toISOString()
  const rows = await fetchAll<Row>((from, to) => {
    let q = db.from('deals').select(LIGHT).not('price', 'is', null).lte('valid_from', now).gte('valid_to', now)
    if (stores.length) q = q.in('merchant_slug', stores)
    return q.order('id').range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
  })
  return rows.map(({ flyers, ...d }) => ({ ...d, merchant_name: flyers?.merchant_name ?? d.merchant_slug }))
}

export function forYouFor(profile: Profile, deals: ForYouDeal[], limit = 24) {
  return pickForYou(profile.signals, deals, profile.hidden, { limit, greatCategories: profile.categories })
}
