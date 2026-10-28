// "Dinner from deals": env-gated Gemini generation, runs at the end of ingest.
import { getServiceClient } from '@/lib/db'

export interface DinnerIdea {
  title: string; emoji: string; description: string
  ingredients: Array<{ name: string; dealName?: string; store?: string; price?: number }>
  estCost: number
}

/**
 * LLM output is untrusted: fields go missing, numbers come back as strings, arrays as
 * objects. Coerce into the exact shape the feed renders, dropping ideas without a title.
 */
export function sanitizeIdeas(raw: unknown): DinnerIdea[] {
  if (!Array.isArray(raw)) return []
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[$,]/g, '')) : NaN
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined
  }
  return raw.flatMap((r): DinnerIdea[] => {
    if (!r || typeof r !== 'object') return []
    const o = r as Record<string, unknown>
    const title = str(o.title, 80)
    if (!title) return []
    const ingredients = (Array.isArray(o.ingredients) ? o.ingredients : []).flatMap(i => {
      if (!i || typeof i !== 'object') return []
      const g = i as Record<string, unknown>
      const name = str(g.name, 60)
      if (!name) return []
      return [{ name, dealName: str(g.dealName, 120) || undefined, store: str(g.store, 60) || undefined, price: num(g.price) }]
    })
    const estCost = num(o.estCost) ?? Math.round(ingredients.reduce((t, i) => t + (i.price ?? 0), 0) * 100) / 100
    return [{ title, emoji: str(o.emoji, 8) || '🍽️', description: str(o.description, 240), ingredients, estCost }]
  }).slice(0, 3)
}

export async function generateDinnerIdeas(): Promise<void> {
  const key = process.env.GEMINI_API_KEY
  if (!key) { console.log('[dinner] no GEMINI_API_KEY — skipping'); return }
  const db = getServiceClient()
  const now = new Date().toISOString()
  const { data: deals } = await db.from('deals')
    .select('name, price, merchant_slug, category')
    .not('price', 'is', null)
    .lte('valid_from', now).gte('valid_to', now)
    .in('category', ['produce', 'meat', 'seafood', 'dairy', 'pantry'])
    .order('discount_pct', { ascending: false, nullsFirst: false })
    .limit(40)
  if (!deals?.length) { console.log('[dinner] no priced deals'); return }
  const { data: stores } = await db.from('stores').select('slug, name')
  const storeName = new Map((stores ?? []).map(s => [s.slug, s.name]))

  const dealList = deals.map(d =>
    `${d.name} — $${Number(d.price).toFixed(2)} at ${storeName.get(d.merchant_slug) ?? d.merchant_slug} (${d.category})`).join('\n')

  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `These grocery items are on sale near me this week:\n\n${dealList}\n\nSuggest exactly 3 realistic weeknight dinner ideas that make the most of these sale items. Return ONLY a JSON array:\n[{"title":"...","emoji":"🍝","description":"one appetizing sentence","ingredients":[{"name":"...","dealName":"exact deal name from the list if used","store":"store name","price":4.99}],"estCost":14.5}]\nRules: each dinner should use 2-4 of the sale items (plus pantry basics); estCost sums the sale-item prices used; keep descriptions short and appetizing.`,
          }],
        }],
        generationConfig: { temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  )
  if (!res.ok) { console.error(`[dinner] Gemini HTTP ${res.status}`); return }
  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const jsonText = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  let parsed: unknown
  try { parsed = JSON.parse(jsonText) } catch { console.error('[dinner] non-JSON response'); return }
  const ideas = sanitizeIdeas(parsed)
  if (ideas.length === 0) { console.error('[dinner] empty ideas'); return }
  const { error } = await db.from('suggestions').insert({ payload: { ideas } })
  if (error) console.error('[dinner] insert failed:', error.message)
  else console.log(`[dinner] stored ${ideas.length} ideas`)
}
