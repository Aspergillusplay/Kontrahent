// Custom Service Worker for Kontrahent.sk PWA
// Handles push notifications and background sync

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Kontrahent.sk', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Nové upozornenie',
    vibrate: [100, 50, 100],
    data: { url: data.data?.url || '/dashboard' },
    actions: data.actions || [
      { action: 'view', title: 'Zobraziť' },
      { action: 'dismiss', title: 'Zavrieť' },
    ],
    requireInteraction: false,
    tag: 'kontrahent-alert',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Kontrahent.sk', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline watchlist operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-watchlist') {
    event.waitUntil(syncWatchlist());
  }
});

async function syncWatchlist() {
  // Replay queued requests from IndexedDB when back online
  console.log('[SW] Syncing watchlist changes...');
}
