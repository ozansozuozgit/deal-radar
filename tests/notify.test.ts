import { expect, test } from 'vitest'
import { alertMessage, computeAlerts, dedupeKey, expandWatches, meetsTarget } from '@/lib/notify'

const deals = [
  { name: 'Chicken Breast', normalized_name: 'chicken breast', merchant_slug: 'aldi', merchant_name: 'Aldi', price: 1.99, source: 'flipp', external_id: '111' },
  { name: 'Chicken Breast Premium', normalized_name: 'chicken breast premium', merchant_slug: 'c-town', merchant_name: 'C Town', price: 4.99, source: 'flipp', external_id: '222' },
]

test('dedupeKey is stable', () => {
  expect(dedupeKey('milk', { source: 'flipp', external_id: '9' })).toBe('milk:flipp:9')
})

test('computeAlerts matches cheapest, respects max price and dedupe', () => {
  const watches = [
    { device_id: 'd1', term: 'chicken breast', max_price: null },
    { device_id: 'd2', term: 'chicken breast', max_price: 1.5 },   // too expensive → no alert
    { device_id: 'd3', term: 'caviar', max_price: null },           // no match
  ]
  const alerts = computeAlerts(watches, deals as never, new Set())
  expect(alerts).toHaveLength(1)
  expect(alerts[0]).toMatchObject({ deviceId: 'd1', dedupeKey: 'chicken breast:flipp:111' })

  const again = computeAlerts(watches, deals as never, new Set(['d1:chicken breast:flipp:111']))
  expect(again).toHaveLength(0)
})

test('target prices per lb and per item', () => {
  const d = { name: 'Chicken Breast 3 lb', normalized_name: 'chicken breast', merchant_slug: 'a', merchant_name: 'A', price: 6, size_qty: 3, size_unit: 'lb', source: 'flipp', external_id: '1' }
  expect(meetsTarget({ max_price: 2.5, price_basis: 'lb' }, d as never)).toBe(true)
  expect(meetsTarget({ max_price: 1.5, price_basis: 'lb' }, d as never)).toBe(false)
  expect(meetsTarget({ max_price: 5, price_basis: 'item' }, d as never)).toBe(false)
  expect(meetsTarget({ max_price: null }, d as never)).toBe(true)
})

test('list-owned watches fan out to every device on that list, once per device', () => {
  const subs = [
    { device_id: 'phone', subscription: {}, list_code: 'ABC123' },
    { device_id: 'laptop', subscription: {}, list_code: 'ABC123' },
    { device_id: 'other', subscription: {}, list_code: null },
  ]
  const watches = [
    { device_id: 'list:ABC123', term: 'chicken breast', max_price: null },
    { device_id: 'phone', term: 'chicken breast', max_price: null }, // legacy device watch, same term
    { device_id: 'gone', term: 'chicken breast', max_price: null },  // no subscription
  ]
  const expanded = expandWatches(watches, subs)
  expect(expanded.map(w => w.device_id).sort()).toEqual(['laptop', 'phone', 'phone'])
  const alerts = computeAlerts(expanded, deals as never, new Set())
  expect(alerts.map(a => a.deviceId).sort()).toEqual(['laptop', 'phone'])
})

test('alert messages deep-link to the deal', () => {
  const [a] = computeAlerts([{ device_id: 'd', term: 'chicken breast', max_price: null }],
    [{ ...deals[0], id: 42 }] as never, new Set())
  expect(alertMessage(a)).toMatchObject({ url: '/?deal=42', title: 'Chicken Breast — $1.99' })
})
