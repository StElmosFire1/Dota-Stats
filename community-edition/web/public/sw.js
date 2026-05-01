/* Dota 2 Inhouse — service worker for web push notifications.
   Wave 3 F7. The bot's web-push sender posts JSON like:
     { title, body, url?, icon?, tag? }
   The SW renders a notification and, on click, focuses or opens the URL.
*/
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Dota Inhouse', body: event.data?.text() || '' }; }
  const title = data.title || 'Dota 2 Inhouse';
  const opts = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      try {
        const u = new URL(c.url);
        if (u.pathname === url || c.url.endsWith(url)) {
          c.focus();
          return;
        }
      } catch {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
