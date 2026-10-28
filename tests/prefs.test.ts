import { expect, test } from 'vitest'
import { parsePrefs } from '@/lib/client/prefs'

const good = { address: '1 Main St', lat: 40.7, lng: -73.9, zip: '10001', radiusMiles: 2, enabledStores: ['aldi'] }

test('accepts well-formed prefs', () => {
  expect(parsePrefs(good)).toEqual(good)
})

test('rejects anything without usable coordinates', () => {
  for (const bad of [null, 'x', 42, [], {}, { ...good, lat: '40' }, { ...good, lng: NaN }, { ...good, lat: 999 }]) {
    expect(parsePrefs(bad)).toBeNull()
  }
})

test('repairs the rest with safe defaults', () => {
  expect(parsePrefs({ lat: 1, lng: 2, radiusMiles: -3, enabledStores: [1, 2] })).toEqual({
    address: 'My location', lat: 1, lng: 2, zip: '', radiusMiles: 1.5, enabledStores: null,
  })
  expect(parsePrefs({ ...good, enabledStores: [] })?.enabledStores).toBeNull()
})
