import { expect, test } from 'vitest'
import { daysLeft, hoursSince, shortDate, staleAge, timeAgo } from '@/lib/dates'

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

test('hoursSince', () => {
  expect(hoursSince('2026-10-27T00:00:00Z', now)).toBe(36)
  expect(hoursSince(null, now)).toBeNull()
})

test('shortDate reads flyer days in UTC and adds the year only when it differs', () => {
  const now = Date.parse('2026-11-02T12:00:00Z')
  expect(shortDate('2026-07-24T04:00:00+00:00', now)).toBe('Jul 24') // Flipp: midnight ET
  expect(shortDate('2026-07-30T00:00:00+00:00', now)).toBe('Jul 30') // Fairway: midnight UTC
  expect(shortDate('2025-12-30T05:00:00+00:00', now)).toBe('Dec 30, 2025')
  expect(shortDate(null, now)).toBeNull()
  expect(shortDate('nope', now)).toBeNull()
})

test('staleAge stays quiet for prices seen in the last two days', () => {
  expect(staleAge('2026-10-27T13:00:00Z', now)).toBeNull()
  expect(staleAge(null, now)).toBeNull()
  expect(staleAge('2026-10-25T12:00:00Z', now)).toBe('3d ago')
})
