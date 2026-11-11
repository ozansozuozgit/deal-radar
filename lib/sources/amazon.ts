import { DEFAULT_LOCATION } from '@/config/location'
import {
  AMAZON_AISLES, amazonDeals, amazonFlyer, amazonSearchUrl, isRobotCheck, windowsFull, type AmazonCard,
} from './amazon-parse'
import type { DealSource, FlyerInput } from '@/lib/types'
import type { Page } from 'playwright'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const PAGES_PER_AISLE = 2

/**
 * Point Amazon at a ZIP the way its "Deliver to" box does, so prices and stock are the ones
 * that deliver there. Returns false unless the "Deliver to" box then shows that ZIP.
 */
async function setZip(page: Page, zip: string): Promise<boolean> {
  await page.goto('https://www.amazon.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 })
  if (isRobotCheck(await page.content())) throw new Error('Amazon showed a robot check instead of the store')
  const ok = await page.evaluate(async (zip: string) => {
    const modal = document.querySelector('#nav-global-location-data-modal-action')?.getAttribute('data-a-modal')
    const first = modal ? (JSON.parse(modal).ajaxHeaders?.['anti-csrftoken-a2z'] as string | undefined) : undefined
    if (!first) return false
    const picker = await fetch('/portal-migration/hz/glow/get-rendered-address-selections?deviceType=desktop&pageType=Gateway&storeContext=NoStoreName&actionSource=desktop-modal',
      { headers: { 'anti-csrftoken-a2z': first }, credentials: 'include' }).then(r => r.text())
    const token = /CSRF_TOKEN\s*:\s*"([^"]+)"/.exec(picker)?.[1] ?? first
    const res = await fetch('/portal-migration/hz/glow/address-change?actionSource=glow', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'anti-csrftoken-a2z': token },
      body: JSON.stringify({ locationType: 'LOCATION_INPUT', zipCode: zip, deviceType: 'web', storeContext: 'generic', pageType: 'Gateway', actionSource: 'glow' }),
    })
    return res.ok
  }, zip)
  if (!ok) return false
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
  // a box we can't read proves nothing, and prices for the wrong place are worse than none
  const shown = await page.locator('#glow-ingress-line2').first().textContent({ timeout: 5_000 }).catch(() => null)
  return shown != null && shown.includes(zip)
}

async function readCards(page: Page): Promise<AmazonCard[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-component-type="s-search-result"][data-asin]')).map(el => {
      const card = el as HTMLElement
      const strike = card.querySelector('.a-price.a-text-price')
      return {
        asin: card.getAttribute('data-asin') ?? '',
        title: (card.querySelector('[data-cy="title-recipe"] h2, h2') as HTMLElement | null)?.innerText ?? '',
        image: (card.querySelector('img.s-image') as HTMLImageElement | null)?.src ?? null,
        price: card.querySelector('.a-price:not(.a-text-price) .a-offscreen')?.textContent ?? null,
        was: strike?.querySelector('.a-offscreen')?.textContent ?? null,
        wasLabel: (strike?.parentElement as HTMLElement | null)?.innerText ?? null,
        text: card.innerText,
      }
    }))
}

export const amazonSource: DealSource = {
  id: 'amazon',
  async fetchFlyers() {
    const zip = DEFAULT_LOCATION.postalCode
    return zip ? [amazonFlyer(zip, new Date())] : []
  },
  async fetchDeals(flyer: FlyerInput) {
    const { zip } = flyer.raw as { zip: string }
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] })
    try {
      const page = await browser.newPage({ userAgent: UA, locale: 'en-US' })
      if (!(await setZip(page, zip))) throw new Error(`Amazon wouldn't deliver to ${zip}, so its prices would be for somewhere else`)
      const pages: Array<{ aisle: string; cards: AmazonCard[] }> = []
      let full = false
      for (const { query, category } of AMAZON_AISLES) {
        let base = amazonSearchUrl(query)
        for (let n = 1; n <= PAGES_PER_AISLE; n++) {
          await page.goto(n === 1 ? base : `${base}&page=${n}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
          if (isRobotCheck(await page.content())) throw new Error(`Amazon showed a robot check on "${query}"`)
          // the deals filter in the sidebar, when Amazon offers one, leaves only discounted items
          if (n === 1) {
            const deals = page.locator('#s-refinements a', { hasText: /All Discounts|Today's Deals/ }).first()
            const href = await deals.getAttribute('href', { timeout: 2_000 }).catch(() => null)
            if (href) {
              base = new URL(href, 'https://www.amazon.com').href
              await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            }
          }
          const cards = await readCards(page)
          full ||= windowsFull(await page.evaluate(() => document.body.innerText))
          pages.push({ aisle: category, cards })
          if (cards.length === 0) break
          await page.waitForTimeout(1_500 + Math.random() * 1_500) // go gently
        }
      }
      const deals = amazonDeals(pages, new Date())
      const seen = pages.reduce((n, p) => n + p.cards.length, 0)
      console.log(`[amazon] ${seen} products read, ${deals.length} on sale${full ? ' (delivery windows were full)' : ''}`)
      // Amazon still lists products and prices while same-day windows are full; only an empty
      // read is a failure, and saying why keeps it from looking like a broken scraper
      if (seen === 0) {
        throw new Error(full
          ? 'Amazon grocery listed nothing: same-day delivery windows were full'
          : 'Amazon grocery listed nothing; the search page layout may have changed')
      }
      return deals
    } finally {
      await browser.close()
    }
  },
}
