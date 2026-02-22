/* Kid IEQ 2025 - sw.js (v6 - atualiza sem limpar cache) */
const CACHE = "kid-ieq-cache-v6";

const CORE = [
  "/",
  "/static/css/style.css",
  "/static/js/app.js",
  "/static/manifest.json"
];

// instala: pre-cache do core
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
    } catch {}
    self.skipWaiting();
  })());
});

// ativa: limpa caches antigos + assume controle
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

// recebe mensagem do app para aplicar update
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// helpers
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // pede uma cópia "fresca"
    const fresh = await fetch(new Request(req, { cache: "reload" }));
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((resp) => {
    if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
    return resp;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 503 });
}

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

  // navegação (index) e arquivos críticos: network-first pra não "grudar" versão antiga
  const isNav = req.mode === "navigate";
  const isCritical =
    url.pathname === "/" ||
    url.pathname === "/static/js/app.js" ||
    url.pathname === "/static/css/style.css" ||
    url.pathname === "/static/manifest.json";

  if (isNav || isCritical) {
    event.respondWith(networkFirst(req).catch(() => caches.match(req) || new Response("", { status: 503 })));
    return;
  }

  // demais estáticos: cache rápido + atualiza em segundo plano
  event.respondWith(staleWhileRevalidate(req));
});
