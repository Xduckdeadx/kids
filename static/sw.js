/* Kid IEQ 2025 - sw.js (v5 - força atualizar cache) */
const CACHE = "kid-ieq-cache-v5";

const ASSETS = [
  "/",
  "/static/css/style.css",
  "/static/js/app.js",
  "/static/manifest.json",
  "/static/images/icon-72.png",
  "/static/images/icon-96.png",
  "/static/images/icon-128.png",
  "/static/images/icon-144.png",
  "/static/images/icon-152.png",
  "/static/images/icon-192.png",
  "/static/images/icon-384.png",
  "/static/images/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll(ASSETS);
      } catch {}
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

// cache-first p/ estáticos; rede p/ API
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // API sempre rede
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ ok: false, error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }))
    );
    return;
  }

  // estáticos cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => new Response("", { status: 503 }));
    })
  );
});
