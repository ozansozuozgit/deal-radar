// NetCost isn't on Flipp and its shop only answers real browsers, so there is no scan for it:
// a bookmark run on the owner's own specials page (netcostBookmarklet) sends the week's
// specials to /api/import/netcost, and this turns them into ordinary deals. The same press
// then sends the whole catalog's regular prices, kept apart from deals (catalog_prices) so
// best price can compare against them without filling the feed with full-price items.
import { categorize } from '@/lib/parse/category'
import { canonicalize } from '@/lib/parse/canonical'
import { normalizeName } from '@/lib/parse/normalize'
import { parseSize, unitPrice, type Size } from '@/lib/parse/size'
import { comparablePrice } from '@/lib/ingest/upsert'
import type { DealInput, FlyerInput } from '@/lib/types'

export const NETCOST = {
  source: 'netcost',
  slug: 'netcost',
  name: 'NetCost Market',
  logo: 'https://d226b0iufwcjmj.cloudfront.net/retailers/1265/logo/1708721750580.png',
  specialsUrl: 'https://www.shop.netcostmarket.com/specials',
} as const

/** The fields the bookmark keeps from each special; the full feed is about 3.5 MB a week. */
export interface NetcostSpecial {
  id: number
  name: string
  tag?: string | null         // "Only $11.49/Lb"
  start?: string | null
  end?: string | null
  sale?: number | null        // sale price, per lb when weighable
  regular?: number | null
  weighable?: boolean | null
  weight?: number | null      // total package size, in `unit`
  unit?: string | null        // "Oz", "fl oz", "gram", "lb", "Liter", "Gallon", "quart", "ct", "pk"
  department?: string | null
  image?: string | null
}

const DEPARTMENTS: Record<string, string> = {
  'BAKERY DRY': 'bakery', 'BAKERY REFRIGERATED': 'bakery', 'BREAD FRESH BAKED': 'bakery',
  'BEAUTY AND PERSONAL CARE': 'personal-care', HOUSEHOLD: 'household',
  CAVIAR: 'seafood', 'FISH AND SEAFOOD FRESH': 'seafood', 'FISH SMOKED': 'seafood', HERRING: 'seafood',
  'COLD CUTS': 'meat', 'MEAT FRESH': 'meat', 'MEAT SMOKED': 'meat',
  DAIRY: 'dairy', 'DRIED FRUITS': 'snacks', FROZEN: 'frozen', 'FRUITS AND VEGETABLES': 'produce',
}

const GRAMS_PER_OZ = 28.3495
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** How many items a multipack holds, from names like "6 ct", "8pk", "4-Pack", "12 Bottles", "6x113g", "6 Banana & 6 Strawberry". */
export function packCount(name: string): number | null {
  const mixed = /^(\d+)\s.*(?:&|\band\b)\s*(\d+)\s/.exec(name)
  if (mixed) return Number(mixed[1]) + Number(mixed[2])
  const m = /(\d+)[\s-]*(?:ct|pk|packs?|count|bottles|cans|boxes)\b/i.exec(name) ?? /\b(\d+)\s*x\s*\d/i.exec(name)
  return m && Number(m[1]) > 1 ? Number(m[1]) : null
}

/**
 * The store's own size when it has one; many names only say "- 147g", which parseSize doesn't read.
 * A multipack's weight is often for one item while the price is for the pack, so packs compare per item.
 */
export function netcostSize(s: Pick<NetcostSpecial, 'name' | 'weight' | 'unit'>): Size | null {
  const pack = packCount(s.name)
  if (pack) return { qty: pack, unit: 'ct' }
  const grams = /(\d+(?:\.\d+)?)\s*(kg|g)\b/i.exec(s.name)
  const fromGrams: Size | null = grams
    ? { qty: round3((Number(grams[1]) * (grams[2].toLowerCase() === 'kg' ? 1000 : 1)) / GRAMS_PER_OZ), unit: 'oz' }
    : null
  // some solids are listed in fluid ounces; a name that says grams settles it
  if (fromGrams && s.unit?.toLowerCase() === 'fl oz') return fromGrams
  const qty = Number(s.weight)
  if (s.weight != null && qty > 0) {
    switch (s.unit?.toLowerCase()) {
      case 'oz': return { qty, unit: 'oz' }
      case 'fl oz': return { qty, unit: 'floz' }
      case 'gram': return { qty: round3(qty / GRAMS_PER_OZ), unit: 'oz' }
      case 'lb': return { qty, unit: 'lb' }
      case 'liter': return { qty, unit: 'l' }
      case 'ml': return { qty: round3(qty / 1000), unit: 'l' }
      case 'gallon': return { qty: qty * 128, unit: 'floz' }
      case 'quart': return { qty: qty * 32, unit: 'floz' }
      case 'ct': case 'pk': case 'pack': return { qty, unit: 'ct' }
    }
  }
  return fromGrams ?? parseSize(s.name)
}

// the feed has values like 2.4899999999999998
const cents = (n: number) => Math.round(n * 100) / 100

