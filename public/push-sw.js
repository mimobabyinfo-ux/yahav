/* eslint-disable no-undef */
// Push handlers for the Mimo service worker.
//
// This file is NOT the service worker — vite-plugin-pwa generates that
// from Workbox and would overwrite anything written there. It is pulled
// in via workbox.importScripts, which is the supported way to add
// behaviour to a generated SW without switching the whole PWA over to
// the injectManifest strategy.
//
// Keep it plain ES5-ish JS with no imports: it runs inside the worker,
// not through the app's bundler.

self.addEventListener('push', function (event) {
  var payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'מימו', body: event.data ? event.data.text() : '' }
  }

  var title = payload.title || 'מימו 🐣'
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    // Same tag = a second reminder for the same event replaces the
    // first instead of stacking two notifications on her lock screen.
    tag: payload.tag || 'mimo',
    renotify: false,
    data: { url: payload.url || '/' },
    // A community event is worth a buzz; anything else stays quiet.
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var target = (event.notification.data && event.notification.data.url) || '/'

  // Focus a tab that's already open rather than opening a second one.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
