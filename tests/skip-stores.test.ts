import { expect, test } from 'vitest'
import { skippedStores } from '@/config/stores'

test('C Town is skipped by default', () => {
  expect([...skippedStores(undefined)]).toEqual(['c-town'])
})

test('SKIP_STORES overrides the default, and empty means none', () => {
  expect([...skippedStores(' Aldi, lidl ,')]).toEqual(['aldi', 'lidl'])
  expect(skippedStores('').size).toBe(0)
})
