import { expect, test } from 'vitest'
import { summarize, type Purchase } from '@/lib/savings'

const now = new Date('2026-10-28T12:00:00Z')
const p = (o: Partial<Purchase>): Purchase => ({
  id: Math.random(), text: 'milk', deal_id: null, name: null, merchant_slug: null, merchant_name: 'Aldi',
  category: 'dairy', qty: 1, unit: null, cost: 3, regular_cost: null, bought_at: '2026-10-20T15:00:00Z', ...o,
})

test('month totals, savings and trips', () => {
  const s = summarize([
    p({ cost: 3, regular_cost: 4 }),
    p({ text: 'eggs', cost: 2.5, bought_at: '2026-10-20T16:00:00Z' }),
    p({ text: 'bread', cost: 4, bought_at: '2026-10-25T16:00:00Z' }),
    p({ text: 'old', cost: 10, bought_at: '2026-09-02T16:00:00Z' }),
  ], now)
  expect(s.month).toEqual({ spent: 9.5, saved: 1, trips: 2, items: 3 })
  expect(s.months).toHaveLength(6)
  expect(s.months.at(-1)).toMatchObject({ spent: 9.5, saved: 1 })
  expect(s.months.at(-2)).toMatchObject({ spent: 10 })
  expect(s.byStore[0]).toMatchObject({ name: 'Aldi', spent: 19.5, saved: 1 })
})

test('habits flag items never bought on sale', () => {
  const s = summarize([1, 2, 3].map(d => p({ text: 'Chicken', bought_at: `2026-10-0${d}T10:00:00Z` })), now)
  expect(s.habits).toEqual([{ text: 'Chicken', count: 3, onDeal: 0, stores: ['Aldi'] }])
})
