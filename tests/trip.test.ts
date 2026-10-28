import { expect, test } from 'vitest'
import { compareList } from '@/lib/compare'
import { tripOptions, walkingRoute } from '@/lib/trip'

const home = { lat: 40.75, lng: -73.99 }
// near: ~0.07 mi away; far: ~2 mi away
const locations = new Map([
  ['near', { lat: 40.751, lng: -73.99 }],
  ['far', { lat: 40.78, lng: -73.99 }],
])
const deals = [
  { id: 1, name: 'Milk', normalized_name: 'milk', merchant_slug: 'near', merchant_name: 'Near Mart', price: 4 },
  { id: 2, name: 'Milk', normalized_name: 'milk', merchant_slug: 'far', merchant_name: 'Far Foods', price: 3.5 },
  { id: 3, name: 'Eggs', normalized_name: 'egg', merchant_slug: 'near', merchant_name: 'Near Mart', price: 3 },
  { id: 4, name: 'Eggs', normalized_name: 'egg', merchant_slug: 'far', merchant_name: 'Far Foods', price: 2.75 },
]

test('walkingRoute is a round trip', () => {
  const r = walkingRoute(home, [{ slug: 'far', ...locations.get('far')! }, { slug: 'near', ...locations.get('near')! }])
  expect(r.order).toEqual(['near', 'far'])
  expect(r.miles).toBeGreaterThan(4) // ~2 mi each way, with the detour factor
})

test('a slightly cheaper store far away loses once walking counts', () => {
  const r = compareList(['milk', 'eggs'], deals as never)
  const opts = tripOptions(r, locations, home)
  const rec = opts.find(o => o.recommended)!
  expect(rec.slugs).toEqual(['near'])
  const far = opts.find(o => o.slugs?.[0] === 'far' && o.slugs.length === 1)!
  expect(far.total).toBeLessThan(rec.total)
  expect(far.walkMinutes!).toBeGreaterThan(rec.walkMinutes!)
})

test('without locations, price alone decides', () => {
  const r = compareList(['milk', 'eggs'], deals as never)
  const rec = tripOptions(r, new Map(), home).find(o => o.recommended)!
  expect(rec.walkMinutes).toBeNull()
  expect(rec.total).toBe(6.25)
})
