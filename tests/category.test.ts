import { expect, test } from 'vitest'
import { categorize } from '@/lib/parse/category'

test.each([
  ['Organic Blueberries', 'produce'], ['Yellow Peaches', 'produce'], ['Hass Avocados', 'produce'],
  ['Organic Ground Turkey Tray Pack', 'meat'], ['Pork or Chicken Sausage', 'meat'],
  ['Fresh Atlantic Salmon Fillets', 'seafood'], ['Fresh Halibut', 'seafood'],
  ['Chobani Greek Yogurts', 'dairy'], ['Whole Milk', 'dairy'], ['Shredded Cheese', 'dairy'],
  ['Italian Bread', 'bakery'],
  ['Outshine Fruit Bars', 'frozen'], ['Frozen Vegetables', 'frozen'], ['Ice Cream', 'frozen'],
  ['Pepsi Soda 2-Liter', 'beverages'], ['Goya Malta', 'beverages'], ['Orange Juice', 'beverages'],
  ['Ragú Pasta Sauce', 'pantry'], ['Canned Beans', 'pantry'],
  ["Lay's Potato Chips", 'snacks'],
  ['Bounty Paper Towels', 'household'], ['Tide Detergent', 'household'],
  ['Colgate Toothpaste', 'personal-care'],
  ['Vivitar Digital Camera', 'other'],
])('categorize(%s) -> %s', (name, expected) => {
  expect(categorize(name)).toBe(expected)
})

test('chocolate is not cola', () => {
  expect(categorize('Chocolate Covered Biscuits')).toBe('snacks')
  expect(categorize('Coca Cola 12 pack')).toBe('beverages')
})
