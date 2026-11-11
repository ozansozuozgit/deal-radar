// Amazon's own grocery store (amazon.com/fmc/grocery-storefront, once "Amazon Fresh"), as a
// delivery store. The scan reads Amazon search results inside the grocery department for one
// ZIP; this file turns what each result card shows into deals, so it can be tested offline.
import { parsePrice } from '@/lib/parse/price'
import { categorize } from '@/lib/parse/category'
import type { DealInput, FlyerInput } from '@/lib/types'

export const AMAZON = {
  source: 'amazon',
  slug: 'amazon-grocery',
  name: 'Amazon Grocery',
  logo: 'https://www.amazon.com/favicon.ico',
  storefrontUrl: 'https://www.amazon.com/fmc/grocery-storefront',
} as const

/** The storefront's aisles, searched one at a time inside the grocery department. */
export const AMAZON_AISLES: Array<{ query: string; category: string }> = [
  { query: 'produce', category: 'produce' },
  { query: 'dairy eggs', category: 'dairy' },
  { query: 'meat', category: 'meat' },
  { query: 'seafood', category: 'seafood' },
  { query: 'bread bakery', category: 'bakery' },
  { query: 'frozen', category: 'frozen' },
  { query: 'deli prepared', category: 'other' },
  { query: 'beverages', category: 'beverages' },
  { query: 'snacks', category: 'snacks' },
  { query: 'pantry', category: 'pantry' },
  { query: 'breakfast', category: 'pantry' },
]

/** What the scan reads off one search result card. */
export interface AmazonCard {
  asin: string
  title: string
  image: string | null
  price: string | null      // "$3.49", the price you pay now
  was: string | null        // "$4.29", the struck-through price, when there is one
  wasLabel: string | null   // the words around it: "List:", "Was:", "Typical:"
  text: string              // the whole card, for badges like "Save 15% with coupon"
}

/** The search page for one aisle, in Amazon's grocery department. */
export function amazonSearchUrl(query: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=amazonfresh`
}

/** Amazon's robot check, which it shows to scripts instead of results. */
export function isRobotCheck(html: string): boolean {
  return /validateCaptcha|Enter the characters you see below|api-services-support@amazon\.com/i.test(html)
}

/** "Sorry, our same-day delivery windows are currently full" on the storefront and in results. */
export function windowsFull(text: string): boolean {
  return /delivery windows are (?:currently )?full/i.test(text)
}

/** Monday of this week (UTC), so a deal stays one row for the week and history gets a point a week. */
export function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString()
}

// Amazon shows no end date, so a deal lasts until a day and a half after the scan that saw it:
// tomorrow's scan extends it, and one missed scan doesn't empty the store. It never outlives its
// week, because next week's sighting is a new row and the two would show side by side.
const SEEN_FOR_MS = 36 * 3600_000
const WEEK_MS = 7 * 24 * 3600_000

export function seenUntil(now: Date): string {
  const weekEnd = new Date(weekStart(now)).getTime() + WEEK_MS
  return new Date(Math.min(now.getTime() + SEEN_FOR_MS, weekEnd)).toISOString()
}

function saleStory(text: string): string | null {
  const t = text.replace(/\s+/g, ' ')
  const coupon = /Save (\$\d+(?:\.\d{2})?|\d+%)(?: on \d+)? with coupon/i.exec(t)
  if (coupon) return `Save ${coupon[1]} with coupon`
  const save = /Save (\d+)%/i.exec(t)
  if (save) return `Save ${save[1]}%`
  if (/Limited time deal/i.test(t)) return 'Limited time deal'
  if (/Prime member price|with Prime/i.test(t)) return 'Prime member price'
  return null
}

function primePrice(text: string): number | null {
  const t = text.replace(/\s+/g, ' ')
  const m = /Prime member price:?\s*\$(\d+(?:\.\d{2})?)/i.exec(t) ?? /\$(\d+(?:\.\d{2})?)\s*with Prime/i.exec(t)
  return m ? Number(m[1]) : null
}

/**
 * A card is a deal when Amazon strikes a higher List or Was price through, or puts a coupon,
 * "Limited time deal" or Prime price on it. A "Typical" price is only Amazon's estimate, not a sale.
 */
export function amazonCardToDeal(card: AmazonCard, { aisle, now }: { aisle?: string; now: Date }): DealInput | null {
  const name = card.title.replace(/\s+/g, ' ').trim()
  if (!/^[A-Z0-9]{10}$/.test(card.asin) || !name) return null
  const price = parsePrice(card.price)
  if (price == null || price <= 0) return null
  const was = /typical/i.test(card.wasLabel ?? '') ? null : parsePrice(card.was)
  const prime = primePrice(card.text)
  const story = saleStory(card.text)
  const marked = was != null && was > price
  if (!marked && !story && !(prime != null && prime < price)) return null
  const fromName = categorize(name)
  return {
    source: 'amazon',
    externalId: `${card.asin}-${weekStart(now).slice(0, 10)}`,
    merchantSlug: AMAZON.slug,
    name,
    price,
    originalPrice: marked ? was : null,
    primePrice: prime != null && prime < price ? prime : null,
    unit: /\/\s*lb\b/i.test(card.price ?? '') ? 'lb' : null,
    saleStory: story,
    category: fromName === 'other' && aisle ? aisle : fromName,
    imageUrl: card.image,
    validFrom: weekStart(now),
    validTo: seenUntil(now),
  }
}

/** Deals from every aisle's cards; a product found in two aisles counts once. */
export function amazonDeals(pages: Array<{ aisle: string; cards: AmazonCard[] }>, now: Date): DealInput[] {
  const out = new Map<string, DealInput>()
  for (const { aisle, cards } of pages) {
    for (const c of cards) {
      const d = amazonCardToDeal(c, { aisle, now })
      if (d && !out.has(d.externalId)) out.set(d.externalId, d)
    }
  }
  return [...out.values()]
}

export function amazonFlyer(zip: string, now: Date): FlyerInput {
  return {
    source: 'amazon', externalId: `grocery-${zip}`,
    merchantSlug: AMAZON.slug, merchantName: AMAZON.name,
    title: 'Grocery deals', validFrom: weekStart(now), validTo: null,
    logoUrl: AMAZON.logo, raw: { zip },
  }
}

/** The product page for a deal, from its external id ("B0…-2026-11-09"). */
export function amazonProductUrl(externalId: string | null | undefined): string | null {
  const asin = /^([A-Z0-9]{10})-/.exec(externalId ?? '')?.[1]
  return asin ? `https://www.amazon.com/dp/${asin}` : null
}
