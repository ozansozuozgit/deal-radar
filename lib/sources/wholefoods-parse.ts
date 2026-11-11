import { parsePrice, parseUnit } from '@/lib/parse/price'
import { categorize } from '@/lib/parse/category'
import type { DealInput } from '@/lib/types'

export interface WfRawDeal {
  name: string; brand: string | null
  primeText: string; nonPrimeText: string | null; regularText: string | null
  expiry: string | null
}

// Block markers vary between renders: "Exp. 07/28" or "Valid 07/22 - 07/28".
// Both capture the END date of the deal window.
const MARKER = /^(?:Exp\.?\s*(\d{2}\/\d{2})\.?|Valid\s+\d{2}\/\d{2}\s*-\s*(\d{2}\/\d{2})\.?)$/
const NOISE = /^(Add to Cart|View All|Change store|Learn more|Valid \d|Save big|Dig into|View deals|Eligible Prime|This Week|Shop All Deals|Home$|Sales Flyer|Weekly Sales)/i
// A prime-price fragment must look like a deal, not a sentence that happens to
// mention Prime (hero banners: "Organic Yellow Nectarines $3.49 lb with Prime*").
const DEALISH = /^(?:\$\d|\d+% off|Buy \d|\d+\s*for\s*\$)/i
const PRICELIKE = /^(?:\$|\d+% off|\d+\s*for\s*\$|Buy \d)/i

export function parseWholeFoodsText(bodyText: string): WfRawDeal[] {
  const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean)
  const deals: WfRawDeal[] = []
  for (let k = 0; k < lines.length; k++) {
    if (!lines[k].includes('with Prime')) continue
    const primeText = lines[k].slice(0, lines[k].indexOf('with Prime')).replace(/\*+$/, '').trim()
    if (!DEALISH.test(primeText)) continue
    // the line below, if price-like, holds "<nonPrime> <regular>"
    let nonPrimeText: string | null = null
    let regularText: string | null = null
    const below = lines[k + 1]
    if (below && !MARKER.test(below) && !NOISE.test(below) && !below.includes('with Prime')) {
      ({ nonPrimeText, regularText } = splitPriceLine(below))
    }
    // walk back for [brand..., name] directly above the prime line
    const block: string[] = []
    for (let j = k - 1; j >= 0 && block.length < 3; j--) {
      const l = lines[j]
      if (MARKER.test(l) || NOISE.test(l) || l.includes('with Prime') || PRICELIKE.test(l)) break
      block.unshift(l)
    }
    if (block.length === 0) continue
    const name = block.pop()!.replace(/\*+$/, '').trim()
    const brand = block.length ? block.join(' ') : null
    // nearest preceding marker carries the end date
    let expiry: string | null = null
    for (let j = k - 1; j >= 0 && j >= k - 9; j--) {
      const m = MARKER.exec(lines[j])
      if (m) { expiry = m[1] ?? m[2] ?? null; break }
    }
    deals.push({ name, brand, primeText, nonPrimeText, regularText, expiry })
  }
  return deals
}

/** One deal per name + Prime price + end date, across the sales page and its "View All" pages. */
export function mergeWfRaw(...lists: WfRawDeal[][]): WfRawDeal[] {
  const seen = new Set<string>()
  const out: WfRawDeal[] = []
  for (const list of lists) for (const d of list) {
    const key = `${d.name.toLowerCase()}|${d.primeText}|${d.expiry ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

function splitPriceLine(line: string): { nonPrimeText: string | null; regularText: string | null } {
  // "$6.66 ea $7.99" | "11% off $34.99/lb" | "4 for $5.56 $1.09" | "$9.49"
  const pctMatch = /^(\d+% off)\s+(.*)$/.exec(line)
  if (pctMatch) return { nonPrimeText: pctMatch[1], regularText: pctMatch[2] || null }
  const multi = /^(\d+\s*for\s*\$\d+(?:\.\d+)?)\s*(.*)$/.exec(line)
  if (multi) return { nonPrimeText: multi[1], regularText: multi[2] || null }
  const prices = line.match(/\$\d+(?:\.\d+)?(?:\/lb| ea)?/g) ?? []
  if (prices.length >= 2) return { nonPrimeText: prices.slice(0, -1).join(' '), regularText: prices[prices.length - 1] }
  if (prices.length === 1) return { nonPrimeText: null, regularText: prices[0] }
  return { nonPrimeText: null, regularText: null }
}

export function wfToDeals(raw: WfRawDeal[], storeId: number, ingestDateIso: string): DealInput[] {
  const year = ingestDateIso.slice(0, 4)
  return raw.map((r, idx) => {
    const price = parsePrice(r.nonPrimeText)
    const primePrice = parsePrice(r.primeText)
    const isPctDeal = price == null && /%|buy/i.test(r.primeText)
    const validTo = r.expiry ? `${year}-${r.expiry.replace('/', '-')}T23:59:59-04:00` : null
    return {
      source: 'wholefoods' as const,
      externalId: `${storeId}-${r.expiry ?? 'noexp'}-${slugKey(r.name)}-${idx}`,
      merchantSlug: 'whole-foods-market',
      name: r.name,
      description: r.brand,
      price,
      primePrice,
      originalPrice: parsePrice(r.regularText),
      unit: parseUnit(r.nonPrimeText ?? r.primeText ?? r.regularText),
      priceText: r.nonPrimeText ?? r.primeText,
      saleStory: isPctDeal
        ? (r.nonPrimeText ? `${r.nonPrimeText} (${r.primeText} with Prime)` : `${r.primeText} with Prime`)
        : null,
      category: categorize(r.name),
      imageUrl: null,
      validFrom: ingestDateIso,
      validTo,
    }
  })
}

function slugKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
}

// ---- product enrichment (images from the page's /api/wwos/products calls) ----

export interface WfProduct { name: string; brandName?: string | null; productImages?: string[] | null }

export function flattenWfProducts(batches: unknown): WfProduct[] {
  if (!Array.isArray(batches)) return []
  const out: WfProduct[] = []
  for (const batch of batches) {
    const items = Array.isArray(batch) ? batch : (batch as { products?: unknown[] })?.products ?? [batch]
    for (const it of items as WfProduct[]) if (it && typeof it.name === 'string') out.push(it)
  }
  return out
}

const STOP = new Set(['organic', 'fresh', 'the', 'and', 'or', 'of', 'with', 'a', 'oz', 'lb', 'pack', 'pkg'])

function nameTokens(s: string): string[] {
  return [...new Set(
    s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(t => t.length > 2 && !STOP.has(t)),
  )]
}

// singular/plural tolerant: "peaches" matches "peach", "nectarines" matches "nectarine"
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2
}

export function enrichWfDeals(deals: DealInput[], products: WfProduct[]): DealInput[] {
  const indexed = products.map(p => ({ p, tokens: nameTokens(`${p.brandName ?? ''} ${p.name}`) }))
  return deals.map(d => {
    if (d.imageUrl) return d
    const dTokens = nameTokens(d.name)
    if (dTokens.length === 0) return d
    let best: { p: WfProduct; score: number } | null = null
    for (const { p, tokens } of indexed) {
      const overlap = dTokens.filter(t => tokens.some(pt => tokenMatches(t, pt))).length
      const score = overlap / dTokens.length
      if (score > (best?.score ?? 0)) best = { p, score }
    }
    if (best && best.score >= 0.6 && best.p.productImages?.[0]) {
      return { ...d, imageUrl: best.p.productImages[0] }
    }
    return d
  })
}
