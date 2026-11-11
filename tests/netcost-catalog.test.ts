import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getServiceClient } from '@/lib/db'
import { POST } from '@/app/api/import/netcost/route'
import { bestPriceByStore } from '@/lib/bestPrice'
import { mapNetcostProduct, netcostBookmarklet } from '@/lib/sources/netcost'

vi.mock('@/lib/db', () => ({ getServiceClient: vi.fn() }))

const SEEN = '2026-11-11T12:00:00.000Z'

test('a catalog product keeps its regular price, size and aisle', () => {
  expect(mapNetcostProduct({
    id: 55, name: 'Buckwheat Groats - 900g', regular: 3.4899999999999998, sale: 2.99,
    weighable: false, weight: 900, unit: 'gram', department: 'GROCERY', image: "https://cdn.example/{{size}}.{{extension||'jpg'}}",
  }, SEEN)).toMatchObject({
    source: 'netcost', external_id: '55', merchant_slug: 'netcost', merchant_name: 'NetCost Market',
    price: 3.49, unit: null, size_unit: 'oz', size_qty: 31.747, cmp_basis: 'lb', category: 'pantry',
    image_url: 'https://cdn.example/medium.jpg', last_seen: SEEN,
  })
})

test('a weighed product is per lb, and one with no price is left out', () => {
  expect(mapNetcostProduct({ id: 2, name: 'Chicken Breast', regular: 4.99, weighable: true, department: 'MEAT FRESH' }, SEEN))
    .toMatchObject({ price: 4.99, unit: 'lb', cmp_price: 4.99, cmp_basis: 'lb', category: 'meat' })
  expect(mapNetcostProduct({ id: 3, name: 'Mystery', regular: null, sale: 0 }, SEEN)).toBeNull()
  expect(mapNetcostProduct({ id: 0, name: 'No id', regular: 1 }, SEEN)).toBeNull()
})

test('a sale elsewhere beats the regular price, and a regular price still puts the store on the list', () => {
  const regular = { ...mapNetcostProduct({ id: 2, name: 'Chicken Breast', regular: 4.99, weighable: true }, SEEN)!, id: -2, regular: true }
  const sale = { id: 9, name: 'Boneless Chicken Breast', merchant_slug: 'fairway', merchant_name: 'Fairway', price: 3.99, unit: 'lb', regular: false }
  const best = bestPriceByStore('chicken breast', [regular, sale])
  expect(best.stores.map(s => [s.slug, s.unitPrice])).toEqual([['fairway', 3.99], ['netcost', 4.99]])
  expect(best.stores[1].deal.regular).toBe(true)
})

// --- the import route, catalog half ---
let writes: Array<{ table: string; rows: Array<Record<string, unknown>> }>
beforeEach(() => {
  vi.stubEnv('IMPORT_KEY', 'right')
  writes = []
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => ({
      upsert: async (rows: Array<Record<string, unknown>>) => { writes.push({ table, rows }); return { error: null } },
    }),
  } as never)
})
afterEach(() => vi.unstubAllEnvs())

const post = (body: unknown, url = 'http://test/api/import/netcost') => POST(new NextRequest(url, {
  method: 'POST', body: JSON.stringify(body),
  headers: { Authorization: 'Bearer right', Origin: 'https://www.shop.netcostmarket.com' },
}))

test('a catalog batch goes to catalog_prices, never to deals', async () => {
  const res = await post({ branch: '1924', catalog: [
    { id: 1, name: 'Kefir 1L', regular: 3.99, weight: 1, unit: 'Liter' },
    { id: 1, name: 'Kefir 1L', regular: 3.99, weight: 1, unit: 'Liter' },
    { id: 2, name: 'No price' },
  ] })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ saved: 1, skipped: 2 })
  expect(writes.map(w => w.table)).toEqual(['catalog_prices'])
  expect(writes[0].rows[0]).toMatchObject({ external_id: '1', price: 3.99, cmp_basis: 'gal' })
})

test('a catalog dry run stores nothing, and an oversized batch is refused', async () => {
  expect((await (await post({ catalog: [{ id: 1, name: 'A', regular: 1 }] }, 'http://test/api/import/netcost?dry=1')).json()).dry).toBe(true)
  expect((await post({ catalog: Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, name: 'A', regular: 1 })) })).status).toBe(413)
  expect(writes).toEqual([])
})

