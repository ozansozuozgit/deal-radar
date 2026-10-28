import { expect, test } from 'vitest'
import { daysLeft, timeAgo } from '@/lib/dates'

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

test('timeAgo buckets', () => {
  expect(timeAgo('2026-10-28T11:59:40Z', now)).toBe('just now')
  expect(timeAgo('2026-10-28T11:15:00Z', now)).toBe('45m ago')
  expect(timeAgo('2026-10-28T09:00:00Z', now)).toBe('3h ago')
  expect(timeAgo('2026-10-26T12:00:00Z', now)).toBe('2d ago')
  expect(timeAgo('2026-10-28T13:00:00Z', now)).toBe('just now') // clock skew
  expect(timeAgo(null, now)).toBeNull()
})
