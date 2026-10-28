// Give every active deal a canonical product. The dictionary (lib/parse/canonical.ts)
// handles staples at upsert time; names it doesn't know go to Gemini once, in batches,
// and the answers are cached in product_canon so each name is only ever asked about once.
import { fetchAll, getServiceClient } from '@/lib/db'
import { geminiJson, hasGemini } from '@/lib/gemini'
import { CANONICAL_PRODUCTS } from '@/lib/parse/canonical'

const BATCH = 150
const MAX_BATCHES_PER_RUN = 4 // stays well inside the free tier; the backlog clears over a few days

export function canonicalPrompt(names: string[]): string {
  return `You normalize grocery flyer item names into generic product names a shopper would type into a shopping list.
Rules:
- Lowercase, singular or plural as people usually say it ("chicken breast", "eggs", "strawberries", "ground beef").
- Drop brands, sizes, counts, marketing words ("family pack", "premium", "all natural").
- Prefer one of these existing names when it fits: ${CANONICAL_PRODUCTS.join(', ')}.
- Otherwise invent a short generic name (1-3 words).
- Use null for things that aren't a single grocery product (store coupons, gift cards, "select varieties" with no product).
Return ONLY a JSON object mapping each input name exactly as given to its product name or null.

Names:
${names.map(n => `- ${n}`).join('\n')}`
}

/** Keep only answers for names we asked about, as short clean strings (or null). */
export function cleanAnswers(names: string[], answers: Record<string, unknown> | null): Map<string, string | null> {
  const out = new Map<string, string | null>()
  if (!answers) return out
  for (const n of names) {
    if (!(n in answers)) continue
    const v = answers[n]
    if (v === null) out.set(n, null)
    else if (typeof v === 'string') {
      const c = v.toLowerCase().replace(/[^a-z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim()
      out.set(n, c && c.length <= 40 ? c : null)
    }
  }
  return out
}

export async function canonicalizeDeals(): Promise<void> {
  const db = getServiceClient()
  const now = new Date().toISOString()
  if (hasGemini()) {
    const rows = await fetchAll<{ normalized_name: string }>((from, to) => db.from('deals')
      .select('normalized_name').is('canonical', null).gte('valid_to', now)
      .order('normalized_name').range(from, to))
    const unknown = [...new Set(rows.map(r => r.normalized_name))]
    const cached = new Set<string>()
    for (let i = 0; i < unknown.length; i += 500) {
      const { data } = await db.from('product_canon').select('normalized_name').in('normalized_name', unknown.slice(i, i + 500))
      for (const r of data ?? []) cached.add(r.normalized_name)
    }
    const todo = unknown.filter(n => !cached.has(n))
    let asked = 0
    for (let i = 0; i < todo.length && i / BATCH < MAX_BATCHES_PER_RUN; i += BATCH) {
      const names = todo.slice(i, i + BATCH)
      try {
        const answers = cleanAnswers(names, await geminiJson<Record<string, unknown>>(canonicalPrompt(names)))
        if (!answers.size) continue
        const { error } = await db.from('product_canon').upsert(
          [...answers].map(([normalized_name, canonical]) => ({ normalized_name, canonical })),
          { onConflict: 'normalized_name' })
        if (error) throw new Error(error.message)
        asked += answers.size
      } catch (e) { console.error('[canonical] batch failed:', e); break }
    }
    console.log(`[canonical] ${unknown.length} unknown names, ${todo.length} new, ${asked} classified`)
  } else {
    console.log('[canonical] no GEMINI_API_KEY — dictionary only')
  }
  const { error } = await db.rpc('apply_product_canon')
  if (error) throw new Error(`apply_product_canon: ${error.message}`)
}
