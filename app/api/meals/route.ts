import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'
import { geminiJson, hasGemini } from '@/lib/gemini'
import { activeDeals } from '@/lib/api/forYouServer'
import { cleanDinners, FOOD_CATEGORIES, mealPrompt, type Dinner, type MealDeal, type MealPrefs } from '@/lib/meals'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from('meal_plans').select('prefs, dinners, updated_at').eq('list_code', code).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data ?? null, canGenerate: hasGemini() })
}

/**
 * Plan dinners: { code, stores, prefs: { notes, count, budget }, keep?: Dinner[] }.
 * `keep` are dinners to hold on to (e.g. when swapping just one); the rest are new.
 */
export async function POST(req: NextRequest) {
  if (!hasGemini()) return NextResponse.json({ error: 'no_gemini' }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : null
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const stores: string[] = (Array.isArray(body.stores) ? body.stores : []).filter((s: unknown): s is string => typeof s === 'string' && !!s)
  const prefs: MealPrefs = {
    notes: typeof body.prefs?.notes === 'string' ? body.prefs.notes.slice(0, 300) : '',
    count: Math.min(Math.max(Number(body.prefs?.count) || 5, 1), 7),
    budget: Number(body.prefs?.budget) > 0 ? Number(body.prefs.budget) : null,
  }
  const keep: Dinner[] = Array.isArray(body.keep) ? body.keep.slice(0, 7) : []
  const want = Math.max(prefs.count! - keep.length, 1)

  const db = getServiceClient()
  try {
    const all = await activeDeals(db, stores)
    const food: MealDeal[] = all
      .filter(d => d.price != null && d.category && FOOD_CATEGORIES.includes(d.category))
      .sort((a, b) => Number(b.price_verdict === 'great') - Number(a.price_verdict === 'great') || (b.discount_pct ?? 0) - (a.discount_pct ?? 0))
      .slice(0, 150)
      .map(d => ({ id: d.id, name: d.name, price: d.price!, unit: d.unit, merchant_name: d.merchant_name, category: d.category }))
    if (food.length < 5) return NextResponse.json({ error: 'Not enough food deals nearby to plan with' }, { status: 422 })
    const raw = await geminiJson<unknown>(mealPrompt(food, prefs, keep, want), { temperature: 0.7, timeoutMs: 50_000 })
    const fresh = cleanDinners(raw, new Map(food.map(d => [d.id, d]))).slice(0, want)
    if (!fresh.length) return NextResponse.json({ error: 'The planner came back empty — try again' }, { status: 502 })
    const dinners = [...keep, ...fresh]
    const { error } = await db.from('meal_plans').upsert({ list_code: code, prefs, dinners, updated_at: new Date().toISOString() }, { onConflict: 'list_code' })
    if (error) throw new Error(error.message)
    return NextResponse.json({ plan: { prefs, dinners } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'planning failed' }, { status: 500 })
  }
}

/** Save edits without regenerating (e.g. removing a dinner): { code, dinners } */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : null
  if (!code || !Array.isArray(body.dinners)) return NextResponse.json({ error: 'code and dinners required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('meal_plans').upsert({ list_code: code, dinners: body.dinners.slice(0, 7), updated_at: new Date().toISOString() }, { onConflict: 'list_code' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
