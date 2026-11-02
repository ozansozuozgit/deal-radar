// oz is weight; floz is volume (fluid ounces, and gallons, quarts and pints converted to them)
export interface Size { qty: number; unit: 'oz' | 'floz' | 'lb' | 'l' | 'ct' }

// a small fraction ("1/2 Gal.", "3/4 lb") or a number, optionally a range ("10.7 to 14.7")
const NUM = String.raw`(?<![\d.])[1-7]\/[2348](?!\d)|\d+(?:\.\d+)?`
const SIZE_RE = new RegExp(String.raw`(${NUM})(?:\s*(?:to|–|-)\s*(${NUM}))?[\s-]*(fl\.?[\s-]*)?(oz|lbs?|liters?|litres?|ml|ct|count|pks?|packs?|gallons?|gal|quarts?|qt|pints?|l)\b`, 'i')

function num(s: string): number {
  const [a, b] = s.split('/')
  return b ? Number(a) / Number(b) : Number(a)
}

export function parseSize(text: string | null | undefined): Size | null {
  if (!text) return null
  if (/half[\s-]+gal/i.test(text)) return { qty: 64, unit: 'floz' }
  const m = SIZE_RE.exec(text)
  if (!m) return null
  const qty = round3(Math.max(num(m[1]), m[2] ? num(m[2]) : 0))
  if (!Number.isFinite(qty) || qty <= 0) return null
  const raw = m[4].toLowerCase()
  if (raw === 'oz') return { qty, unit: m[3] ? 'floz' : 'oz' }
  if (raw.startsWith('lb')) return { qty, unit: 'lb' }
  if (raw.startsWith('liter') || raw.startsWith('litre') || raw === 'l') return { qty, unit: 'l' }
  if (raw === 'ml') return { qty: round3(qty / 1000), unit: 'l' }
  if (raw === 'ct' || raw === 'count' || raw.startsWith('pk') || raw.startsWith('pack')) return { qty, unit: 'ct' }
  if (raw.startsWith('gal')) return { qty: qty * 128, unit: 'floz' }
  if (raw.startsWith('quart') || raw === 'qt') return { qty: qty * 32, unit: 'floz' }
  if (raw.startsWith('pint')) return { qty: qty * 16, unit: 'floz' }
  return null
}

// products sold by volume, where flyers often write "64 oz." without "fl"
const LIQUIDS = new Set(['milk', 'oat milk', 'almond milk', 'half and half', 'heavy cream', 'coffee creamer',
  'orange juice', 'juice', 'sparkling water', 'water', 'soda', 'olive oil', 'cooking oil'])

/** A weight-ounce size on a liquid product is really fluid ounces. */
export function asLiquid(size: Size | null, canonical: string | null | undefined): Size | null {
  return size?.unit === 'oz' && canonical && LIQUIDS.has(canonical) ? { ...size, unit: 'floz' } : size
}

export function unitPrice(price: number | null | undefined, size: Size | null | undefined): number | null {
  if (price == null || !size || size.qty <= 0) return null
  return Math.round((price / size.qty) * 100) / 100
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }
