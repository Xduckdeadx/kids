/* Kid IEQ 2025 - sw.js (v5 - update automático + cache seguro) */
const CACHE = "kid-ieq-cache-v5";

// Arquivos estáticos do app (não inclua /api aqui)
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
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS);
    } catch (e) {
      // se falhar, o app ainda pode funcionar via rede
    }
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

// Permite o app "mandar" o SW assumir imediatamente (sem esperar fechar abas)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Estratégia:
// - /api/*: sempre rede (sem cache)
// - Navegação (document): network-first com fallback pra cache (evita tela branca quando SW antigo/online instável)
// - Estáticos: cache-first (rápido)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só GET
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

  // Navegação (index.html, rotas do SPA, etc): network-first
  if (req.mode === "navigate" || (req.destination === "document")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("/", fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cached = await caches.match(req) || await caches.match("/");
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Estáticos: cache-first
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
