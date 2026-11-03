import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { dealRow } from '@/lib/ingest/upsert'
import { mapNetcostImport, mapNetcostSpecial, netcostBookmarklet, netcostSize, packCount, type NetcostSpecial } from '@/lib/sources/netcost'

const packaged: NetcostSpecial = {
  id: 12496293, name: 'Pepper Kabanosy (Pork) - 120g', tag: 'Only $3.99',
  start: '2026-10-29T00:00:00.000Z', end: '2026-11-25T23:59:59.000Z',
  sale: 3.99, regular: 4.79, weighable: false, weight: 4.23, unit: 'Oz', department: 'MEAT SMOKED',
  image: "https://cdn.example/1265/1/2/{{size}}.{{extension||'jpg'}}",
}
const weighed: NetcostSpecial = {
  ...packaged, id: 2, name: 'Cold Smoked Baby Salmon', tag: 'Only $11.49/Lb', sale: 11.49, regular: 12.99,
  weighable: true, weight: null, unit: null, department: 'FISH SMOKED',
}

test('a packaged special becomes a deal with sale and regular prices', () => {
  expect(mapNetcostSpecial(packaged)).toMatchObject({
    source: 'netcost', externalId: '12496293', merchantSlug: 'netcost', name: 'Pepper Kabanosy (Pork) - 120g',
    price: 3.99, originalPrice: 4.79, unit: null, category: 'meat', size: { qty: 4.23, unit: 'oz' },
    imageUrl: 'https://cdn.example/1265/1/2/medium.jpg',
    validFrom: packaged.start, validTo: packaged.end,
  })
})

test('a weighed special is priced per lb', () => {
  const deal = mapNetcostSpecial(weighed)!
  expect(deal).toMatchObject({ price: 11.49, originalPrice: 12.99, unit: 'lb', category: 'seafood' })
  expect(dealRow(deal, 1)).toMatchObject({ cmp_price: 11.49, cmp_basis: 'lb', size_unit: 'lb', size_qty: 1 })
})

test('the price falls back to the tag when the sale field is missing', () => {
  expect(mapNetcostSpecial({ ...weighed, sale: null })?.price).toBe(11.49)
})

test('a regular price at or below the sale price is not a discount', () => {
  expect(mapNetcostSpecial({ ...packaged, regular: 3.99 })?.originalPrice).toBeNull()
})

test('package sizes convert to the units the app compares', () => {
  expect(netcostSize({ name: 'x', weight: 900, unit: 'gram' })).toEqual({ qty: 31.747, unit: 'oz' })
  expect(netcostSize({ name: 'x', weight: 48, unit: 'fl oz' })).toEqual({ qty: 48, unit: 'floz' })
  expect(netcostSize({ name: 'x', weight: 1, unit: 'Gallon' })).toEqual({ qty: 128, unit: 'floz' })
  expect(netcostSize({ name: 'x', weight: 1, unit: 'quart' })).toEqual({ qty: 32, unit: 'floz' })
  expect(netcostSize({ name: 'x', weight: 1, unit: 'Liter' })).toEqual({ qty: 1, unit: 'l' })
  expect(netcostSize({ name: 'x', weight: 5, unit: 'lb' })).toEqual({ qty: 5, unit: 'lb' })
  expect(netcostSize({ name: 'x', weight: 24, unit: 'ct' })).toEqual({ qty: 24, unit: 'ct' })
})

test('with no store size, grams in the name still count', () => {
  expect(netcostSize({ name: 'Crunchy Chocolate Chip Cookies - 351g', weight: null, unit: null })).toEqual({ qty: 12.381, unit: 'oz' })
  expect(netcostSize({ name: 'Butter Me-Up No-Stick Cooking Spray', weight: null, unit: null })).toBeNull()
})

test("the store's size wins over a per-box size in the name", () => {
  const deal = mapNetcostSpecial({ ...packaged, name: '177ml Organic Juice Drink', sale: 3.99, weight: 48, unit: 'fl oz' })!
  expect(dealRow(deal, 1)).toMatchObject({ size_qty: 48, size_unit: 'floz', cmp_basis: 'gal', cmp_price: 10.64 })
})

test('grocery falls back to the name, then to pantry', () => {
  expect(mapNetcostSpecial({ ...packaged, name: 'Dark Kvas Drink', department: 'GROCERY' })?.category).toBe('beverages')
  expect(mapNetcostSpecial({ ...packaged, name: 'Delicje', department: 'GROCERY' })?.category).toBe('pantry')
})

test('unreadable specials are skipped and counted; the flyer spans the deals', () => {
  const { flyer, deals, skipped } = mapNetcostImport([
    packaged,
    { ...weighed, end: '2026-12-31T23:59:59.000Z', start: '2026-09-15T00:00:00.000Z' },
    { ...packaged, id: 3, sale: null, tag: null },
    { ...packaged, id: 4, name: '' },
  ])
  expect(deals).toHaveLength(2)
  expect(skipped).toBe(2)
  expect(flyer).toMatchObject({ source: 'netcost', merchantSlug: 'netcost', validFrom: '2026-09-15T00:00:00.000Z', validTo: '2026-12-31T23:59:59.000Z' })
})

