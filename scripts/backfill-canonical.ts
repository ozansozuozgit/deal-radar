// One-off: move stored deals off "milk" and "water" after the dictionary stopped filing
// condensed milk, ricotta, water crackers and the like under them (2026-11-02). Sizes are
// re-read too, because "oz" on milk or water means fluid ounces.
// Usage: DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-canonical.ts [--sample] [--write]   (dry run without --write)
import 'dotenv/config'
import { fetchAll, getServiceClient } from '@/lib/db'
import { comparablePrice } from '@/lib/ingest/upsert'
import { canonicalize } from '@/lib/parse/canonical'
import { asLiquid, parseSize, unitPrice } from '@/lib/parse/size'

interface Row { id: number; source: string; name: string; description: string | null; unit: string | null; price: number | null; canonical: string }

async function main() {
  const write = process.argv.includes('--write')
  const db = getServiceClient()
  const rows = await fetchAll<Row>((from, to) => db.from('deals')
    .select('id, source, name, description, unit, price, canonical')
    .in('canonical', ['milk', 'water']).order('id').range(from, to), { max: 200_000 })
  const changes = rows.flatMap(r => {
    const canonical = canonicalize(r.name)
    if (canonical === r.canonical) return []
    // NetCost's sizes come from the store, and its next import rewrites them
    if (r.source === 'netcost' || r.unit === 'lb') return [{ id: r.id, name: r.name, from: r.canonical, patch: { canonical } as Record<string, unknown> }]
    const size = asLiquid(parseSize(`${r.name} ${r.description ?? ''}`), canonical)
    return [{
      id: r.id, name: r.name, from: r.canonical,
      patch: {
        canonical, size_qty: size?.qty ?? null, size_unit: size?.unit ?? null,
        unit_price: unitPrice(r.price, size), ...comparablePrice(r.price, size),
      } as Record<string, unknown>,
    }]
  })
  const byMove = new Map<string, number>()
  for (const c of changes) { const k = `${c.from} -> ${c.patch.canonical}`; byMove.set(k, (byMove.get(k) ?? 0) + 1) }
  console.log(`${rows.length} deals read, ${changes.length} would change:`, Object.fromEntries(byMove))
  if (process.argv.includes('--sample')) for (const c of changes.slice(0, 25)) console.log(`${c.name} | ${c.from} -> ${c.patch.canonical}`)
  if (!write) return
  let done = 0, failed = 0
  const queue = [...changes]
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const { error } = await db.from('deals').update(c.patch).eq('id', c.id)
      if (error) { failed++; console.error(c.id, error.message) } else done++
    }
  }))
  console.log(`updated ${done}, failed ${failed}`)
}
main()
