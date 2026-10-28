import { expect, test } from 'vitest'
import { dealSignal, historyScore, isHistoricalLow, rankByHistory, usualPrice } from '@/lib/history'

const base = { id: 1, price: 3.89 }

test('historical low needs a month of history', () => {
  expect(isHistoricalLow({ ...base, hist_min_price: 3.89, hist_weeks: 12 })).toBe(true)
  expect(isHistoricalLow({ ...base, hist_min_price: 3.89, hist_weeks: 2 })).toBe(false)
  expect(isHistoricalLow({ ...base, hist_min_price: 3.49, hist_weeks: 12 })).toBe(false)
})

test('usual price only on the same basis and above the deal', () => {
  expect(usualPrice({ ...base, typical_price: 4.99, cmp_basis: 'ea' })).toBe(4.99)
  expect(usualPrice({ ...base, typical_price: 4.99, cmp_basis: 'lb' })).toBeNull()
  expect(usualPrice({ ...base, unit: 'lb', typical_price: 4.99, cmp_basis: 'lb' })).toBe(4.99)
  expect(usualPrice({ ...base, typical_price: 3.5, cmp_basis: 'ea' })).toBeNull()
})

test('one signal per deal, record low first', () => {
  expect(dealSignal({ ...base, hist_min_price: 3.89, hist_weeks: 8, price_verdict: 'great' })).toEqual({ kind: 'low', weeks: 8 })
  expect(dealSignal({ ...base, price_verdict: 'great' })).toEqual({ kind: 'great' })
  expect(dealSignal({ ...base, discount_pct: 60 })).toBeNull()
})

test('history beats a big claimed discount', () => {
  const inflated = { id: 1, price: 5, discount_pct: 60, price_verdict: 'weak', cmp_price: 5, typical_price: 4 }
  const recordLow = { id: 2, price: 2, discount_pct: 15, hist_min_price: 2, hist_weeks: 10 }
  const great = { id: 3, price: 3, discount_pct: 20, price_verdict: 'great', cmp_price: 3, typical_price: 4.5 }
  expect(historyScore(recordLow)).toBeGreaterThan(historyScore(inflated))
  expect(rankByHistory([inflated, great, recordLow]).map(d => d.id).at(-1)).toBe(1)
})

test('rank drops duplicates from merged queries', () => {
  expect(rankByHistory([{ id: 1, price: 1 }, { id: 1, price: 1 }, { id: 2, price: 2 }])).toHaveLength(2)
})
