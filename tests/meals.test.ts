import { expect, test } from 'vitest'
import { amountToQty, cleanDinners, mealPrompt } from '@/lib/meals'

const deals = new Map([
  [7, { id: 7, name: 'Chicken Thighs', price: 1.99, unit: 'lb', merchant_name: 'Aldi' }],
  [9, { id: 9, name: 'Broccoli Crowns', price: 1.49, merchant_name: 'C Town' }],
])

test('prompt lists deals with ids, prefs and dinners to avoid', () => {
  const p = mealPrompt([...deals.values()], { notes: 'no pork', budget: 15 }, [{ title: 'Tacos' } as never], 3)
  expect(p).toContain('7: Chicken Thighs — $1.99/lb at Aldi')
  expect(p).toContain('My preferences: no pork')
  expect(p).toContain('under about $15')
  expect(p).toContain("I'm already making: Tacos")
})

test('cleanDinners keeps real deal ids only and fills in deal details', () => {
  const out = cleanDinners([
    { title: 'Sheet-pan chicken', emoji: '🍗', description: 'Crispy.', estCost: 6.5,
      ingredients: [{ name: 'Chicken Thighs', amount: '2 lb', dealId: 7 }, { name: 'broccoli', dealId: 999 }, { name: '' }] },
    { title: '', ingredients: [] },
    'junk',
  ], deals)
  expect(out).toHaveLength(1)
  expect(out[0].ingredients).toEqual([
    { name: 'chicken thighs', amount: '2 lb', dealId: 7, dealName: 'Chicken Thighs', store: 'Aldi', price: 1.99, unit: 'lb' },
    { name: 'broccoli', amount: null },
  ])
  expect(cleanDinners(null, deals)).toEqual([])
})

test('amountToQty', () => {
  expect(amountToQty('1.5 lb')).toEqual({ qty: 1.5, unit: 'lb' })
  expect(amountToQty('2 onions')).toEqual({ qty: 2, unit: null })
  expect(amountToQty('12 cloves')).toEqual({ qty: 1, unit: null })
  expect(amountToQty('1 head')).toEqual({ qty: 1, unit: null })
  expect(amountToQty(null)).toEqual({ qty: 1, unit: null })
})
