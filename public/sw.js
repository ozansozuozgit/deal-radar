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
    // an open app gets told what to show (e.g. the alerted deal); otherwise open it there
    for (const c of list) {
      if ('focus' in c) {
        c.postMessage({ type: 'open', url })
        return c.focus()
      }
    }
    return clients.openWindow(url)
  }))
})
