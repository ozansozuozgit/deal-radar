import { expect, test } from 'vitest'
import { isDeliveryStore, myStores, nextDeliveryOff, whereLabel } from '@/lib/stores/delivery'

test('a delivery store says so, whatever its distance', () => {
  expect(whereLabel('netcost', null)).toBe(' · delivery')
  expect(whereLabel('netcost', 3)).toBe(' · delivery')
})

test('other stores show their distance, or nothing', () => {
  expect(whereLabel('fairway', 0.4)).toBe(' · 0.4 mi')
  expect(whereLabel('fairway', null)).toBe('')
})

const stores = ['fairway', 'c-town', 'netcost'].map(slug => ({ slug }))
const slugs = (list: Array<{ slug: string }>) => list.map(s => s.slug)

test('saved picks made before a delivery store existed still include it', () => {
  expect(slugs(myStores(stores, ['fairway']))).toEqual(['fairway', 'netcost'])
})

test('a delivery store you unticked stays off', () => {
  expect(slugs(myStores(stores, ['fairway'], ['netcost']))).toEqual(['fairway'])
  expect(slugs(myStores(stores, null, ['netcost']))).toEqual(['fairway', 'c-town'])
})

test('other stores you did not pick stay off, and no picks means all', () => {
  expect(slugs(myStores(stores, ['c-town']))).not.toContain('fairway')
  expect(slugs(myStores(stores, null))).toEqual(['fairway', 'c-town', 'netcost'])
})

test('picks that match nothing here fall back to all', () => {
  expect(slugs(myStores(stores, ['elsewhere'], ['netcost']))).toEqual(['fairway', 'c-town', 'netcost'])
})

test('unticking and re-ticking a delivery store is remembered; other stores change nothing', () => {
  expect(nextDeliveryOff('netcost', ['fairway'])).toEqual(['netcost'])
  expect(nextDeliveryOff('netcost', ['fairway', 'netcost'], ['netcost'])).toEqual([])
  expect(nextDeliveryOff('fairway', ['c-town'], ['netcost'])).toEqual(['netcost'])
  expect(isDeliveryStore('netcost')).toBe(true)
  expect(isDeliveryStore('fairway')).toBe(false)
})
