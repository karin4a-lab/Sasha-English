// Retire the old cache worker, including for phones that still have v4 installed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('sasha-english-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(() => self.registration.unregister()));
});
