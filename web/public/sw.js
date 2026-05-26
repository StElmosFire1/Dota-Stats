/* Dota 2 Inhouse — service worker for web push notifications.
   Wave 3 F7 + Task #407 (notification preference centre v2).
   The web-push sender posts JSON like:
     { title, body, url?, icon?, tag?, event?, unsubscribeUrl?, data? }
   - `event` and `unsubscribeUrl` are surfaced on the notification's `actions`
     so a tap on "Unsubscribe" hits the signed-token endpoint that mutes
     that single (event, channel) tuple server-side.
*/
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Dota Inhouse', body: event.data?.text() || '' }; }
  const title = data.title || 'Dota 2 Inhouse';
  const actions = [];
  if (data.unsubscribeUrl) actions.push({ action: 'unsubscribe', title: 'Unsubscribe' });
  const opts = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || undefined,
    actions: actions.length ? actions : undefined,
    data: {
      url: data.url || '/',
      unsubscribeUrl: data.unsubscribeUrl || null,
      event: data.event || data?.data?.event || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const payload = event.notification?.data || {};
  event.notification.close();

  // Task #407 — one-tap unsubscribe action. Fire the signed-token GET in
  // the background; surface the resulting confirmation page in a tab so
  // the user knows it took effect.
  if (action === 'unsubscribe' && payload.unsubscribeUrl) {
    event.waitUntil((async () => {
      try { await fetch(payload.unsubscribeUrl, { method: 'GET' }); } catch {}
      if (self.clients.openWindow) await self.clients.openWindow(payload.unsubscribeUrl);
    })());
    return;
  }

  const url = payload.url || '/';
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