test('the bookmark is valid javascript that posts to the given address', () => {
  const href = netcostBookmarklet('https://site.example/api/import/netcost', 'k"ey')
  expect(href.startsWith('javascript:')).toBe(true)
  const code = decodeURIComponent(href.slice('javascript:'.length))
  expect(() => new Function(code)).not.toThrow()
  expect(code).toContain('"https://site.example/api/import/netcost"')
  expect(code).toContain('"k\\"ey"')
})

// made-up products, shaped like the real feed: each kind of size it uses, and its odd price values
const sample: NetcostSpecial[] = JSON.parse(readFileSync('fixtures/netcost-specials-sample.json', 'utf8'))
const rowFor = (name: string) => {
  const special = sample.find(s => s.name === name)!
  return dealRow(mapNetcostSpecial(special)!, 1)
}

test('every sample becomes a deal, with its sale price matching the advertised one', () => {
  const { deals, skipped } = mapNetcostImport(sample)
  expect(skipped).toBe(0)
  for (const s of sample) {
    const deal = deals.find(d => d.externalId === String(s.id))!
    expect(deal.price).toBe(Number(/\$([\d.]+)/.exec(s.tag!)![1]))
    expect(deal.imageUrl).not.toContain('{{')
  }
})

test('samples compare by the right basis', () => {
  expect(rowFor('Malt Beverage - 2L')).toMatchObject({ price: 2.49, cmp_basis: 'gal', cmp_price: 4.71 })
  expect(rowFor('2% Milk - 1.89L')).toMatchObject({ size_qty: 64, size_unit: 'floz', cmp_basis: 'gal', cmp_price: 11.98 })
  expect(rowFor('Chicken Breast')).toMatchObject({ price: 1.99, unit: 'lb', cmp_basis: 'lb', cmp_price: 1.99 })
  expect(rowFor('Currant Preserves')).toMatchObject({ unit: null, cmp_basis: 'lb', cmp_price: 5.8 })
  expect(rowFor('Seeded Bread')).toMatchObject({ size_unit: 'oz', cmp_basis: 'lb', cmp_price: 3.3 })
  expect(rowFor('Avocado - 1pc')).toMatchObject({ cmp_basis: 'ct', cmp_price: 0.79 })
  expect(rowFor('2-88 Jumbo Shells')).toMatchObject({ size_qty: null, cmp_basis: 'ea', cmp_price: 3.99 })
})

test('multipacks are counted from the name', () => {
  for (const [name, count] of [
    ['Roasted Seaweed 6 ct', 6], ['Juice Drink 8pk - 1.4L', 8], ['Lager Beer 4-Pack - 500mL Cans', 4],
    ['Classic Lager - 12 Bottles', 12], ['Juice Drink - 8 Boxes', 8], ['Pudding Cups - 6x113g', 6],
    ['6 Banana & 6 Strawberry Smoothies', 12], ['6 Mixed Berry and 6 Strawberry Smoothies', 12], ['Green Tea 15 ct', 15],
  ] as const) expect(packCount(name), name).toBe(count)
  for (const name of ['Shredded Cheese 1 pk', '6 Mini Wafer Cakes - 180g', '24 Clear Spoons', 'Milk - 1.89L', 'Bread']) {
    expect(packCount(name), name).toBeNull()
  }
})

test('a multipack compares per item, not by one item\'s weight', () => {
  const pack = (name: string, weight: number, unit: string) => dealRow(mapNetcostSpecial({ ...packaged, name, sale: 5.99, weight, unit })!, 1)
  expect(pack('Roasted Seaweed 6 ct', 0.17, 'Oz')).toMatchObject({ size_qty: 6, size_unit: 'ct', cmp_basis: 'ct', cmp_price: 1 })
  expect(pack('6 Banana & 6 Strawberry Smoothies', 3.1, 'fl oz')).toMatchObject({ size_qty: 12, cmp_basis: 'ct', cmp_price: 0.5 })
})

test('a count in a name without a pack word still uses the package weight', () => {
  expect(netcostSize({ name: '6 Mini Wafer Cakes - 180g', weight: 6.35, unit: 'Oz' })).toEqual({ qty: 6.35, unit: 'oz' })
})

test('milliliters and packs convert too', () => {
  expect(netcostSize({ name: 'x', weight: 500, unit: 'ml' })).toEqual({ qty: 0.5, unit: 'l' })
  expect(netcostSize({ name: 'x', weight: 10, unit: 'pack' })).toEqual({ qty: 10, unit: 'ct' })
})

test("the store's ounces stay weight, even when the name matches a liquid product", () => {
  const row = dealRow(mapNetcostSpecial({ ...packaged, name: 'Traditional Water Crackers', sale: 3.49, weight: 4, unit: 'Oz' })!, 1)
  expect(row).toMatchObject({ canonical: 'water', size_unit: 'oz', cmp_basis: 'lb', cmp_price: 13.96 })
})
