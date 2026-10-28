// Shopping-list quantities: "2 lb chicken breast", "3 avocados", "milk x2", "500g feta".

export type QtyUnit = 'lb' | 'oz' | 'kg' | 'g' | 'gal' | 'l' | 'ml'

export interface ParsedItem { text: string; qty: number; unit: QtyUnit | null }

const UNIT_ALIASES: Record<string, QtyUnit> = {
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  ml: 'ml',
}

// a number, then either a unit glued on ("500g"), or "x"/"×", or a space
const LEADING = /^(\d+(?:\.\d+)?|½|¼|¾)(?:([a-z]+)\s+|\s*[x×]\s+|\s+)(.+)$/i
const TRAILING = /^(.*?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)$/i
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 }

/** Split a typed list entry into the thing to buy and how much of it. */
export function parseItem(raw: string): ParsedItem {
  const input = raw.trim().replace(/\s+/g, ' ')
  const lead = LEADING.exec(input)
  if (lead) {
    const qty = FRACTIONS[lead[1]] ?? Number(lead[1])
    let unit: QtyUnit | null = null
    let rest = lead[3]
    if (lead[2]?.toLowerCase() === 'x') {
      // "2x milk"
    } else if (lead[2]) {
      // glued letters must be a unit ("500g"), otherwise this isn't a quantity ("7up")
      unit = UNIT_ALIASES[lead[2].toLowerCase()] ?? null
      if (!unit) rest = ''
    } else {
      const [first, ...others] = rest.split(' ')
      const asUnit = UNIT_ALIASES[first.toLowerCase()]
      if (asUnit && others.length) { unit = asUnit; rest = others.join(' ') }
    }
    rest = rest.replace(/^of\s+/i, '').trim()
    if (rest && qty > 0 && qty < 1000) return { text: rest, qty, unit }
  }
  const trail = TRAILING.exec(input)
  if (trail && trail[1]) {
    const qty = Number(trail[2])
    if (qty > 0 && qty < 1000) return { text: trail[1].trim(), qty, unit: null }
  }
  return { text: input, qty: 1, unit: null }
}

/** "2 lb", "3×", "" for a plain single item. */
export function formatQty(qty: number, unit: QtyUnit | string | null): string {
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100)
  if (unit) return `${n} ${unit}`
  return qty === 1 ? '' : `${n}×`
}

/** Sensible +/- step for a quantity in this unit. */
export function qtyStep(unit: QtyUnit | string | null): number {
  if (unit === 'lb' || unit === 'kg' || unit === 'gal' || unit === 'l') return 0.5
  if (unit === 'oz') return 4
  if (unit === 'g' || unit === 'ml') return 100
  return 1
}

// Everything converts to ounces (weight and fluid share "oz" in deal sizes, as in
// lib/parse/size.ts), or liters for metric volume.
export function toOz(qty: number, unit: QtyUnit): { amount: number; base: 'oz' | 'l' } {
  switch (unit) {
    case 'lb': return { amount: qty * 16, base: 'oz' }
    case 'oz': return { amount: qty, base: 'oz' }
    case 'kg': return { amount: qty * 35.274, base: 'oz' }
    case 'g': return { amount: qty / 28.3495, base: 'oz' }
    case 'gal': return { amount: qty * 128, base: 'oz' }
    case 'l': return { amount: qty, base: 'l' }
    case 'ml': return { amount: qty / 1000, base: 'l' }
  }
}
