import { fetchAll, getServiceClient } from '@/lib/db'
import { matchesForItem, pricePerLb, type CompareDeal } from '@/lib/compare'

export interface WatchRow { device_id: string; term: string; max_price: number | null; price_basis?: string | null }
export type AlertDeal = CompareDeal & { id?: number; source: string; external_id: string }
interface SubRow { device_id: string; subscription: unknown; list_code?: string | null }

// Deals run about a week, so a dedupe key older than this can't match a live deal again
const NOTIFIED_RETENTION_DAYS = 30

export interface Alert { deviceId: string; term: string; dedupeKey: string; deal: AlertDeal }

export function dedupeKey(term: string, deal: { source: string; external_id: string }): string {
  return `${term}:${deal.source}:${deal.external_id}`
}

/** Does this deal meet the watch's target price ("under $X" or "under $X/lb")? */
export function meetsTarget(w: Pick<WatchRow, 'max_price' | 'price_basis'>, d: AlertDeal): boolean {
  if (d.price == null) return false
  if (w.max_price == null) return true
  if (w.price_basis === 'lb') {
    const perLb = pricePerLb(d)
    return perLb != null && perLb <= w.max_price
  }
  return d.price <= w.max_price
}

/**
 * Watches owned by a list ("list:CODE") fan out to every device subscribed with that
 * code; device-owned watches stay with their device.
 */
export function expandWatches(watches: WatchRow[], subs: SubRow[]): WatchRow[] {
  const byCode = new Map<string, string[]>()
  for (const s of subs) {
    if (!s.list_code) continue
    byCode.set(s.list_code, [...(byCode.get(s.list_code) ?? []), s.device_id])
  }
  const devices = new Set(subs.map(s => s.device_id))
  return watches.flatMap(w => w.device_id.startsWith('list:')
    ? (byCode.get(w.device_id.slice(5)) ?? []).map(device_id => ({ ...w, device_id }))
    : devices.has(w.device_id) ? [w] : [])
}

/** Pure: compute which alerts to send for the given watches/deals, minus already-notified keys. */
export function computeAlerts(
  watches: WatchRow[],
  deals: AlertDeal[],
  alreadyNotified: Set<string>,
): Alert[] {
  const alerts: Alert[] = []
  const seen = new Set(alreadyNotified)
  for (const w of watches) {
    const match = matchesForItem(w.term, deals).find(d => meetsTarget(w, d))
    if (!match) continue
    const key = dedupeKey(w.term, match)
    // a device can hold the same term twice (its own watch and its list's): alert once
    if (seen.has(`${w.device_id}:${key}`)) continue
    seen.add(`${w.device_id}:${key}`)
    alerts.push({ deviceId: w.device_id, term: w.term, dedupeKey: key, deal: match })
  }
  return alerts
}

export function alertMessage(a: Alert): { title: string; body: string; url: string } {
  const perLb = a.deal.unit !== 'lb' ? pricePerLb(a.deal) : null
  return {
    title: `${a.deal.name} — $${a.deal.price!.toFixed(2)}${a.deal.unit === 'lb' ? '/lb' : ''}`,
    body: `Your watched "${a.term}" is on sale at ${a.deal.merchant_name}${perLb != null ? ` ($${perLb.toFixed(2)}/lb)` : ''}`,
    url: a.deal.id != null ? `/?deal=${a.deal.id}` : '/',
  }
}

export async function sendWatchAlerts(): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) { console.log('[notify] VAPID keys not set — skipping'); return }
  const db = getServiceClient()

  const [{ data: subs }, { data: watches }] = await Promise.all([
    db.from('push_subscriptions').select('device_id, subscription, list_code'),
    db.from('watches').select('device_id, term, max_price, price_basis'),
  ])
  if (!subs?.length || !watches?.length) { console.log('[notify] nothing to do'); return }
  const subByDevice = new Map((subs as SubRow[]).map(s => [s.device_id, s.subscription]))
  const activeWatches = expandWatches(watches as WatchRow[], subs as SubRow[])
  if (!activeWatches.length) { console.log('[notify] no watches with subscriptions'); return }

  const now = new Date().toISOString()
  const deals = await fetchAll<Record<string, unknown>>((from, to) => db.from('deals')
    .select('id, name, normalized_name, merchant_slug, price, unit, size_qty, size_unit, source, external_id')
    .not('price', 'is', null).lte('valid_from', now).gte('valid_to', now)
    .order('id').range(from, to))
  // merchant display names
  const { data: stores } = await db.from('stores').select('slug, name')
  const storeName = new Map((stores ?? []).map(s => [s.slug, s.name]))
  const alertDeals: AlertDeal[] = deals.map(d => ({
    ...(d as unknown as AlertDeal),
    merchant_name: storeName.get((d as { merchant_slug: string }).merchant_slug) ?? (d as { merchant_slug: string }).merchant_slug,
  }))

  const cutoff = new Date(Date.now() - NOTIFIED_RETENTION_DAYS * 86_400_000).toISOString()
  const { error: pruneErr } = await db.from('notified').delete().lt('created_at', cutoff)
  if (pruneErr) console.error('[notify] prune failed:', pruneErr.message)
  const devices = [...new Set(activeWatches.map(w => w.device_id))]
  const notified = await fetchAll<{ device_id: string; dedupe_key: string }>((from, to) => db.from('notified')
    .select('device_id, dedupe_key').in('device_id', devices)
    .order('device_id').order('dedupe_key').range(from, to))
  const seen = new Set(notified.map(n => `${n.device_id}:${n.dedupe_key}`))

  const alerts = computeAlerts(activeWatches, alertDeals, seen)
  if (!alerts.length) { console.log('[notify] no new alerts'); return }

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(process.env.VAPID_CONTACT ?? 'mailto:admin@example.com', pub, priv)

  let sent = 0
  for (const a of alerts) {
    const sub = subByDevice.get(a.deviceId)
    const msg = alertMessage(a)
    try {
      await webpush.sendNotification(sub as never, JSON.stringify({ ...msg, tag: a.dedupeKey }))
      await db.from('notified').upsert({ device_id: a.deviceId, dedupe_key: a.dedupeKey, ...msg })
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('device_id', a.deviceId)
        console.log(`[notify] pruned dead subscription ${a.deviceId}`)
      } else {
        console.error('[notify] send failed:', e)
      }
    }
  }
  console.log(`[notify] sent ${sent}/${alerts.length} alerts`)
}
