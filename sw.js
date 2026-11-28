const CACHE_PREFIX = 'kho-tai-lieu-pro-';
const CACHE_NAME = CACHE_PREFIX + 'v29';
const CORE_ASSETS = [
    './',
    './index.html'
];
const OPTIONAL_ASSETS = [
    './manifest.json',
    './icon-180.png',
    './icon-192.png',
    './icon-512.png',
    'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
        await Promise.allSettled(
            OPTIONAL_ASSETS.map((url) => cache.add(url).catch(() => {}))
        );
    })());
});

self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

async function fetchWithTimeout(request, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    // Điều hướng trang HTML: Network-First có timeout 3s, đồng bộ cả './' và './index.html'
    if (e.request.mode === 'navigate' || e.request.destination === 'document') {
        e.respondWith((async () => {
            try {
                const networkResponse = await fetchWithTimeout(e.request, NAV_TIMEOUT_MS);
                if (networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    await Promise.allSettled([
                        cache.put(e.request, networkResponse.clone()),
                        cache.put('./', networkResponse.clone()),
                        cache.put('./index.html', networkResponse.clone())
                    ]);
                }
                return networkResponse;
            } catch (err) {
                return (await caches.match(e.request))
                    || (await caches.match('./index.html'))
                    || (await caches.match('./'));
            }
        })());
        return;
    }

    // Tài nguyên tĩnh: Cache-First
    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return fetch(e.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
