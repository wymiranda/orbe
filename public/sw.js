const CACHE_NAME = 'orbe-shell-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/orbe-icon.svg']
const OFFLINE_CONTENT = ['/api/readings', '/api/chinese/vocabulary', '/api/study/decks']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) {
    const canCache = OFFLINE_CONTENT.includes(url.pathname) || /^\/api\/readings\/[^/]+$/.test(url.pathname)
    if (!canCache) return
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    }).catch(async () => (await caches.match(request)) ?? Response.json({ error: 'Conteúdo ainda não está disponível offline.' }, { status: 503 })))
    return
  }
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone()
    void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
    return response
  }).catch(async () => (await caches.match(request)) ?? (await caches.match('/'))))
})
