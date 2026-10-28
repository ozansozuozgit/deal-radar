import { expect, test } from 'vitest'
import { ilikeAny, parseDealsParams, sanitizeSearch } from '@/lib/api/dealsQuery'

test('defaults', () => {
  expect(parseDealsParams(new URLSearchParams())).toEqual({
    q: null, stores: null, category: null, status: 'active', sort: 'discount', limit: 200, ids: null,
  })
})

test('parses and clamps', () => {
  const p = parseDealsParams(new URLSearchParams('q=chicken&stores=aldi,fairway&category=meat&status=upcoming&sort=price&limit=9999'))
  expect(p).toEqual({ q: 'chicken', stores: ['aldi', 'fairway'], category: 'meat', status: 'upcoming', sort: 'price', limit: 500, ids: null })
})

test('ids pick specific deals', () => {
  expect(parseDealsParams(new URLSearchParams('ids=12,x,7,-1')).ids).toEqual([12, 7])
})

test('search terms are kept literally, only trimmed and capped', () => {
  expect(parseDealsParams(new URLSearchParams({ q: '  milk,   2% ' })).q).toBe('milk, 2%')
  expect(sanitizeSearch('w/Aloe + Vitamin E')).toBe('w/Aloe + Vitamin E')
  expect(sanitizeSearch('a*b')).toBe('a b') // * is PostgREST's % alias
  expect(sanitizeSearch('  ')).toBeNull()
  expect(sanitizeSearch('x'.repeat(200))).toHaveLength(80)
})

test('ilikeAny quotes the value so filter syntax and wildcards stay literal', () => {
  expect(ilikeAny(['name', 'normalized_name'], 'eggs (dozen), 2%'))
    .toBe('name.ilike."%eggs (dozen), 2\\\\%%",normalized_name.ilike."%eggs (dozen), 2\\\\%%"')
  expect(ilikeAny(['name'], 'a_b')).toBe('name.ilike."%a\\\\_b%"')
  expect(ilikeAny(['name'], 'say "hi" \\ bye')).toBe('name.ilike."%say \\"hi\\" \\\\\\\\ bye%"')
})

test('best sort is accepted', () => {
  expect(parseDealsParams(new URLSearchParams('sort=best')).sort).toBe('best')
  expect(parseDealsParams(new URLSearchParams('sort=nope')).sort).toBe('discount')
})
