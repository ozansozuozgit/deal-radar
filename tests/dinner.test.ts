import { expect, test } from 'vitest'
import { sanitizeIdeas } from '@/lib/dinner'

test('passes well-formed ideas through', () => {
  const idea = { title: 'Tacos', emoji: '🌮', description: 'Quick.', ingredients: [{ name: 'beef', dealName: 'Ground Beef', store: 'Aldi', price: 4.99 }], estCost: 4.99 }
  expect(sanitizeIdeas([idea])).toEqual([idea])
})

test('coerces the shapes LLMs actually return', () => {
  const [idea] = sanitizeIdeas([{ title: 'Stir fry', estCost: '$12.50', ingredients: [{ name: 'tofu', price: '3.49' }, 'rice', { price: 1 }] }])
  expect(idea).toEqual({
    title: 'Stir fry', emoji: '🍽️', description: '',
    ingredients: [{ name: 'tofu', dealName: undefined, store: undefined, price: 3.49 }], estCost: 12.5,
  })
})

test('derives a missing cost and drops junk', () => {
  expect(sanitizeIdeas([{ title: 'Soup', ingredients: [{ name: 'a', price: 1.25 }, { name: 'b', price: 2 }] }])[0].estCost).toBe(3.25)
  expect(sanitizeIdeas([null, 3, { description: 'no title' }])).toEqual([])
  expect(sanitizeIdeas({ ideas: [] })).toEqual([])
  expect(sanitizeIdeas(Array(5).fill({ title: 'x' }))).toHaveLength(3)
})
