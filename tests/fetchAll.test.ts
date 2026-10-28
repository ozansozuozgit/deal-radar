import { expect, test } from 'vitest'
import { fetchAll } from '@/lib/db'

const rows = Array.from({ length: 2500 }, (_, i) => i)
const pager = (calls: Array<[number, number]>) => (from: number, to: number) => {
  calls.push([from, to])
  return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
}

test('pages past the 1000-row cap until a short page', async () => {
  const calls: Array<[number, number]> = []
  expect(await fetchAll(pager(calls))).toEqual(rows)
  expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
})

test('stops at max', async () => {
  const calls: Array<[number, number]> = []
  expect(await fetchAll(pager(calls), { max: 1500 })).toHaveLength(1500)
  expect(calls).toEqual([[0, 999], [1000, 1499]])
})

test('surfaces errors', async () => {
  await expect(fetchAll(() => Promise.resolve({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
})
