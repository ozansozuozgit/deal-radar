// NetCost isn't on Flipp and its shop only answers real browsers, so there is no scan for it:
// a bookmark run on the owner's own specials page (netcostBookmarklet) sends the week's
// specials to /api/import/netcost, and this turns them into ordinary deals.
import { categorize } from '@/lib/parse/category'
import { parseSize, type Size } from '@/lib/parse/size'
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

/** The store's own size when it has one; many names only say "- 147g", which parseSize doesn't read. */
export function netcostSize(s: Pick<NetcostSpecial, 'name' | 'weight' | 'unit'>): Size | null {
  const qty = Number(s.weight)
  if (s.weight != null && qty > 0) {
    switch (s.unit?.toLowerCase()) {
      case 'oz': return { qty, unit: 'oz' }
      case 'fl oz': return { qty, unit: 'floz' }
      case 'gram': return { qty: round3(qty / GRAMS_PER_OZ), unit: 'oz' }
      case 'lb': return { qty, unit: 'lb' }
      case 'liter': return { qty, unit: 'l' }
      case 'gallon': return { qty: qty * 128, unit: 'floz' }
      case 'quart': return { qty: qty * 32, unit: 'floz' }
      case 'ct': case 'pk': return { qty, unit: 'ct' }
    }
  }
  const grams = /(\d+(?:\.\d+)?)\s*(kg|g)\b/i.exec(s.name)
  if (grams) return { qty: round3((Number(grams[1]) * (grams[2].toLowerCase() === 'kg' ? 1000 : 1)) / GRAMS_PER_OZ), unit: 'oz' }
  return parseSize(s.name)
}

// the feed has values like 2.4899999999999998
const cents = (n: number) => Math.round(n * 100) / 100

function salePrice(s: NetcostSpecial): number | null {
  if (typeof s.sale === 'number' && s.sale > 0) return cents(s.sale)
  const tagged = /\$(\d+(?:\.\d+)?)/.exec(s.tag ?? '')
  return tagged ? Number(tagged[1]) : null
}

export function mapNetcostSpecial(s: NetcostSpecial): DealInput | null {
  if (!s.id || !s.name?.trim() || !s.start || !s.end) return null
  const price = salePrice(s)
  if (price == null) return null
  const name = s.name.trim()
  const fromName = categorize(name)
  return {
    source: 'netcost',
    externalId: String(s.id),
    merchantSlug: NETCOST.slug,
    name,
    price,
    originalPrice: typeof s.regular === 'number' && cents(s.regular) > price ? cents(s.regular) : null,
    unit: s.weighable ? 'lb' : null,
    size: s.weighable ? null : netcostSize(s),
    // the store's aisle beats guessing from the name, except its catch-all GROCERY
    category: DEPARTMENTS[s.department ?? ''] ?? (fromName === 'other' && s.department === 'GROCERY' ? 'pantry' : fromName),
    imageUrl: s.image ? s.image.replace('{{size}}', 'medium').replace(/\{\{extension[^}]*\}\}/, 'jpg') : null,
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

/** What the bookmark runs on the specials page, using that page's own branch. */
export function netcostBookmarklet(importUrl: string, key: string): string {
  const code = `(async () => {
  if (!/netcostmarket\\.com$/.test(location.hostname)) return alert('Open the NetCost specials page first: ${NETCOST.specialsUrl}');
  const seen = performance.getEntriesByType('resource').map(e => /retailers\\/(\\d+)\\/branches\\/(\\d+)/.exec(e.name)).filter(Boolean).pop();
  const retailer = seen ? seen[1] : '1265', branch = seen ? seen[2] : '1924';
  const now = new Date().toISOString();
  const filters = encodeURIComponent(JSON.stringify({ must: { lessThan: { startDate: now }, greaterThan: { endDate: now }, term: { displayOnWeb: true } } }));
  const sort = encodeURIComponent('{"id":"desc"}');
  const all = [];
  try {
    for (let from = 0; ; from += 100) {
      const res = await fetch('/v2/retailers/' + retailer + '/branches/' + branch + '/specials?appId=4&filters=' + filters + '&from=' + from + '&size=100&sort=' + sort, { credentials: 'include' });
      if (!res.ok) throw new Error('NetCost answered ' + res.status);
      const page = await res.json();
      all.push(...page.specials);
      if (!page.specials.length || all.length >= page.total) break;
    }
    const specials = all.map(s => {
      const label = (s.names && (s.names[2] || Object.values(s.names)[0])) || {}, item = s.item || {}, prices = item.branch || {}, unit = item.unitOfMeasure && item.unitOfMeasure.names;
      return { id: s.id, name: label.name, tag: label.promotionTag, start: s.startDate, end: s.endDate, sale: prices.salePrice, regular: prices.regularPrice, weighable: item.isWeighable, weight: item.weight, unit: unit && unit[2], department: item.department && item.department.name, image: item.image && item.image.url };
    });
    const sent = await fetch(${JSON.stringify(importUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ${JSON.stringify(key)} }, body: JSON.stringify({ branch, specials }) });
    const out = await sent.json().catch(() => ({}));
    if (!sent.ok) throw new Error(out.error || 'Deal Radar answered ' + sent.status);
    alert(out.imported + ' deals sent to Deal Radar' + (out.skipped ? ' (' + out.skipped + ' skipped)' : '') + '. Branch ' + branch + '.');
  } catch (e) { alert('NetCost import failed: ' + e.message); }
})();`
  return `javascript:${encodeURIComponent(code)}`
}
