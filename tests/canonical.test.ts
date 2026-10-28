import { expect, test } from 'vitest'
import { canonicalize } from '@/lib/parse/canonical'
import { cleanAnswers } from '@/lib/ingest/canonical'
import { matchesForItem } from '@/lib/compare'
import { comparablePrice } from '@/lib/ingest/upsert'

test.each([
  ['Perdue Boneless Skinless Chicken Breasts Family Pack', 'chicken breast'],
  ['Chicken Breast Tenderloins', 'chicken breast'],
  ['80% Lean Ground Chuck', 'ground beef'],
  ['hamburger meat', 'ground beef'],
  ['Chicken Breast Dog Treats', 'pet food'],
  ['Prego Pasta Sauce 24 oz', 'pasta sauce'],
  ['Barilla Penne', 'pasta'],
  ['Sweet Potatoes', 'sweet potatoes'],
  ['Russet Potatoes 5 lb bag', 'potatoes'],
  ['Dawn Dish Detergent', 'dish soap'],
  ['Tide Laundry Detergent', 'laundry detergent'],
  ['Mission Tortilla Chips', 'chips'],
  ['Garlic Bread', 'bread'],
  ['Oscar Mayer Hot Dogs', 'hot dogs'],
  ['Atlantic Salmon Steaks', 'salmon'],
  ['Large White Eggs 12 ct', 'eggs'],
  ['Egg Noodles', null],
  ['Skippy Peanut Butter', 'peanut butter'],
  ['Land O Lakes Butter', 'butter'],
  ['Tropicana Orange Juice', 'orange juice'],
  ['Navel Oranges', 'oranges'],
  ['DiGiorno Pepperoni Pizza', 'frozen pizza'],
  ['Chobani Greek Yogurt', 'greek yogurt'],
  ['Mystery Gadget', null],
])('canonicalize(%s) = %s', (name, canon) => {
  expect(canonicalize(name)).toBe(canon)
})

test('cleanAnswers keeps asked names only, short and lowercase', () => {
  const out = cleanAnswers(['a', 'b', 'c'], { a: 'Chicken Breast!', b: null, z: 'x', c: 'x'.repeat(60) })
  expect([...out]).toEqual([['a', 'chicken breast'], ['b', null], ['c', null]])
})

const deals = [
  { id: 1, name: 'Ground Chuck 80/20', normalized_name: 'ground chuck 80/20', canonical: 'ground beef', merchant_slug: 'a', merchant_name: 'A', price: 4.99 },
  { id: 2, name: 'Chicken Breast Dog Treats', normalized_name: 'chicken breast dog treats', canonical: 'pet food', merchant_slug: 'a', merchant_name: 'A', price: 1.99 },
  { id: 3, name: 'Chicken Breast', normalized_name: 'chicken breast', canonical: 'chicken breast', merchant_slug: 'b', merchant_name: 'B', price: 2.99 },
  { id: 4, name: 'Mozzarella Shreds', normalized_name: 'mozzarella shreds', canonical: 'shredded cheese', merchant_slug: 'b', merchant_name: 'B', price: 3 },
]

test('synonyms match through the canonical product', () => {
  expect(matchesForItem('hamburger meat', deals).map(d => d.id)).toEqual([1])
  expect(matchesForItem('ground beef', deals).map(d => d.id)).toEqual([1])
})

test('a different known product that mentions the words is not a match', () => {
  expect(matchesForItem('chicken breast', deals).map(d => d.id)).toEqual([3])
})

test('a general item matches more specific canonical products', () => {
  expect(matchesForItem('cheese', deals).map(d => d.id)).toEqual([4])
})

test('comparablePrice normalizes to per lb or per count', () => {
  expect(comparablePrice(6, { qty: 3, unit: 'lb' })).toEqual({ cmp_price: 2, cmp_basis: 'lb' })
  expect(comparablePrice(4, { qty: 32, unit: 'oz' })).toEqual({ cmp_price: 2, cmp_basis: 'lb' })
  expect(comparablePrice(3, { qty: 12, unit: 'ct' })).toEqual({ cmp_price: 0.25, cmp_basis: 'ct' })
  expect(comparablePrice(3, null)).toEqual({ cmp_price: 3, cmp_basis: 'ea' })
  expect(comparablePrice(null, null)).toEqual({ cmp_price: null, cmp_basis: null })
})

test('a specific product does not match its generic neighbour', () => {
  const pasta = [{ id: 1, name: 'Barilla Penne', normalized_name: 'barilla penne', canonical: 'pasta' }]
  expect(matchesForItem('pasta sauce', pasta as never)).toEqual([])
})
