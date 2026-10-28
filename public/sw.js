// Deal Radar service worker: push alerts + offline support.
// Grocery stores are signal dead zones, so the app shell and the last-seen deals are
// cached and served when the network is gone or too slow to wait for.
const CACHE = 'deal-radar-v1'
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/apple-touch-icon.png']
const API = /^\/api\/(deals|meta|dinner|history)$/
const SLOW_NETWORK_MS = 4000

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/static/')) event.respondWith(cacheFirst(req))
  else if (req.mode === 'navigate') event.respondWith(networkFirst(req, '/'))
  else if (API.test(url.pathname)) event.respondWith(networkFirst(req))
})

// content-hashed build assets never change
async function cacheFirst(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()))
  return res
}

// fresh when possible; cached copy when offline, erroring, or slower than SLOW_NETWORK_MS
async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(req) || (fallbackKey && await cache.match(fallbackKey))
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(fallbackKey && req.mode === 'navigate' ? fallbackKey : req, res.clone())
    return res
  })
  if (!cached) return network
  const slow = new Promise(resolve => setTimeout(() => resolve(cached), SLOW_NETWORK_MS))
  return Promise.race([network.then(res => (res.ok ? res : cached)), slow]).catch(() => cached)
}

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* non-JSON push */ }
  const title = data.title || 'Deal Radar'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'A watched item is on sale near you.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'deal-radar',
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus() }
    return clients.openWindow(url)
  }))
})
