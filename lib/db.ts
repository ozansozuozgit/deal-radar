import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  client ??= createClient(url, key, { auth: { persistSession: false } })
  return client
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * PostgREST silently caps every select at 1000 rows, whatever `.limit()` says.
 * Page through with `.range()` until a short page (or `max` rows) comes back.
 * The query must have a stable `.order()` for pages not to overlap.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PageResult<T>,
  { pageSize = 1000, max = 20_000 }: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const out: T[] = []
  while (out.length < max) {
    const from = out.length
    const { data, error } = await page(from, Math.min(from + pageSize, max) - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return out
}
