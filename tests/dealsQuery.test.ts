import { expect, test } from 'vitest'
import { parseDealsParams, sanitizeSearch } from '@/lib/api/dealsQuery'

test('defaults', () => {
  expect(parseDealsParams(new URLSearchParams())).toEqual({
    q: null, stores: null, category: null, status: 'active', sort: 'discount', limit: 200,
  })
})

test('parses and clamps', () => {
  const p = parseDealsParams(new URLSearchParams('q=chicken&stores=aldi,fairway&category=meat&status=upcoming&sort=price&limit=9999'))
  expect(p).toEqual({ q: 'chicken', stores: ['aldi', 'fairway'], category: 'meat', status: 'upcoming', sort: 'price', limit: 500 })
})

test('search term cannot break the PostgREST or-filter', () => {
  expect(parseDealsParams(new URLSearchParams({ q: 'milk, 2%' })).q).toBe('milk 2')
  expect(parseDealsParams(new URLSearchParams({ q: 'eggs (dozen)' })).q).toBe('eggs dozen')
  expect(parseDealsParams(new URLSearchParams({ q: 'a_b*c' })).q).toBe('a b c')
})

test('search keeps everyday punctuation and drops empty results', () => {
  expect(sanitizeSearch("Ben & Jerry's")).toBe("Ben & Jerry's")
  expect(sanitizeSearch('jalapeño 1.5-lb')).toBe('jalapeño 1.5-lb')
  expect(sanitizeSearch(' ,%() ')).toBeNull()
  expect(sanitizeSearch('x'.repeat(200))).toHaveLength(80)
})
