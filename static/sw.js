const CACHE = "kid-ieq-cache-v7";

const ASSETS = [
  "/",
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
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS);
    } catch (e) {}
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // API sempre rede
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ ok: false, error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // Navegação: network-first com fallback
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("/", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(req) || await caches.match("/");
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Estáticos: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
