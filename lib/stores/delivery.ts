// Stores that bring groceries to you, so distance doesn't apply (and radius never hides them).
const DELIVERY = new Set(['netcost', 'amazon-grocery'])

export function isDeliveryStore(slug: string): boolean { return DELIVERY.has(slug) }

/**
 * Your stores out of the ones available here. Picks are an allow-list, so a delivery store added
 * later would never appear; those stay on until you untick them. No picks, or none left, means all.
 */
export function myStores<T extends { slug: string }>(stores: T[], enabled: string[] | null, deliveryOff: string[] = []): T[] {
  if (!enabled) return stores.filter(s => !deliveryOff.includes(s.slug))
  const picked = stores.filter(s => enabled.includes(s.slug) || (isDeliveryStore(s.slug) && !deliveryOff.includes(s.slug)))
  return picked.length ? picked : stores
}

/** The delivery stores you've unticked, after toggling `slug` to the state in `mine`. */
export function nextDeliveryOff(slug: string, mine: string[], deliveryOff: string[] = []): string[] {
  if (!isDeliveryStore(slug)) return deliveryOff
  return mine.includes(slug) ? deliveryOff.filter(s => s !== slug) : [...deliveryOff.filter(s => s !== slug), slug]
}

/** " · 0.4 mi" for a nearby store, " · delivery" for a delivery store. */
export function whereLabel(slug: string, miles: number | null): string {
  if (DELIVERY.has(slug)) return ' · delivery'
  return miles != null ? ` · ${miles} mi` : ''
}
