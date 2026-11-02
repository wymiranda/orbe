const CACHE_NAME = 'niorb-shell-v8'
const APP_SHELL = ['/', '/manifest.webmanifest', '/niorb-icon.svg']
const OFFLINE_CONTENT = ['/api/readings', '/api/chinese/vocabulary', '/api/chinese/sentences', '/api/study/decks', '/api/multiplayer/catalog/sentence-image', '/api/games/cover-images']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('niorb-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  ]))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) {
    const isReadingDownload = /^\/api\/readings\/[^/]+\/(summary|chapters\/[^/]+)$/.test(url.pathname)
    const canServe = OFFLINE_CONTENT.includes(url.pathname) || /^\/api\/readings\/[^/]+$/.test(url.pathname) || isReadingDownload
    const canCache = !isReadingDownload || request.headers.get('X-Niorb-Offline-Download') === '1'
    if (!canServe) return
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && canCache) {
        const cachedResponse = isReadingDownload
          ? new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers: new Headers([...response.headers, ['X-Niorb-Offline-Expires', String(Date.now() + 30 * 24 * 60 * 60 * 1000)]]) })
          : response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, cachedResponse))
      }
      return response
    }).catch(async () => {
      const cached = await caches.match(request)
      if (cached && isReadingDownload) {
        const expires = Number(cached.headers.get('X-Niorb-Offline-Expires'))
        if (!Number.isFinite(expires) || expires < Date.now()) {
          await caches.open(CACHE_NAME).then((cache) => cache.delete(request))
          return Response.json({ error: 'O download desta leitura expirou. Conecte-se para baixá-la novamente.' }, { status: 503 })
        }
      }
      return cached ?? Response.json({ error: 'Conteúdo ainda não está disponível offline.' }, { status: 503 })
    }))
    return
  }
  // Built files have a content hash in their name and never change: serve them
  // from the cache first so repeat visits open instantly and spend no data.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    })))
    return
  }
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone()
    void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
    return response
  }).catch(async () => (await caches.match(request)) ?? (await caches.match('/'))))
})
