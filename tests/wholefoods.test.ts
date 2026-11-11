import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { parseWholeFoodsText, wfToDeals } from '@/lib/sources/wholefoods-parse'

const text = readFileSync('fixtures/wholefoods-sample.txt', 'utf8')

test('parses all deal blocks across both marker styles', () => {
  const deals = parseWholeFoodsText(text)
  expect(deals.map(d => d.name)).toEqual([
    'Blueberries, 18 oz',
    'Red Cherries',
    'Yellow Peaches',
    'Fresh Halibut Fillets',
    'No-Antibiotics-Ever Made-in-House Pork or Chicken Sausage',
    'Organic Ground Turkey Tray Pack',
    'Medium Hass Avocados',
  ])
  expect(deals[0]).toEqual({
    name: 'Blueberries, 18 oz', brand: 'Organic',
    primeText: '$5.99 ea', nonPrimeText: '$6.66 ea', regularText: '$7.99', expiry: '07/28',
  })
  const halibut = deals.find(d => d.name.includes('Halibut'))!
  expect(halibut.primeText).toBe('20% off')
  expect(halibut.nonPrimeText).toBe('11% off')
  expect(halibut.regularText).toBe('$34.99/lb')
  const avocado = deals.find(d => d.name.includes('Avocados'))!
  expect(avocado.primeText).toBe('4 for $5')
  expect(avocado.expiry).toBe('07/28')  // Exp.-style marker
  const sausage = deals.find(d => d.name.includes('Sausage'))!
  expect(sausage.brand).toBeNull()      // block without its own marker
})

test('hero banner with inline "with Prime" is not a deal', () => {
  const deals = parseWholeFoodsText(text)
  expect(deals.some(d => /nectarine/i.test(d.name))).toBe(false)
  expect(deals.some(d => /shop all deals/i.test(d.name))).toBe(false)
})

test('wfToDeals converts to DealInput', () => {
  const deals = wfToDeals(parseWholeFoodsText(text), 10518, '2026-07-27T00:00:00-04:00')
  const blueberries = deals.find(d => d.name.startsWith('Blueberries'))!
  expect(blueberries.primePrice).toBe(5.99)
  expect(blueberries.price).toBe(6.66)
  expect(blueberries.originalPrice).toBe(7.99)
  expect(blueberries.unit).toBe('ea')
  expect(blueberries.category).toBe('produce')
  expect(blueberries.validTo).toContain('2026-07-28')
  expect(blueberries.source).toBe('wholefoods')
  const halibut = deals.find(d => d.name.includes('Halibut'))!
  expect(halibut.price).toBeNull()
  expect(halibut.saleStory).toBe('11% off (20% off with Prime)')
})

test('merges the sales page with its View All pages without repeating a deal', async () => {
  const { mergeWfRaw } = await import('@/lib/sources/wholefoods-parse')
  const preview = parseWholeFoodsText(text)
  const fullList = [...preview.slice(2), { ...preview[0], name: 'Organic Strawberries, 16 oz' }]
  const merged = mergeWfRaw(preview, fullList)
  expect(merged).toHaveLength(preview.length + 1)
  expect(merged.filter(d => d.name === 'Red Cherries')).toHaveLength(1)
})

test('keeps two brands with the same product name and promotion', async () => {
  const { mergeWfRaw } = await import('@/lib/sources/wholefoods-parse')
  const milk = { name: 'Organic Whole Milk, 64 fl oz', brand: 'Horizon', primeText: '20% off', nonPrimeText: '11% off', regularText: null, expiry: '11/18' }
  expect(mergeWfRaw([milk, { ...milk, brand: 'Straus' }], [milk])).toHaveLength(2)
})
