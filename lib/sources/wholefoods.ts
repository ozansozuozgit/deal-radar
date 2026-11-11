import { DEFAULT_LOCATION } from '@/config/location'
import { enrichWfDeals, flattenWfProducts, mergeWfRaw, parseWholeFoodsText, wfToDeals } from './wholefoods-parse'
import type { Page } from 'playwright'
import type { DealSource, FlyerInput } from '@/lib/types'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export const wholeFoodsSource: DealSource = {
  id: 'wholefoods',
  async fetchFlyers() {
    const storeId = DEFAULT_LOCATION.wholeFoodsStoreId
    if (!storeId) return []
    const now = new Date().toISOString()
    return [{
      source: 'wholefoods', externalId: `wf-${storeId}-${now.slice(0, 10)}`,
      merchantSlug: 'whole-foods-market', merchantName: 'Whole Foods Market',
      title: 'Weekly Sales', validFrom: now, validTo: null, raw: { storeId },
    }]
  },
  async fetchDeals(flyer: FlyerInput) {
    const { storeId } = flyer.raw as { storeId: number }
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] })
    try {
      const page = await browser.newPage({ userAgent: UA })
      const productBatches: unknown[] = []
      page.on('response', async res => {
        if (res.url().includes('/api/wwos/products') && res.status() === 200) {
          try { productBatches.push(await res.json()) } catch { /* non-JSON, ignore */ }
        }
      })
      const salesUrl = `https://www.wholefoodsmarket.com/sales-flyer?store-id=${storeId}`
      const main = await readPage(page, salesUrl)
      // The sales page shows a preview of each section; "View All" / "Shop All Deals"
      // lead to the full lists. Read each one too, so the scan isn't just the preview.
      // keep the store on every page, or the site falls back to its default store
      const more = main.links.map(u => withStore(u, storeId)).filter(u => u !== salesUrl).slice(0, MAX_EXTRA_PAGES)
      const raws = [parseWholeFoodsText(main.text)]
      const images = [...main.images]
      const counts = [`main=${raws[0].length}`]
      for (const url of more) {
        try {
          const p = await readPage(page, url)
          const parsed = parseWholeFoodsText(p.text)
          raws.push(parsed)
          images.push(...p.images)
          counts.push(`${new URL(url).pathname}${new URL(url).search}=${parsed.length}`)
        } catch (e) {
          counts.push(`${url}=failed(${e instanceof Error ? e.message : e})`)
        }
      }
      const merged = mergeWfRaw(...raws)
      console.log(`[wholefoods] store ${storeId}: ${merged.length} unique deals; pages ${counts.join(', ')}; ` +
        `View All controls without a link: ${main.unlinkedViewAll}`)
      const deals = wfToDeals(merged, storeId, new Date().toISOString())
      if (deals.length === 0) throw new Error('Whole Foods parse produced 0 deals — page layout may have changed')
      return enrichWfDeals(deals, [...images, ...flattenWfProducts(productBatches)])
    } finally {
      await browser.close()
    }
  },
}

const MAX_EXTRA_PAGES = 15
const MAX_SCROLLS = 40
const MORE_LINK = /^(view all|shop all deals|see all|show all)$/

/** Load a page, scroll until it stops growing, and return its text, card images and "see more" links. */
async function readPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(5_000) // let client hydration finish
  // lazy sections and product batches load as you scroll; stop once the page stops growing
  let lastHeight = 0, still = 0
  for (let i = 0; i < MAX_SCROLLS && still < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2))
    await page.waitForTimeout(700)
    const h = await page.evaluate(() => document.body.scrollHeight)
    const atBottom = await page.evaluate(() => window.innerHeight + window.scrollY >= document.body.scrollHeight - 4)
    still = h === lastHeight && atBottom ? still + 1 : 0
    lastHeight = h
  }
  const text = await page.evaluate(() => document.body.innerText)
  // card images carry the product name as alt text — the richest image source
  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter(i => i.alt && /media-amazon\.com\/images\/I\//.test(i.src))
      .map(i => ({ name: i.alt, productImages: [i.src] })))
  // No named functions or consts holding arrows inside page.evaluate: tsx wraps them
  // in a __name() helper that doesn't exist in the browser and the call throws.
  const { links, unlinkedViewAll } = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i')
    const anchors = Array.from(document.querySelectorAll('a')).filter(el => re.test((el.textContent ?? '').trim()))
    const buttons = Array.from(document.querySelectorAll('button')).filter(el => re.test((el.textContent ?? '').trim()))
    return {
      links: anchors.map(a => a.href).filter(h => h.startsWith('https://www.wholefoodsmarket.com/')),
      unlinkedViewAll: buttons.length,
    }
  }, MORE_LINK.source)
  return { text, images, links: [...new Set(links)], unlinkedViewAll }
}

function withStore(url: string, storeId: number): string {
  const u = new URL(url)
  if (!u.searchParams.has('store-id')) u.searchParams.set('store-id', String(storeId))
  return u.toString()
}
