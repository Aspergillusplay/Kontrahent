// Network-only application data: never persist authenticated pages or API responses.
importScripts('/sw-custom.js');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (['api-data', 'start-url', 'static-assets', 'images'].includes(name) || name.startsWith('workbox-')) await caches.delete(name);
  }
  await self.clients.claim();
})()));
