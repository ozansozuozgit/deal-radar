import { expect, test } from 'vitest'
import { assignItems, compareList, matchesForItem, pickFor, pricePerLb } from '@/lib/compare'

const deals = [
  { name: 'Boneless Chicken Breast', normalized_name: 'boneless chicken breast', merchant_slug: 'aldi', merchant_name: 'Aldi', price: 2.49 },
  { name: 'Chicken Breast Family Pack', normalized_name: 'chicken breast family pack', merchant_slug: 'c-town', merchant_name: 'C Town', price: 2.99 },
  { name: 'Whole Milk Gallon', normalized_name: 'whole milk gallon', merchant_slug: 'c-town', merchant_name: 'C Town', price: 3.49 },
  { name: 'Organic Whole Milk', normalized_name: 'organic whole milk', merchant_slug: 'wholefoods', merchant_name: 'Whole Foods', price: 4.99 },
  { name: 'Bananas', normalized_name: 'bananas', merchant_slug: 'aldi', merchant_name: 'Aldi', price: 0.49 },
  { name: 'Frozen Chicken Nuggets', normalized_name: 'frozen chicken nuggets', merchant_slug: 'aldi', merchant_name: 'Aldi', price: 5.99 },
] as never[]

test('matchesForItem finds relevant deals, cheapest first', () => {
  const m = matchesForItem('chicken breast', deals)
  expect(m.map(d => (d as { merchant_slug: string }).merchant_slug)).toEqual(['aldi', 'c-town'])
})

test('matchesForItem requires all meaningful tokens', () => {
  expect(matchesForItem('chicken breast', deals)).toHaveLength(2) // nuggets excluded
  expect(matchesForItem('oat milk', deals)).toHaveLength(0)       // 'oat' missing
})

test('compareList computes per-store totals and best plans', () => {
  const r = compareList(['chicken breast', 'whole milk', 'bananas'], deals)
  expect(r.items).toHaveLength(3)
  const aldi = r.stores.find(s => s.slug === 'aldi')!
  expect(aldi.matched).toBe(2)             // chicken + bananas
  expect(aldi.total).toBeCloseTo(2.98)
  const ctown = r.stores.find(s => s.slug === 'c-town')!
  expect(ctown.matched).toBe(2)            // chicken + milk
  expect(r.bestSingle!.slug).toBe('aldi')  // tie on matched, cheaper total
  expect(r.bestPair).toBeTruthy()
  expect(r.bestPair!.covered).toBe(3)      // aldi + c-town covers everything
})

const sized = [
  { id: 1, name: 'Chicken Breast', normalized_name: 'chicken breast', merchant_slug: 'aldi', merchant_name: 'Aldi', price: 2.49, original_price: 3.99, unit: 'lb' },
  { id: 2, name: 'Chicken Breast 3 lb bag', normalized_name: 'chicken breast bag', merchant_slug: 'c-town', merchant_name: 'C Town', price: 6, size_qty: 3, size_unit: 'lb' },
  { id: 3, name: 'Chicken Breast Dog Treats', normalized_name: 'chicken breast dog treats', merchant_slug: 'petco', merchant_name: 'Petco', price: 1.99 },
  { id: 4, name: 'Greek Yogurt 32 oz', normalized_name: 'greek yogurt', merchant_slug: 'aldi', merchant_name: 'Aldi', price: 4, size_qty: 32, size_unit: 'oz' },
]

test('pickFor scales per-lb deals and rounds packages up', () => {
  expect(pickFor(sized[0] as never, 2, 'lb')).toMatchObject({ cost: 4.98, regularCost: 7.98, packs: 2 })
  expect(pickFor(sized[1] as never, 2, 'lb')).toMatchObject({ cost: 6, packs: 1 })
  expect(pickFor(sized[1] as never, 4, 'lb')).toMatchObject({ cost: 12, packs: 2 })
  expect(pickFor(sized[3] as never, 2, null)).toMatchObject({ cost: 8, packs: 2 })
})

test('quantities change which store is cheapest', () => {
  const r = compareList([{ text: 'chicken breast', qty: 3, unit: 'lb', rejectedDealIds: [3] }], sized as never)
  expect(r.items[0].best!.merchant_slug).toBe('c-town') // $6 for 3 lb beats 3 × $2.49
  expect(r.items[0].matches.map(m => m.deal.id)).toEqual([2, 1])
})

test('pinned deals win, rejected ones disappear, savings add up', () => {
  const r = compareList([{ text: 'chicken breast', pinnedDealId: 1 }], sized as never)
  expect(r.items[0].best!.id).toBe(1)
  expect(r.cheapest).toEqual({ covered: 1, total: 2.49, savings: 1.5 })
  const rejected = compareList([{ text: 'chicken breast', rejectedDealIds: [1, 2, 3] }], sized as never)
  expect(rejected.items[0].best).toBeNull()
})

test('pricePerLb normalizes weights', () => {
  expect(pricePerLb({ price: 2.49, unit: 'lb' })).toBe(2.49)
  expect(pricePerLb({ price: 6, size_qty: 3, size_unit: 'lb' })).toBe(2)
  expect(pricePerLb({ price: 4, size_qty: 32, size_unit: 'oz' })).toBe(2)
  expect(pricePerLb({ price: 4, size_qty: 12, size_unit: 'ct' })).toBeNull()
})

test('assignItems follows the chosen stores', () => {
  const r = compareList(['chicken breast', 'greek yogurt'], sized as never)
  const a = assignItems(r, ['c-town'])
  expect(a.get('chicken breast')!.deal.id).toBe(2)
  expect(a.get('greek yogurt')).toBeNull()
  expect(assignItems(r, null).get('greek yogurt')!.deal.id).toBe(4)
})
