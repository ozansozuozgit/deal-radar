import { expect, test } from 'vitest'
import { pickForYou } from '@/lib/foryou'
import { digestMessage, isoWeek } from '@/lib/digest'
import { cycleText, verdictText } from '@/lib/priceCheck'
import { nearestBranches, placesToScan } from '@/lib/places'

const d = (id: number, name: string, price: number, extra = {}) => ({
  id, name, normalized_name: name.toLowerCase(), canonical: null, merchant_slug: 's', merchant_name: 'S', price, category: 'meat', ...extra,
})
const deals = [
  d(1, 'Chicken Breast', 2.99), d(2, 'Chicken Breast Value Pack', 2.49, { price_verdict: 'great' }),
  d(3, 'Chicken Breast Cutlets', 3.99), d(4, 'Salmon', 8.99), d(5, 'Ribeye Steak', 9.99, { price_verdict: 'great', discount_pct: 40 }),
  d(6, 'Broccoli', 1.5, { category: 'produce', price_verdict: 'great', discount_pct: 50 }),
]

test('list first, two per term, great prices first, then great deals in your categories', () => {
  const picks = pickForYou([{ term: 'salmon', reason: 'watch' }, { term: 'chicken breast', reason: 'list' }], deals, [], { greatCategories: ['meat'] })
  expect(picks.map(p => [p.deal.id, p.reason])).toEqual([[2, 'list'], [1, 'list'], [4, 'watch'], [5, 'great']])
})

test('hidden terms drop deals everywhere', () => {
  const picks = pickForYou([{ term: 'chicken breast', reason: 'list' }], deals, ['value pack', 'broccoli'])
  expect(picks.map(p => p.deal.id)).toEqual([1, 3, 5])
})

test('digest message reads well', () => {
  const picks = pickForYou([{ term: 'chicken breast', reason: 'list' }], deals, [], { greatCategories: ['meat'] }) as never
  expect(digestMessage(picks, { store: 'Key Food', total: 38.2, savings: 11, covered: 5, of: 6 })).toEqual({
    title: '🗞️ This week’s deals are in',
    body: '2 deals on things you buy · your list: $38.20 at Key Food (save $11.00) · great price: Chicken Breast Value Pack $2.49 at S',
    url: '/?foryou=1',
  })
  expect(digestMessage([], null)).toBeNull()
})

test('isoWeek', () => {
  expect(isoWeek(new Date(2026, 9, 28))).toBe('2026-W44')
  expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53')
})

const stats = { canonical: 'chicken breast', basis: 'lb', median: 3.49, p25: 2.49, low: 1.99, samples: 20, stores: 5, cycle_days: 28, last_sale: '2026-10-07T00:00:00Z' }

test('price check text', () => {
  expect(verdictText('great', 1.99, stats)).toContain('usually $3.49/lb; this is $1.99/lb')
  expect(verdictText('weak', 4.29, stats)).toContain('worth waiting')
  expect(verdictText(null, 1.99, stats)).toBeNull()
  expect(cycleText(stats, +new Date('2026-10-28T00:00:00Z'))).toBe('Goes on sale about every 4 weeks; last sale 3 weeks ago')
})

test('places: nearest branch per chain, distinct places to scan', () => {
  const near = nearestBranches({ lat: 40.75, lng: -73.99 }, [
    { slug: 'aldi', lat: 40.80, lng: -73.99 }, { slug: 'aldi', lat: 40.751, lng: -73.99 }, { slug: 'key', lat: 40.76, lng: -73.99 },
  ])
  expect(near.get('aldi')!.lat).toBe(40.751)
  expect(near.get('key')!.miles).toBeCloseTo(0.69, 1)
  const home = { lat: 40.75, lng: -73.99 }
  expect(placesToScan([
    { lat: 40.751, lng: -73.99, zip: '10001' },   // same as home
    { lat: 40.70, lng: -74.01, zip: '10004' },
    { lat: 40.701, lng: -74.01, zip: '10004' },  // duplicate of the previous one
  ], home)).toHaveLength(1)
})
