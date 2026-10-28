// Weekly digest: one push when the new flyers land, summarizing what matters this week.
import { getServiceClient } from '@/lib/db'
import { compareList, type CompareItem } from '@/lib/compare'
import { activeDeals, forYouFor, loadProfile } from '@/lib/api/forYouServer'
import type { ForYouDeal, ForYouPick } from '@/lib/foryou'

const NEW_FLYERS_FOR_NEW_WEEK = 3

/** "2026-W44": one digest per ISO week. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((+t - +yearStart) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function digestMessage(picks: Array<ForYouPick<ForYouDeal>>, list: { store: string; total: number; savings: number; covered: number; of: number } | null) {
  const parts: string[] = []
  const personal = picks.filter(p => p.reason !== 'great').length
  if (personal) parts.push(`${personal} deal${personal === 1 ? '' : 's'} on things you buy`)
  if (list && list.covered) {
    parts.push(`your list: $${list.total.toFixed(2)} at ${list.store}${list.savings > 0 ? ` (save $${list.savings.toFixed(2)})` : ''}`)
  }
  const great = picks.find(p => p.deal.price_verdict === 'great')
  if (great) {
    parts.push(`great price: ${great.deal.name} $${great.deal.price!.toFixed(2)}${great.deal.unit === 'lb' ? '/lb' : ''} at ${great.deal.merchant_name}`)
  }
  if (!parts.length) return null
  return { title: '🗞️ This week’s deals are in', body: parts.join(' · '), url: '/?foryou=1' }
}

export async function sendWeeklyDigest({ force = false } = {}): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) { console.log('[digest] VAPID keys not set — skipping'); return }
  const db = getServiceClient()

  // only when a new flyer week has started (most chains roll over mid-week)
  const since = new Date(Date.now() - 30 * 3_600_000).toISOString()
  const { count } = await db.from('flyers').select('id', { count: 'exact', head: true }).gte('first_seen', since)
  if (!force && (count ?? 0) < NEW_FLYERS_FOR_NEW_WEEK) { console.log(`[digest] only ${count ?? 0} new flyers — not a new week yet`); return }

  const { data: subs } = await db.from('push_subscriptions').select('device_id, subscription, list_code').not('list_code', 'is', null)
  if (!subs?.length) { console.log('[digest] no synced subscriptions'); return }
  const week = `digest:${isoWeek(new Date())}`
  const { data: done } = await db.from('notified').select('device_id').eq('dedupe_key', week).in('device_id', subs.map(s => s.device_id))
  const already = new Set((done ?? []).map(d => d.device_id))
  const todo = subs.filter(s => !already.has(s.device_id))
  if (!todo.length) { console.log('[digest] already sent this week'); return }

  const { storesForCode } = await import('@/lib/places')
  const deals = await activeDeals(db, [])
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(process.env.VAPID_CONTACT ?? 'mailto:admin@example.com', pub, priv)

  let sent = 0
  for (const code of new Set(todo.map(s => s.list_code as string))) {
    const profile = await loadProfile(db, code)
    const stores = await storesForCode(db, code)
    const near = stores ? deals.filter(d => stores.has(d.merchant_slug)) : deals
    const picks = forYouFor(profile, near, 50)
    let list = null
    if (profile.list.length) {
      const r = compareList(profile.list as CompareItem[], near)
      const best = r.bestPair && r.bestSingle && r.bestPair.covered > r.bestSingle.matched
        ? { store: r.bestPair.names.join(' + '), total: r.bestPair.total, savings: r.bestPair.savings, covered: r.bestPair.covered }
        : r.bestSingle ? { store: r.bestSingle.name, total: r.bestSingle.total, savings: r.bestSingle.savings, covered: r.bestSingle.matched } : null
      if (best) list = { ...best, of: profile.list.length }
    }
    const msg = digestMessage(picks, list)
    if (!msg) continue
    for (const s of todo.filter(t => t.list_code === code)) {
      try {
        await webpush.sendNotification(s.subscription as never, JSON.stringify({ ...msg, tag: week }))
        await db.from('notified').upsert({ device_id: s.device_id, dedupe_key: week, ...msg })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('device_id', s.device_id)
        else console.error('[digest] send failed:', e)
      }
    }
  }
  console.log(`[digest] sent ${sent}`)
}
