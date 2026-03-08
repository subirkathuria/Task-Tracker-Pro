self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // This allows the app to bypass standard browser caching rules when needed
    e.respondWith(fetch(e.request).catch(() => new Response('App Offline')));
});