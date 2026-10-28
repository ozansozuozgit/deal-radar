import { getDeviceId } from './device'

export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'idle' | 'error' | 'needs-install'

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** iOS only offers Web Push to sites added to the Home Screen. */
function isIosBrowserTab(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone
}

export async function currentPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined' || !VAPID_KEY) return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return isIosBrowserTab() ? 'needs-install' : 'unsupported'
  try {
    if (Notification.permission === 'denied') return 'denied'
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub ? 'subscribed' : 'idle'
  } catch { return 'unsupported' }
}

export async function enablePush(): Promise<PushStatus> {
  if (!VAPID_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    })
    const res = await fetch('/api/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: getDeviceId(), subscription: sub.toJSON() }),
    })
    // a browser subscription the server doesn't know about would never get alerts
    if (!res.ok) { await sub.unsubscribe().catch(() => {}); return 'error' }
    return 'subscribed'
  } catch (e) {
    console.error('[push] enable failed:', e)
    return 'error'
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
