import { expect, test } from 'vitest'
import { formatQty, parseItem, qtyStep } from '@/lib/quantity'

test('leading quantities and units', () => {
  expect(parseItem('2 lb chicken breast')).toEqual({ text: 'chicken breast', qty: 2, unit: 'lb' })
  expect(parseItem('3 avocados')).toEqual({ text: 'avocados', qty: 3, unit: null })
  expect(parseItem('500g feta')).toEqual({ text: 'feta', qty: 500, unit: 'g' })
  expect(parseItem('1.5 pounds of ground beef')).toEqual({ text: 'ground beef', qty: 1.5, unit: 'lb' })
  expect(parseItem('2x milk')).toEqual({ text: 'milk', qty: 2, unit: null })
  expect(parseItem('½ gallon milk')).toEqual({ text: 'milk', qty: 0.5, unit: 'gal' })
})

test('trailing multipliers', () => {
  expect(parseItem('eggs x2')).toEqual({ text: 'eggs', qty: 2, unit: null })
})

test('numbers that are part of the name stay put', () => {
  expect(parseItem('2% milk')).toEqual({ text: '2% milk', qty: 1, unit: null })
  expect(parseItem('7up')).toEqual({ text: '7up', qty: 1, unit: null })
  expect(parseItem('chicken breast')).toEqual({ text: 'chicken breast', qty: 1, unit: null })
  expect(parseItem('2 lb')).toEqual({ text: 'lb', qty: 2, unit: null })
})

test('formatting and steps', () => {
  expect(formatQty(1, null)).toBe('')
  expect(formatQty(3, null)).toBe('3×')
  expect(formatQty(1.5, 'lb')).toBe('1.5 lb')
  expect(qtyStep('lb')).toBe(0.5)
  expect(qtyStep(null)).toBe(1)
})
