// Stores that bring groceries to you, so distance doesn't apply (and radius never hides them).
const DELIVERY = new Set(['netcost'])

/** " · 0.4 mi" for a nearby store, " · delivery" for a delivery store. */
export function whereLabel(slug: string, miles: number | null): string {
  if (DELIVERY.has(slug)) return ' · delivery'
  return miles != null ? ` · ${miles} mi` : ''
}
