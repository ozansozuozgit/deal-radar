import { expect, test } from 'vitest'
import { excludeSkipped, skippedStores } from '@/config/stores'

test('C Town is skipped by default', () => {
  expect([...skippedStores(undefined)]).toEqual(['c-town'])
})

test('SKIP_STORES overrides the default, and empty means none', () => {
  expect([...skippedStores(' Aldi, lidl ,')]).toEqual(['aldi', 'lidl'])
  expect(skippedStores('').size).toBe(0)
})

test('excludeSkipped adds a not-in filter on merchant_slug, or nothing when none are skipped', () => {
  const calls: unknown[][] = []
  const q = { not(...a: unknown[]) { calls.push(a); return q } }
  const prev = process.env.SKIP_STORES
  try {
    delete process.env.SKIP_STORES
    expect(excludeSkipped(q)).toBe(q)
    expect(calls).toEqual([['merchant_slug', 'in', '("c-town")']])
    process.env.SKIP_STORES = ''
    excludeSkipped(q)
    expect(calls).toHaveLength(1)
  } finally {
    if (prev === undefined) delete process.env.SKIP_STORES
    else process.env.SKIP_STORES = prev
  }
})
