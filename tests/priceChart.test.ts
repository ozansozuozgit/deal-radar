import { expect, test } from 'vitest'
import { CHART, layoutChart, usualPackagePrice, wasCheaperNote } from '@/lib/priceChart'

// Lactaid at Fairway, 2026
const lactaid = [
  ['2026-07-23', 5.99], ['2026-07-30', 5.49], ['2026-08-06', 5.49], ['2026-08-27', 4.99],
  ['2026-09-10', 5.49], ['2026-09-24', 4.99], ['2026-10-22', 4.99], ['2026-10-29', 4.99],
].map(([d, p]) => ({ valid_from: `${d}T00:00:00+00:00`, price: p as number }))

test('sales sit at their real dates, so a three-week gap looks like one', () => {
  const { dots } = layoutChart(lactaid, null, null)
  const weekly = dots[1].x - dots[0].x
  expect(dots[3].x - dots[2].x).toBeCloseTo(weekly * 3, 5)
  expect(dots[0].x).toBe(CHART.left)
  expect(dots.at(-1)!.x).toBe(CHART.w - CHART.right)
})

test("the deal's own week is current, else the latest sale", () => {
  expect(layoutChart(lactaid, '2026-09-24T00:00:00+00:00', null).dots.findIndex(d => d.current)).toBe(5)
  expect(layoutChart(lactaid, '2026-11-05T00:00:00+00:00', null).dots.findIndex(d => d.current)).toBe(7)
  expect(layoutChart(lactaid, null, null).dots.filter(d => d.current)).toHaveLength(1)
})

test('cheaper is lower on the chart, and the usual line stretches the scale', () => {
  const { dots, usualY, min, max } = layoutChart(lactaid, null, 6.5)
  expect(dots[0].y).toBeLessThan(dots[3].y)
  expect(max).toBe(6.5)
  expect(min).toBe(4.99)
  expect(usualY).toBe(CHART.top)
})

test('first and last dates always, a middle one only with room', () => {
  expect(layoutChart(lactaid, null, null).dates.map(d => d.label)).toEqual(['Jul 23', 'Oct 29', 'Sep 10'])
  expect(layoutChart(lactaid.slice(0, 2), null, null).dates.map(d => d.label)).toEqual(['Jul 23', 'Jul 30'])
})

test('usual package price from the comparable median, only on the same basis and when plausible', () => {
  const deal = { price: 4.99, cmp_price: 1.25, cmp_basis: 'lb' }
  expect(usualPackagePrice(deal, { basis: 'lb', median: 1.34 })).toBe(5.35)
  expect(usualPackagePrice(deal, { basis: 'ea', median: 1.34 })).toBeNull()
  expect(usualPackagePrice(deal, { basis: 'lb', median: 0.2 })).toBeNull() // 0.80: a bad size parse somewhere
  expect(usualPackagePrice(deal, null)).toBeNull()
  expect(usualPackagePrice({ price: 4.99, cmp_price: null, cmp_basis: 'lb' }, { basis: 'lb', median: 1.34 })).toBeNull()
})

test('the usual-nearby label sits away from the current dot', () => {
  // Bartlett pears at Fairway: now $1.79 at the right end, usual nearby also $1.79
  const pears = [['2026-08-27', 1.49], ['2026-09-24', 1.49], ['2026-10-01', 1.99], ['2026-10-29', 1.79]]
    .map(([d, p]) => ({ valid_from: `${d}T00:00:00+00:00`, price: p as number }))
  expect(layoutChart(pears, '2026-10-29T00:00:00+00:00', 1.79).usualLabel).toEqual({ x: CHART.left, anchor: 'start' })
  expect(layoutChart(pears, '2026-08-27T00:00:00+00:00', 1.79).usualLabel).toEqual({ x: CHART.w - CHART.right, anchor: 'end' })
  expect(layoutChart(pears, null, null).usualLabel).toBeNull()
})

test('was-cheaper note: 15% or more above this store low, dated at the latest sale at that low', () => {
  const pears = [['2026-08-27', 1.49], ['2026-09-24', 1.49], ['2026-10-01', 1.99], ['2026-10-29', 1.79]]
    .map(([d, p]) => ({ valid_from: `${d}T00:00:00+00:00`, price: p as number }))
  expect(wasCheaperNote(pears, 1.79)).toBe('Was $1.49 here on Sep 24 (17% less)')
  expect(wasCheaperNote(pears, 1.69)).toBeNull()          // 13% above: not worth a warning
  expect(wasCheaperNote(pears.slice(1), 1.79)).toBeNull() // fewer than four sales
  expect(wasCheaperNote(lactaid, 4.99)).toBeNull()        // at its low
})
