import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function stubStorage(failWrites: boolean) {
  const data = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { if (failWrites) throw new Error('QuotaExceededError'); data.set(k, v) },
      removeItem: (k: string) => { if (failWrites) throw new Error('SecurityError'); data.delete(k) },
    },
  })
  return data
}

test('round-trips through localStorage', async () => {
  const data = stubStorage(false)
  const { readJson, writeJson } = await import('@/lib/client/storage')
  writeJson('k', [1, 2])
  expect(data.get('k')).toBe('[1,2]')
  expect(readJson('k', [])).toEqual([1, 2])
})

test('keeps failed writes in memory so sequential updates are not lost', async () => {
  stubStorage(true)
  const { addListItem, loadList } = await import('@/lib/client/list')
  addListItem('milk')
  addListItem('eggs')
  expect(loadList().map(i => i.text)).toEqual(['milk', 'eggs'])
})

test('corrupt JSON falls back', async () => {
  const data = stubStorage(false)
  data.set('k', '{nope')
  const { readJson } = await import('@/lib/client/storage')
  expect(readJson('k', 'fallback')).toBe('fallback')
})