function salePrice(s: NetcostSpecial): number | null {
  if (typeof s.sale === 'number' && s.sale > 0) return cents(s.sale)
  const tagged = /\$(\d+(?:\.\d+)?)/.exec(s.tag ?? '')
  return tagged ? Number(tagged[1]) : null
}

// the store's aisle beats guessing from the name, except its catch-all GROCERY
function netcostCategory(name: string, department: string | null | undefined): string {
  const fromName = categorize(name)
  return DEPARTMENTS[department ?? ''] ?? (fromName === 'other' && department === 'GROCERY' ? 'pantry' : fromName)
}

const netcostImage = (image: string | null | undefined) =>
  image ? image.replace('{{size}}', 'medium').replace(/\{\{extension[^}]*\}\}/, 'jpg') : null

export function mapNetcostSpecial(s: NetcostSpecial): DealInput | null {
  if (!s.id || !s.name?.trim() || !s.start || !s.end) return null
  const price = salePrice(s)
  if (price == null) return null
  const name = s.name.trim()
  return {
    source: 'netcost',
    externalId: String(s.id),
    merchantSlug: NETCOST.slug,
    name,
    price,
    originalPrice: typeof s.regular === 'number' && cents(s.regular) > price ? cents(s.regular) : null,
    unit: s.weighable ? 'lb' : null,
    size: s.weighable ? null : netcostSize(s),
    category: netcostCategory(name, s.department),
    imageUrl: netcostImage(s.image),
    validFrom: s.start,
    validTo: s.end,
  }
}

export function mapNetcostImport(specials: NetcostSpecial[]): { flyer: FlyerInput; deals: DealInput[]; skipped: number } {
  const deals = specials.flatMap(s => mapNetcostSpecial(s) ?? [])
  const sorted = (dates: Array<string | null>) => dates.filter((d): d is string => !!d).sort()
  return {
    flyer: {
      source: 'netcost',
      externalId: 'specials',
      merchantSlug: NETCOST.slug,
      merchantName: NETCOST.name,
      title: 'Specials',
      validFrom: sorted(deals.map(d => d.validFrom))[0] ?? null,
      validTo: sorted(deals.map(d => d.validTo)).at(-1) ?? null,
    },
    deals,
    skipped: specials.length - deals.length,
  }
}

/** One product of the whole catalog, as the bookmark sends it: the specials' fields without the dates. */
export type NetcostProduct = Pick<NetcostSpecial, 'id' | 'name' | 'regular' | 'sale' | 'weighable' | 'weight' | 'unit' | 'department' | 'image'>

/** A row of catalog_prices: a product's everyday shelf price, which best price compares against. */
export interface CatalogPriceRow {
  source: string; external_id: string; merchant_slug: string; merchant_name: string
  name: string; normalized_name: string; canonical: string | null
  price: number; unit: string | null
  size_qty: number | null; size_unit: string | null; unit_price: number | null
  cmp_price: number | null; cmp_basis: string | null
  category: string; image_url: string | null
  last_seen: string
}

/** The everyday price: the regular one, or the shelf price when the store gives only that. */
function shelfPrice(p: NetcostProduct): number | null {
  for (const v of [p.regular, p.sale]) if (typeof v === 'number' && v > 0) return cents(v)
  return null
}

export function mapNetcostProduct(p: NetcostProduct, seen: string = new Date().toISOString()): CatalogPriceRow | null {
  if (!p.id || !p.name?.trim()) return null
  const price = shelfPrice(p)
  if (price == null) return null
  const name = p.name.trim()
  const size = p.weighable ? { qty: 1, unit: 'lb' as const } : netcostSize(p)
  return {
    source: NETCOST.source, external_id: String(p.id),
    merchant_slug: NETCOST.slug, merchant_name: NETCOST.name,
    name, normalized_name: normalizeName(name), canonical: canonicalize(name),
    price, unit: p.weighable ? 'lb' : null,
    size_qty: size?.qty ?? null, size_unit: size?.unit ?? null,
    unit_price: unitPrice(price, size),
    ...comparablePrice(price, size),
    category: netcostCategory(name, p.department),
    image_url: netcostImage(p.image),
    last_seen: seen,
  }
}

/** How many products the bookmark sends per request, to stay well under the host's body limit. */
export const CATALOG_BATCH = 2000

/**
 * What the bookmark runs on the specials page, using that page's own branch: first the
 * week's specials, exactly as before, then every product's regular price in batches.
 * The catalog's address isn't certain (NetCost can't be reached outside a browser), so it
 * tries the shop's usual product listings and, failing those, one the page itself loaded.
 */
