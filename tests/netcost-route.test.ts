import { readFileSync } from 'fs'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getServiceClient } from '@/lib/db'
import { OPTIONS, POST } from '@/app/api/import/netcost/route'

vi.mock('@/lib/db', () => ({ getServiceClient: vi.fn() }))

const sample = JSON.parse(readFileSync('fixtures/netcost-specials-sample.json', 'utf8'))
const URL = 'http://test/api/import/netcost'
const NETCOST = 'https://www.shop.netcostmarket.com'
const post = (body: unknown, { key = 'right', url = URL } = {}) => POST(new NextRequest(url, {
  method: 'POST', body: JSON.stringify(body),
  headers: { Authorization: `Bearer ${key}`, Origin: NETCOST },
}))

// records each upsert by table, in order
let writes: Array<{ table: string; rows: unknown; onConflict?: string }>
beforeEach(() => {
  vi.stubEnv('IMPORT_KEY', 'right')
  writes = []
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => ({
      upsert: (rows: unknown, opts: { onConflict?: string }) => {
        writes.push({ table, rows, onConflict: opts?.onConflict })
        const done = { error: null }
        return { ...done, then: (f: (v: typeof done) => unknown) => Promise.resolve(done).then(f), select: () => ({ single: async () => ({ data: { id: 77 }, error: null }) }) }
      },
    }),
  } as never)
})
afterEach(() => vi.unstubAllEnvs())

test('stores the store, the flyer and the deals, in that order', async () => {
  const res = await post({ branch: '1924', specials: sample })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ imported: sample.length, skipped: 0 })
  expect(writes.map(w => w.table)).toEqual(['stores', 'flyers', 'deals'])
  expect(writes[0]).toMatchObject({ onConflict: 'source,slug', rows: { source: 'netcost', slug: 'netcost', name: 'NetCost Market' } })
  expect(writes[0].rows).not.toHaveProperty('distance_miles')
  expect(writes[1]).toMatchObject({ onConflict: 'source,external_id', rows: { source: 'netcost', external_id: 'specials', merchant_slug: 'netcost' } })
  const deals = writes[2].rows as Array<Record<string, unknown>>
  expect(writes[2].onConflict).toBe('source,external_id')
  expect(deals).toHaveLength(sample.length)
  expect(deals[0]).toMatchObject({ flyer_id: 77, source: 'netcost', merchant_slug: 'netcost', external_id: '1001', price: 0.99 })
})

test('a dry run stores nothing', async () => {
  const res = await post({ specials: sample }, { url: `${URL}?dry=1` })
  expect((await res.json()).imported).toBe(sample.length)
  expect(writes).toEqual([])
})

test('a wrong key stores nothing, and the browser can read why', async () => {
  const res = await post({ specials: sample }, { key: 'wrong' })
  expect(res.status).toBe(401)
  expect(res.headers.get('access-control-allow-origin')).toBe(NETCOST)
  expect(writes).toEqual([])
})

test('with no key set up, nothing can be imported', async () => {
  vi.stubEnv('IMPORT_KEY', '')
  expect((await post({ specials: sample })).status).toBe(501)
  expect(writes).toEqual([])
})

test('only NetCost pages may call it from a browser', () => {
  const ask = (origin: string) => OPTIONS(new NextRequest(URL, { method: 'OPTIONS', headers: { Origin: origin } }))
    .headers.get('access-control-allow-origin')
  expect(ask(NETCOST)).toBe(NETCOST)
  expect(ask('https://shop.netcostmarket.com')).toBe('https://shop.netcostmarket.com')
  expect(ask('https://shop.netcostmarket.com.evil.example')).toBeNull()
  expect(ask('https://example.com')).toBeNull()
})
