import { expect, test } from 'vitest'
import { basisLabel, bestPriceByStore, prefilterTerm, unitPriceOf, type BestDeal } from '@/lib/bestPrice'

let id = 0
const deal = (p: Partial<BestDeal> & { name: string; merchant_slug: string; price: number }): BestDeal => ({
  id: ++id, normalized_name: p.name.toLowerCase(), merchant_name: p.merchant_slug.toUpperCase(), ...p,
})

const chicken = [
  deal({ name: 'Boneless Chicken Breast', merchant_slug: 'netcost', price: 2.99, unit: 'lb' }),
  deal({ name: 'Chicken Breast Value Pack', merchant_slug: 'netcost', price: 2.49, unit: 'lb' }),
  deal({ name: 'Organic Chicken Breasts 3 lb', merchant_slug: 'fairway', price: 6, size_qty: 3, size_unit: 'lb' }),
  deal({ name: 'Chicken Breast', merchant_slug: 'wholefoods', price: 4.99, unit: 'lb', cmp_price: 4.99, cmp_basis: 'lb' }),
  deal({ name: 'Chicken Breast Dog Treats', merchant_slug: 'amazon', price: 1.99, canonical: 'dog treats' }),
  deal({ name: 'Grilled Chicken Breast Strips 6 ct', merchant_slug: 'amazon', price: 5.99, size_qty: 6, size_unit: 'ct' }),
  deal({ name: 'Chicken Thighs', merchant_slug: 'netcost', price: 1.29, unit: 'lb' }),
]

test('the cheapest store per pound comes first, one row per store', () => {
  const r = bestPriceByStore('chicken breast', chicken)
  expect(r.basis).toBe('lb')
  expect(r.stores.map(s => s.slug)).toEqual(['fairway', 'netcost', 'wholefoods'])
  expect(r.stores[0].unitPrice).toBe(2)          // $6 for 3 lb
  expect(r.stores[0].vsBest).toBe(0)
  expect(r.stores[1].deal.name).toBe('Chicken Breast Value Pack') // NetCost's cheaper of two
  expect(r.stores[1].others).toBe(1)
  expect(r.stores[1].vsBest).toBe(0.49)
  expect(r.stores[2].vsBest).toBe(2.99)
})

test('matches sold another way are kept aside, and other products are left out', () => {
  const r = bestPriceByStore('chicken breast', chicken)
  expect(r.otherBasis.map(d => d.name)).toEqual(['Grilled Chicken Breast Strips 6 ct'])
  expect(JSON.stringify(r)).not.toContain('Dog Treats')
  expect(JSON.stringify(r)).not.toContain('Thighs')
})

test('excluded deals (hidden products) never win a store', () => {
  const r = bestPriceByStore('chicken breast', chicken, d => d.name.includes('Value Pack'))
  expect(r.stores.find(s => s.slug === 'netcost')!.deal.name).toBe('Boneless Chicken Breast')
})

test('compares on what most stores sell by', () => {
  const eggs = [
    deal({ name: 'Large Eggs 12 ct', merchant_slug: 'a', price: 3.6, size_qty: 12, size_unit: 'ct' }),
    deal({ name: 'Large Eggs 18 ct', merchant_slug: 'b', price: 4.5, size_qty: 18, size_unit: 'ct' }),
    deal({ name: 'Eggs', merchant_slug: 'c', price: 2.99 }),
  ]
  const r = bestPriceByStore('eggs', eggs)
  expect(r.basis).toBe('ct')
  expect(r.stores.map(s => [s.slug, s.unitPrice])).toEqual([['b', 0.25], ['a', 0.3]])
  expect(r.otherBasis).toHaveLength(1)
})

test('nothing matching means no stores', () => {
  expect(bestPriceByStore('oat milk', chicken)).toEqual({ basis: null, stores: [], otherBasis: [] })
  expect(bestPriceByStore('', chicken).stores).toEqual([])
})

test('unit prices from ounces and liquids', () => {
  expect(unitPriceOf(deal({ name: 'x', merchant_slug: 'a', price: 4, size_qty: 8, size_unit: 'oz' }))).toEqual({ price: 8, basis: 'lb' })
  expect(unitPriceOf(deal({ name: 'x', merchant_slug: 'a', price: 2, size_qty: 64, size_unit: 'floz' }))).toEqual({ price: 4, basis: 'gal' })
  expect(unitPriceOf(deal({ name: 'x', merchant_slug: 'a', price: 3 }))).toEqual({ price: 3, basis: 'ea' })
})

test('labels and the database prefilter', () => {
  expect(basisLabel('lb')).toBe('/lb')
  expect(basisLabel('ct')).toBe(' each')
  expect(prefilterTerm('Chicken Breasts')).toBe('chicken')
  expect(prefilterTerm('tomatoes')).toBe('tomato')
  expect(prefilterTerm('ground beef')).toBe('ground')
  expect(prefilterTerm('organic beef')).toBe('beef')   // the matcher ignores 'organic'
  expect(prefilterTerm('fresh organic')).toBeNull()
  expect(prefilterTerm('!!')).toBeNull()
})
