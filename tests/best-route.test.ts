import { NextRequest } from 'next/server'
import { expect, test, vi } from 'vitest'
import { getServiceClient } from '@/lib/db'
import { GET } from '@/app/api/best/route'

vi.mock('@/lib/db', async orig => ({ ...(await orig<typeof import('@/lib/db')>()), getServiceClient: vi.fn() }))

// every query method chains; awaiting gives that table's rows
function db(tables: Record<string, { data: unknown[] | null; error: { message: string } | null }>) {
  return {
    from: (table: string) => {
      const result = tables[table] ?? { data: [], error: null }
      const q: Record<string, unknown> = new Proxy({}, {
        get: (_, k) => k === 'then' ? (f: (v: unknown) => unknown) => Promise.resolve(result).then(f) : () => q,
      })
      return q
    },
  }
}

const sale = { id: 9, name: 'Boneless Chicken Breast', merchant_slug: 'fairway', price: 3.99, unit: 'lb', flyers: { merchant_name: 'Fairway', external_id: 'f1' } }
const regular = { id: 4, source: 'netcost', external_id: '2', name: 'Chicken Breast', merchant_slug: 'netcost', merchant_name: 'NetCost Market', price: 4.99, unit: 'lb', cmp_price: 4.99, cmp_basis: 'lb' }
const get = () => GET(new NextRequest('http://test/api/best?q=chicken%20breast'))

test('best price lists a store by its regular price when the item is not on sale there', async () => {
  vi.mocked(getServiceClient).mockReturnValue(db({ deals: { data: [sale], error: null }, catalog_prices: { data: [regular], error: null } }) as never)
  const body = await (await get()).json()
  expect(body.stores.map((s: { slug: string; name: string; unitPrice: number }) => [s.slug, s.name, s.unitPrice]))
    .toEqual([['fairway', 'Fairway', 3.99], ['netcost', 'NetCost Market', 4.99]])
  expect(body.stores[1].deal).toMatchObject({ id: -4, regular: true, valid_to: null, flyer_external_id: 'catalog' })
})

test('without the catalog table, best price carries on with deals', async () => {
  vi.mocked(getServiceClient).mockReturnValue(db({ deals: { data: [sale], error: null }, catalog_prices: { data: null, error: { message: 'relation "catalog_prices" does not exist' } } }) as never)
  const res = await get()
  expect(res.status).toBe(200)
  expect((await res.json()).stores.map((s: { slug: string }) => s.slug)).toEqual(['fairway'])
})
