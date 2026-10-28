// Savings tracker summaries over logged purchases. Pure functions, unit-tested.

export interface Purchase {
  id: number; text: string; deal_id: number | null; name: string | null
  merchant_slug: string | null; merchant_name: string | null; category: string | null
  qty: number; unit: string | null; cost: number | null; regular_cost: number | null
  bought_at: string
}

export interface MonthTotal { key: string; label: string; spent: number; saved: number }
export interface Habit { text: string; count: number; onDeal: number; stores: string[] }

export interface SavingsSummary {
  month: { spent: number; saved: number; trips: number; items: number }
  months: MonthTotal[]                                           // oldest first
  byCategory: Array<{ category: string; spent: number }>        // last 90 days
  byStore: Array<{ name: string; spent: number; saved: number }> // last 90 days
  habits: Habit[]                                                // bought 3+ times in 60 days
}

const DAY = 86_400_000
const r2 = (n: number) => Math.round(n * 100) / 100
const saved = (p: Purchase) => (p.regular_cost != null && p.cost != null ? Math.max(0, p.regular_cost - p.cost) : 0)

export function summarize(purchases: Purchase[], now = new Date()): SavingsSummary {
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = monthKey(now)

  const months: MonthTotal[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: monthKey(d), label: d.toLocaleString('en-US', { month: 'short' }), spent: 0, saved: 0 })
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]))
  const month = { spent: 0, saved: 0, trips: 0, items: 0 }
  const tripDays = new Set<string>()
  const cats = new Map<string, number>()
  const stores = new Map<string, { spent: number; saved: number }>()
  const habits = new Map<string, Habit>()

  for (const p of purchases) {
    const at = new Date(p.bought_at)
    const key = monthKey(at)
    const i = monthIdx.get(key)
    if (i != null) { months[i].spent += p.cost ?? 0; months[i].saved += saved(p) }
    if (key === thisMonth) {
      month.spent += p.cost ?? 0; month.saved += saved(p); month.items++
      tripDays.add(at.toDateString())
    }
    const age = +now - +at
    if (age <= 90 * DAY) {
      if (p.cost != null) {
        const c = p.category ?? 'other'
        cats.set(c, (cats.get(c) ?? 0) + p.cost)
      }
      if (p.merchant_name) {
        const s = stores.get(p.merchant_name) ?? { spent: 0, saved: 0 }
        s.spent += p.cost ?? 0; s.saved += saved(p)
        stores.set(p.merchant_name, s)
      }
    }
    if (age <= 60 * DAY) {
      const k = p.text.toLowerCase()
      const h = habits.get(k) ?? { text: p.text, count: 0, onDeal: 0, stores: [] }
      h.count++
      if (p.regular_cost != null) h.onDeal++
      if (p.merchant_name && !h.stores.includes(p.merchant_name)) h.stores.push(p.merchant_name)
      habits.set(k, h)
    }
  }
  month.trips = tripDays.size

  return {
    month: { ...month, spent: r2(month.spent), saved: r2(month.saved) },
    months: months.map(m => ({ ...m, spent: r2(m.spent), saved: r2(m.saved) })),
    byCategory: [...cats.entries()].map(([category, spent]) => ({ category, spent: r2(spent) })).sort((a, b) => b.spent - a.spent),
    byStore: [...stores.entries()].map(([name, s]) => ({ name, spent: r2(s.spent), saved: r2(s.saved) })).sort((a, b) => b.spent - a.spent),
    habits: [...habits.values()].filter(h => h.count >= 3).sort((a, b) => b.count - a.count),
  }
}
