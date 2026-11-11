import { expect, test } from 'vitest'
import {
  amazonCardToDeal, amazonDeals, amazonProductUrl, isRobotCheck, weekStart, windowsFull, type AmazonCard,
} from '@/lib/sources/amazon-parse'
import { isDeliveryStore, whereLabel } from '@/lib/stores/delivery'

const now = new Date('2026-11-11T11:00:00Z') // a Wednesday
const card = (over: Partial<AmazonCard>): AmazonCard => ({
  asin: 'B07FNVBXMJ', title: 'Amazon Grocery, Large White Eggs, 12 Ct', image: 'https://m.media-amazon.com/images/I/eggs.jpg',
  price: '$3.49', was: null, wasLabel: null, text: '', ...over,
})

test('a struck-through List or Was price makes a deal', () => {
  const d = amazonCardToDeal(card({ was: '$4.29', wasLabel: 'List: $4.29' }), { aisle: 'dairy', now })!
  expect(d).toMatchObject({
    source: 'amazon', merchantSlug: 'amazon-grocery', name: 'Amazon Grocery, Large White Eggs, 12 Ct',
    price: 3.49, originalPrice: 4.29, primePrice: null, category: 'dairy',
    externalId: 'B07FNVBXMJ-2026-11-09', validFrom: '2026-11-09T00:00:00.000Z',
  })
  expect(d.validTo).toBe('2026-11-12T23:00:00.000Z') // a day and a half after the scan
})

test('full price is not a deal, and neither is a "Typical" price', () => {
  expect(amazonCardToDeal(card({}), { now })).toBeNull()
  expect(amazonCardToDeal(card({ was: '$4.29', wasLabel: 'Typical: $4.29' }), { now })).toBeNull()
  expect(amazonCardToDeal(card({ was: '$3.49', wasLabel: 'List: $3.49' }), { now })).toBeNull()
})

test('coupons, limited time deals and Prime prices count, and say so', () => {
  expect(amazonCardToDeal(card({ text: 'Eggs\n$3.49\nSave 10% with coupon' }), { now })?.saleStory).toBe('Save 10% with coupon')
  expect(amazonCardToDeal(card({ text: 'Limited time deal\n$3.49' }), { now })?.saleStory).toBe('Limited time deal')
  const prime = amazonCardToDeal(card({ text: 'Prime member price $2.99\n$3.49' }), { now })!
  expect(prime.primePrice).toBe(2.99)
  expect(prime.saleStory).toBe('Prime member price')
})

test('cards without a price, title or real ASIN are skipped', () => {
  expect(amazonCardToDeal(card({ price: null, was: '$4' }), { now })).toBeNull()
  expect(amazonCardToDeal(card({ title: '  ', was: '$4.29' }), { now })).toBeNull()
  expect(amazonCardToDeal(card({ asin: '', was: '$4.29' }), { now })).toBeNull()
})

test('the name decides the aisle, and the searched aisle fills in when it cannot', () => {
  expect(amazonCardToDeal(card({ title: 'Organic Bananas', was: '$1' , price: '$0.79' }), { aisle: 'pantry', now })?.category).toBe('produce')
  expect(amazonCardToDeal(card({ title: 'Mystery Box', was: '$9', price: '$5' }), { aisle: 'snacks', now })?.category).toBe('snacks')
})

test('a product found in two aisles counts once', () => {
  const sale = card({ was: '$4.29' })
  expect(amazonDeals([{ aisle: 'dairy', cards: [sale] }, { aisle: 'breakfast', cards: [sale, card({})] }], now)).toHaveLength(1)
})

test('weeks start on Monday', () => {
  expect(weekStart(new Date('2026-11-09T00:30:00Z'))).toBe('2026-11-09T00:00:00.000Z')
  expect(weekStart(new Date('2026-11-15T23:00:00Z'))).toBe('2026-11-09T00:00:00.000Z')
})

test('robot checks and full delivery windows are recognised', () => {
  expect(isRobotCheck('<form action="/errors/validateCaptcha">')).toBe(true)
  expect(isRobotCheck('<div data-component-type="s-search-result">')).toBe(false)
  expect(windowsFull('Sorry, our same-day delivery windows are currently full')).toBe(true)
  expect(windowsFull('Add $25 for FREE Same-Day delivery')).toBe(false)
})

test('deals link to their product page; Amazon Grocery is a delivery store', () => {
  expect(amazonProductUrl('B07FNVBXMJ-2026-11-09')).toBe('https://www.amazon.com/dp/B07FNVBXMJ')
  expect(amazonProductUrl(null)).toBeNull()
  expect(isDeliveryStore('amazon-grocery')).toBe(true)
  expect(whereLabel('amazon-grocery', null)).toBe(' · delivery')
})
