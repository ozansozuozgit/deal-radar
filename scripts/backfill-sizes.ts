// One-off: re-read package sizes for stored deals after a parser fix (2026-11-02: fluid
// ounces became their own unit priced per gallon, and "1/2 Gal." stopped reading as 2 gal;
// then "oz" on liquid products such as milk became fluid ounces).
// Usage: npx tsx scripts/backfill-sizes.ts [--write]   (dry run without --write)
import 'dotenv/config'
import { fetchAll, getServiceClient } from '@/lib/db'
import { comparablePrice } from '@/lib/ingest/upsert'
import { asLiquid, parseSize, unitPrice } from '@/lib/parse/size'

interface Row {
  id: number; source: string; name: string; description: string | null; unit: string | null; price: number | null; canonical: string | null
  size_qty: number | null; size_unit: string | null; unit_price: number | null; cmp_price: number | null; cmp_basis: string | null
}

async function main() {
  const write = process.argv.includes('--write')
  const db = getServiceClient()
  const rows = await fetchAll<Row>((from, to) => db.from('deals')
    .select('id, source, name, description, unit, price, canonical, size_qty, size_unit, unit_price, cmp_price, cmp_basis')
    .order('id').range(from, to), { max: 500_000 })
  const changes: Array<{ id: number; patch: Partial<Row> }> = []
  for (const r of rows) {
    if (r.source === 'netcost') continue // sized by the store's own data, not the name
    // same rule as dealRow: per-lb deals are unit-priced already
    const size = r.unit === 'lb' ? { qty: 1, unit: 'lb' as const } : asLiquid(parseSize(`${r.name} ${r.description ?? ''}`), r.canonical)
    const next = {
      size_qty: size?.qty ?? null, size_unit: size?.unit ?? null,
      unit_price: unitPrice(r.price, size), ...comparablePrice(r.price, size),
    }
    const same = Number(next.size_qty) === Number(r.size_qty) && next.size_unit === r.size_unit
      && Number(next.unit_price) === Number(r.unit_price) && Number(next.cmp_price) === Number(r.cmp_price)
      && next.cmp_basis === r.cmp_basis
    if (!same) changes.push({ id: r.id, patch: next })
  }
  const byUnit = new Map<string, number>()
  for (const c of changes) byUnit.set(`${c.patch.size_unit}/${c.patch.cmp_basis}`, (byUnit.get(`${c.patch.size_unit}/${c.patch.cmp_basis}`) ?? 0) + 1)
  console.log(`${rows.length} deals read, ${changes.length} would change:`, Object.fromEntries(byUnit))
  if (process.argv.includes('--sample')) {
    const byId = new Map(rows.map(r => [r.id, r]))
    const shown = new Map<string, number>()
    for (const c of changes) {
      const k = `${c.patch.size_unit}/${c.patch.cmp_basis}`
      if ((shown.get(k) ?? 0) >= 4) continue
      shown.set(k, (shown.get(k) ?? 0) + 1)
      const r = byId.get(c.id)!
      console.log(`${k} | ${r.name} | ${r.description ?? ''} | ${r.size_qty} ${r.size_unit} -> ${c.patch.size_qty} ${c.patch.size_unit} | cmp ${r.cmp_price} -> ${c.patch.cmp_price}`)
    }
  }
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
