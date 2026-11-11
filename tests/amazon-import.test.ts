import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getServiceClient } from '@/lib/db'
import { OPTIONS, POST } from '@/app/api/import/amazon/route'
import { amazonBookmarklet } from '@/lib/sources/amazon-bookmark'
import { AMAZON_AISLES, type AmazonCard } from '@/lib/sources/amazon-parse'

vi.mock('@/lib/db', () => ({ getServiceClient: vi.fn() }))

const URL = 'http://test/api/import/amazon'
const AMAZON = 'https://www.amazon.com'
const card = (asin: string, over: Partial<AmazonCard> = {}): AmazonCard => ({
  asin, title: 'Large White Eggs, 12 Ct', image: null, price: '$3.49', was: '$4.29', wasLabel: 'List: $4.29', text: '', ...over,
})
const body = { zip: '10128', pages: [{ aisle: 'dairy', cards: [card('B07FNVBXMJ'), card('B000000001', { was: null, wasLabel: null })] }] }
const post = (b: unknown, { key = 'right', url = URL } = {}) => POST(new NextRequest(url, {
  method: 'POST', body: JSON.stringify(b), headers: { Authorization: `Bearer ${key}`, Origin: AMAZON },
}))

let writes: Array<{ table: string; rows: unknown; onConflict?: string }>
beforeEach(() => {
  vi.stubEnv('IMPORT_KEY', 'right')
  writes = []
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => ({
      upsert: (rows: unknown, opts: { onConflict?: string }) => {
        writes.push({ table, rows, onConflict: opts?.onConflict })
        const done = { error: null }
        return { ...done, then: (f: (v: typeof done) => unknown) => Promise.resolve(done).then(f), select: () => ({ single: async () => ({ data: { id: 9 }, error: null }) }) }
      },
    }),
  } as never)
})
afterEach(() => vi.unstubAllEnvs())

test('stores Amazon Grocery, its flyer for the ZIP, and only the products on sale', async () => {
  const res = await post(body)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ imported: 1, read: 2 })
  expect(writes.map(w => w.table)).toEqual(['stores', 'flyers', 'deals'])
  expect(writes[0].rows).toMatchObject({ source: 'amazon', slug: 'amazon-grocery', name: 'Amazon Grocery' })
  expect(writes[1].rows).toMatchObject({ source: 'amazon', external_id: 'grocery-10128', merchant_slug: 'amazon-grocery' })
  const deals = writes[2].rows as Array<Record<string, unknown>>
  expect(deals).toHaveLength(1)
  expect(deals[0]).toMatchObject({ flyer_id: 9, source: 'amazon', price: 3.49, original_price: 4.29, category: 'dairy' })
  expect(String(deals[0].external_id)).toMatch(/^B07FNVBXMJ-\d{4}-\d{2}-\d{2}$/)
  // pressed by hand, so it lasts up to three days (never past the end of its week)
  const lasts = new Date(String(deals[0].valid_to)).getTime() - Date.now()
  expect(lasts).toBeLessThanOrEqual(3 * 24 * 3600_000 + 1000)
})

test('a dry run stores nothing', async () => {
  const res = await post(body, { url: `${URL}?dry=1` })
  expect((await res.json()).imported).toBe(1)
  expect(writes).toEqual([])
})

test('a wrong key or a missing ZIP stores nothing, and Amazon pages can read why', async () => {
  const wrong = await post(body, { key: 'wrong' })
  expect(wrong.status).toBe(401)
  expect(wrong.headers.get('access-control-allow-origin')).toBe(AMAZON)
  expect((await post({ ...body, zip: 'NYC' })).status).toBe(400)
  expect((await post({ zip: '10128', pages: [] })).status).toBe(400)
  expect(writes).toEqual([])
})

test('only Amazon pages may call it from a browser', async () => {
  const ok = OPTIONS(new NextRequest(URL, { method: 'OPTIONS', headers: { Origin: AMAZON } }))
  expect(ok.headers.get('access-control-allow-origin')).toBe(AMAZON)
  const other = OPTIONS(new NextRequest(URL, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }))
  expect(other.headers.get('access-control-allow-origin')).toBeNull()
})

test('the bookmark is valid script that reads every aisle and posts to the import', () => {
  const href = amazonBookmarklet('https://site.example/api/import/amazon', 'k"ey')
  expect(href.startsWith('javascript:')).toBe(true)
  const code = decodeURIComponent(href.slice('javascript:'.length))
  expect(() => new Function(code)).not.toThrow()
  expect(code).toContain('"https://site.example/api/import/amazon"')
  expect(code).toContain('"k\\"ey"')
  for (const a of AMAZON_AISLES) expect(code).toContain(JSON.stringify(`/s?k=${encodeURIComponent(a.query)}&i=amazonfresh`))
})
