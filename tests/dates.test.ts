import { expect, test } from 'vitest'
import { daysLeft } from '@/lib/dates'

const now = Date.parse('2026-10-28T12:00:00Z')

test('counts whole days remaining, rounding up', () => {
  expect(daysLeft('2026-10-30T12:00:00Z', now)).toBe(2)
  expect(daysLeft('2026-10-29T00:00:00Z', now)).toBe(1)
})

test('clamps past dates to 0', () => {
  expect(daysLeft('2026-10-27T00:00:00Z', now)).toBe(0)
})

test('null for missing or unparseable dates', () => {
  expect(daysLeft(null, now)).toBeNull()
  expect(daysLeft(undefined, now)).toBeNull()
  expect(daysLeft('not a date', now)).toBeNull()
})
