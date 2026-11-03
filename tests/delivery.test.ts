import { expect, test } from 'vitest'
import { whereLabel } from '@/lib/stores/delivery'

test('a delivery store says so, whatever its distance', () => {
  expect(whereLabel('netcost', null)).toBe(' · delivery')
  expect(whereLabel('netcost', 3)).toBe(' · delivery')
})

test('other stores show their distance, or nothing', () => {
  expect(whereLabel('fairway', 0.4)).toBe(' · 0.4 mi')
  expect(whereLabel('fairway', null)).toBe('')
})
