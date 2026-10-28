// Weekly meal planner: dinners built around this week's deals, whose ingredients drop
// straight into the shopping list. Prompting and validation are pure and unit-tested.

export interface MealDeal { id: number; name: string; price: number; unit?: string | null; merchant_name: string; category?: string | null }
export interface MealPrefs { notes?: string; count?: number; budget?: number | null }
export interface Ingredient {
  name: string                // what goes on the list, e.g. "chicken thighs"
  amount?: string | null      // "2 lb", "1 bunch"
  dealId?: number | null
  dealName?: string; store?: string; price?: number; unit?: string | null
}
export interface Dinner { title: string; emoji: string; description: string; ingredients: Ingredient[]; estCost: number }

export const FOOD_CATEGORIES = ['produce', 'meat', 'seafood', 'dairy', 'pantry', 'bakery', 'frozen']

export function mealPrompt(deals: MealDeal[], prefs: MealPrefs, keep: Dinner[], count: number): string {
  const list = deals.map(d => `${d.id}: ${d.name} — $${d.price.toFixed(2)}${d.unit === 'lb' ? '/lb' : ''} at ${d.merchant_name}`).join('\n')
  return `Plan ${count} weeknight dinners for me using what's on sale near me this week.

On sale (id: item — price at store):
${list}

${prefs.notes?.trim() ? `My preferences: ${prefs.notes.trim()}\n` : ''}${prefs.budget ? `Keep each dinner's sale-item cost under about $${prefs.budget}.\n` : ''}${keep.length ? `I'm already making: ${keep.map(k => k.title).join('; ')}. Don't repeat those.\n` : ''}
Rules:
- Each dinner uses 2-4 sale items plus common pantry staples (oil, salt, spices); vary proteins and cuisines.
- List every ingredient I'd need to buy. For a sale item, set dealId to its id from the list above.
- "name" is short and generic, as I'd write it on a shopping list ("chicken thighs", "broccoli").
- "amount" is how much for 2-3 servings ("1.5 lb", "1 head").
- estCost sums the sale items' prices for the amounts used.
Return ONLY a JSON array:
[{"title":"...","emoji":"🍗","description":"one appetizing sentence","ingredients":[{"name":"...","amount":"...","dealId":123}],"estCost":12.5}]`
}

/** Keep only well-formed dinners, and only deal ids that are really on the list. */
export function cleanDinners(raw: unknown, deals: Map<number, MealDeal>): Dinner[] {
  if (!Array.isArray(raw)) return []
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  return raw.flatMap((r): Dinner[] => {
    const o = (r ?? {}) as Record<string, unknown>
    const title = str(o.title, 80)
    if (!title || !Array.isArray(o.ingredients)) return []
    const ingredients = o.ingredients.flatMap((i): Ingredient[] => {
      const x = (i ?? {}) as Record<string, unknown>
      const name = str(x.name, 60).toLowerCase()
      if (!name) return []
      const deal = Number.isInteger(x.dealId) ? deals.get(x.dealId as number) : undefined
      return [{
        name, amount: str(x.amount, 30) || null,
        ...(deal ? { dealId: deal.id, dealName: deal.name, store: deal.merchant_name, price: deal.price, unit: deal.unit ?? null } : {}),
      }]
    }).slice(0, 12)
    const est = Number(o.estCost)
    return [{
      title, emoji: str(o.emoji, 8) || '🍽️', description: str(o.description, 200), ingredients,
      estCost: Number.isFinite(est) && est >= 0 ? Math.round(est * 100) / 100
        : Math.round(ingredients.reduce((s, i) => s + (i.price ?? 0), 0) * 100) / 100,
    }]
  })
}

/** Turn "1.5 lb" into a list quantity when it's one we understand. */
export function amountToQty(amount: string | null | undefined): { qty: number; unit: string | null } {
  const m = /^(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|g)?\b/i.exec(amount?.trim() ?? '')
  if (!m) return { qty: 1, unit: null }
  const unit = m[2] ? (m[2].toLowerCase() === 'lbs' ? 'lb' : m[2].toLowerCase()) : null
  const qty = Number(m[1])
  // "2 onions" is a count; "3 cloves" of garlic is still one thing to buy
  return unit ? { qty, unit } : { qty: qty <= 6 ? qty : 1, unit: null }
}