// --- the bookmark itself, run against a pretend NetCost ---
function product(id: number) {
  return { id, names: { 2: { long: `Product ${id}` } }, branch: { regularPrice: 2.5 }, isWeighable: false, weight: 16, unitOfMeasure: { names: { 2: 'Oz' } }, department: { name: 'GROCERY' }, image: { url: 'https://cdn/x.jpg' } }
}

async function runBookmark({ catalogPath = '/products', total = 450, loaded = [] as string[] } = {}) {
  const posts: Array<Record<string, unknown>> = []
  const alerts: string[] = []
  const requested: string[] = []
  const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
    if (url.startsWith('https://site.example')) {
      const body = JSON.parse(init!.body!)
      posts.push(body)
      const out = body.catalog ? { saved: body.catalog.length, skipped: 0 } : { imported: body.specials.length, skipped: 0 }
      return { ok: true, json: async () => out }
    }
    requested.push(url)
    const u = new URL(url, 'https://www.shop.netcostmarket.com')
    const from = Number(u.searchParams.get('from')), size = Number(u.searchParams.get('size'))
    if (u.pathname.endsWith('/specials')) {
      const specials = from === 0 ? [{ id: 7, names: { 2: { name: 'Special', promotionTag: 'Only $1' } }, startDate: SEEN, endDate: SEEN, item: { branch: { salePrice: 1, regularPrice: 2 } } }] : []
      return { ok: true, json: async () => ({ specials, total: 1 }) }
    }
    if (u.pathname.endsWith(catalogPath)) {
      const products = Array.from({ length: Math.max(0, Math.min(size, total - from)) }, (_, i) => product(from + i + 1))
      return { ok: true, json: async () => ({ products, total }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  const g = globalThis as Record<string, unknown>
  const saved = { location: g.location, performance: g.performance, document: g.document, alert: g.alert, fetch: g.fetch }
  Object.assign(g, {
    location: { hostname: 'www.shop.netcostmarket.com', origin: 'https://www.shop.netcostmarket.com' },
    performance: { getEntriesByType: () => [{ name: 'https://www.shop.netcostmarket.com/v2/retailers/1265/branches/1924/specials?x=1' }, ...loaded.map(name => ({ name }))] },
    document: { title: 'NetCost' },
    alert: (m: string) => alerts.push(m),
    fetch: fetchMock,
  })
  try {
    const code = decodeURIComponent(netcostBookmarklet('https://site.example/api/import/netcost', 'k').slice('javascript:'.length))
    await (0, eval)(code)
    await vi.waitFor(() => expect(alerts).toHaveLength(1))
  } finally { Object.assign(g, saved) }
  return { posts, alerts, requested }
}

test('the bookmark sends the specials, then every catalog product', async () => {
  const { posts, alerts } = await runBookmark()
  expect(posts[0]).toMatchObject({ branch: '1924', specials: [{ id: 7, name: 'Special', tag: 'Only $1', sale: 1, regular: 2 }] })
  const catalog = posts.slice(1).flatMap(p => p.catalog as Array<{ id: number }>)
  expect(catalog).toHaveLength(450)
  expect(new Set(catalog.map(p => p.id)).size).toBe(450)
  expect(catalog[0]).toMatchObject({ id: 1, name: 'Product 1', regular: 2.5, weight: 16, unit: 'Oz', department: 'GROCERY', image: 'https://cdn/x.jpg' })
  expect(alerts[0]).toBe('1 deals sent to Deal Radar. Branch 1924. 450 regular prices sent.')
})

test('the bookmark falls back to the product list the page loaded, without its aisle filter', async () => {
  const { posts, requested } = await runBookmark({
    catalogPath: '/catalog/products', total: 120,
    loaded: ['https://www.shop.netcostmarket.com/v2/retailers/1265/branches/1924/catalog/products?appId=4&categoryId=88&from=0&size=20'],
  })
  expect(posts.slice(1).flatMap(p => p.catalog as unknown[])).toHaveLength(120)
  expect(requested.filter(u => u.includes('/catalog/products')).every(u => !u.includes('categoryId'))).toBe(true)
})

test('when no product list answers, the specials still go and the alert says so', async () => {
  const { posts, alerts } = await runBookmark({ catalogPath: '/nowhere' })
  expect(posts).toHaveLength(1)
  expect(alerts[0]).toMatch(/^1 deals sent .* Full catalog failed: could not find the product list/)
})
