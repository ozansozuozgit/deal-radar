import { normalizeName } from '@/lib/parse/normalize'
import { canonicalize } from '@/lib/parse/canonical'
import { parseSize, unitPrice, type Size } from '@/lib/parse/size'
import type { DealInput, FlyerInput } from '@/lib/types'

export function flyerRow(f: FlyerInput) {
  return {
    source: f.source, external_id: f.externalId,
    merchant_slug: f.merchantSlug, merchant_name: f.merchantName,
    title: f.title, valid_from: f.validFrom, valid_to: f.validTo,
    last_seen: new Date().toISOString(),
  }
}

/** A price that compares across package sizes: per lb for weights, per item for counts. */
export function comparablePrice(price: number | null | undefined, size: Size | null): { cmp_price: number | null; cmp_basis: string | null } {
  if (price == null || price <= 0) return { cmp_price: null, cmp_basis: null }
  const r = (n: number) => Math.round(n * 100) / 100
  if (size?.unit === 'lb') return { cmp_price: r(price / size.qty), cmp_basis: 'lb' }
  if (size?.unit === 'oz') return { cmp_price: r((price / size.qty) * 16), cmp_basis: 'lb' }
  if (size?.unit === 'ct') return { cmp_price: r(price / size.qty), cmp_basis: 'ct' }
  return { cmp_price: price, cmp_basis: 'ea' }
}

export function dealRow(d: DealInput, flyerId: number) {
  // per-lb deals ARE unit-priced already; otherwise parse a package size
  const size = d.unit === 'lb'
    ? { qty: 1, unit: 'lb' as const }
    : parseSize(`${d.name} ${d.description ?? ''}`)
  return {
    size_qty: size?.qty ?? null,
    size_unit: size?.unit ?? null,
    unit_price: unitPrice(d.price ?? null, size),
    ...comparablePrice(d.price, size),
    // the dictionary's answer; ingest fills the rest from the Gemini cache afterwards
    canonical: canonicalize(d.name),
    flyer_id: flyerId, source: d.source, external_id: d.externalId,
    merchant_slug: d.merchantSlug, name: d.name,
    normalized_name: normalizeName(d.name),
    description: d.description ?? null,
    price: d.price ?? null, original_price: d.originalPrice ?? null,
    prime_price: d.primePrice ?? null, unit: d.unit ?? null,
    price_text: d.priceText ?? null, sale_story: d.saleStory ?? null,
    category: d.category, image_url: d.imageUrl ?? null, crop: d.crop ?? null,
    valid_from: d.validFrom, valid_to: d.validTo,
    last_seen: new Date().toISOString(),
  }
}

/**
 * Postgres rejects an upsert batch that touches the same conflict key twice
 * ("ON CONFLICT DO UPDATE command cannot affect row a second time"), and flyer feeds
 * do repeat items. Keep the last occurrence of each key.
 */
export function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  return [...new Map(rows.map(r => [key(r), r])).values()]
}

/** Split into batches so one huge flyer doesn't hit request-size or statement timeouts. */
export function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}