export function netcostBookmarklet(importUrl: string, key: string): string {
  const code = `(async () => {
  if (!/netcostmarket\\.com$/.test(location.hostname)) return alert('Open the NetCost specials page first: ${NETCOST.specialsUrl}');
  const loaded = performance.getEntriesByType('resource').map(e => e.name);
  const seen = loaded.map(u => /retailers\\/(\\d+)\\/branches\\/(\\d+)/.exec(u)).filter(Boolean).pop();
  const retailer = seen ? seen[1] : '1265', branch = seen ? seen[2] : '1924';
  const base = '/v2/retailers/' + retailer + '/branches/' + branch;
  const send = async body => {
    const sent = await fetch(${JSON.stringify(importUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ${JSON.stringify(key)} }, body: JSON.stringify(body) });
    const out = await sent.json().catch(() => ({}));
    if (!sent.ok) throw new Error(out.error || 'Deal Radar answered ' + sent.status);
    return out;
  };
  const en = names => (names && (names[2] || Object.values(names)[0])) || {};
  const fields = (item, label) => {
    const prices = item.branch || (item.branches && item.branches[branch]) || {}, unit = item.unitOfMeasure && en(item.unitOfMeasure.names);
    return { name: label.name || label.long || label.short, sale: prices.salePrice, regular: prices.regularPrice, weighable: item.isWeighable, weight: item.weight, unit: typeof unit === 'string' ? unit : unit && unit.name, department: item.department && (item.department.name || en(item.department.names).name), image: item.image && item.image.url };
  };
  const title = document.title;
  let report;
  try {
    const now = new Date().toISOString();
    const filters = encodeURIComponent(JSON.stringify({ must: { lessThan: { startDate: now }, greaterThan: { endDate: now }, term: { displayOnWeb: true } } }));
    const sort = encodeURIComponent('{"id":"desc"}');
    const all = [];
    for (let from = 0; ; from += 100) {
      const res = await fetch(base + '/specials?appId=4&filters=' + filters + '&from=' + from + '&size=100&sort=' + sort, { credentials: 'include' });
      if (!res.ok) throw new Error('NetCost answered ' + res.status);
      const page = await res.json();
      all.push(...page.specials);
      if (!page.specials.length || all.length >= page.total) break;
    }
    const specials = all.map(s => {
      const label = en(s.names), item = s.item || {};
      return { ...fields(item, label), id: s.id, tag: label.promotionTag, start: s.startDate, end: s.endDate, name: label.name };
    });
    const out = await send({ branch, specials });
    report = out.imported + ' deals sent to Deal Radar' + (out.skipped ? ' (' + out.skipped + ' skipped)' : '') + '. Branch ' + branch + '.';
  } catch (e) { return alert('NetCost import failed: ' + e.message); }

  // the whole catalog: regular prices for best price
  try {
    const listOf = page => page && (Array.isArray(page.products) ? page.products : Array.isArray(page.items) ? page.items : null);
    const pageUrl = (url, from, size) => { const u = new URL(url, location.origin); u.searchParams.set('from', from); u.searchParams.set('size', size); return u.pathname + u.search; };
    const listing = loaded.filter(u => /\\/branches\\/\\d+\\/([\\w-]+\\/)*(products|items)\\b/.test(u)).map(u => {
      const x = new URL(u); for (const k of ['filters', 'categoryId', 'query', 'q']) x.searchParams.delete(k); return x.href;
    });
    const tries = [base + '/products?appId=4', base + '/items?appId=4', ...listing];
    let url = null, total = 0, first;
    for (const t of tries) {
      const res = await fetch(pageUrl(t, 0, 100), { credentials: 'include' }).catch(() => null);
      const page = res && res.ok ? await res.json().catch(() => null) : null;
      const list = listOf(page);
      if (list && list.length) { url = t; first = list; total = Number(page.total) || 0; break; }
    }
    if (!url) throw new Error('could not find the product list. Open any aisle, then press the bookmark again');
    const items = [...first];
    const max = Math.min(total || 40000, 40000);
    for (let from = 100; from < max; from += 400) {
      document.title = 'Reading NetCost ' + Math.min(from, max) + ' / ' + (total || '?');
      const pages = await Promise.all([0, 100, 200, 300].map(d => from + d < max
        ? fetch(pageUrl(url, from + d, 100), { credentials: 'include' }).then(r => (r.ok ? r.json() : null)).then(listOf).catch(() => null)
        : []));
      if (pages.some(p => p == null)) throw new Error('NetCost stopped answering after ' + items.length + ' products');
      pages.forEach(p => items.push(...p));
      if (pages.some(p => p.length < 100)) break;
    }
    const catalog = items.map(p => ({ ...fields(p, en(p.names)), id: p.productId || p.id })).filter(p => p.id && p.name);
    let saved = 0, skipped = 0;
    for (let i = 0; i < catalog.length; i += ${CATALOG_BATCH}) {
      document.title = 'Sending to Deal Radar ' + i + ' / ' + catalog.length;
      const out = await send({ branch, catalog: catalog.slice(i, i + ${CATALOG_BATCH}) });
      saved += out.saved || 0; skipped += out.skipped || 0;
    }
    report += ' ' + saved + ' regular prices sent' + (skipped ? ' (' + skipped + ' skipped)' : '') + '.';
  } catch (e) { report += ' Full catalog failed: ' + e.message + '.'; }
  document.title = title;
  alert(report);
})();`
  return `javascript:${encodeURIComponent(code)}`
}
