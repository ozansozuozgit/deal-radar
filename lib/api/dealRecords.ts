import type { SupabaseClient } from '@supabase/supabase-js'

export const DEAL_SELECT = '*, flyers!inner(merchant_name, external_id)'

/** Flatten the flyer join and attach store distance/logo, as the feed expects. */
export async function toDealRecords<T extends Record<string, unknown>>(db: SupabaseClient, rows: T[]) {
  const { data: stores } = await db.from('stores').select('slug, distance_miles, logo_url')
  const bySlug = new Map((stores ?? []).map(s => [s.slug, s]))
  return rows.map(d => {
    const flyer = (d as { flyers?: { merchant_name?: string; external_id?: string } }).flyers
    const slug = d.merchant_slug as string
    return {
      ...d,
      merchant_name: flyer?.merchant_name ?? slug,
      flyer_external_id: flyer?.external_id ?? null,
      distance_miles: bySlug.get(slug)?.distance_miles ?? null,
      merchant_logo: bySlug.get(slug)?.logo_url ?? null,
      flyers: undefined,
    }
  })
}
