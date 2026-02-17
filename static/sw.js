/* static/sw.js
   IEQ Central • Ministério Infantil v2.0
   Service Worker Profissional com estratégia de cache híbrida
*/

const CACHE_NAME = 'ieq-central-v2';
const API_CACHE_NAME = 'ieq-api-v2';

// Assets para cache inicial (estratégia cache-first)
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/manifest.json',
  '/static/images/favicon-16.png',
  '/static/images/favicon-32.png',
  '/static/images/apple-touch-icon.png',
  '/static/images/icon-72.png',
  '/static/images/icon-96.png',
  '/static/images/icon-128.png',
  '/static/images/icon-144.png',
  '/static/images/icon-152.png',
  '/static/images/icon-192.png',
  '/static/images/icon-384.png',
  '/static/images/icon-512.png'
];

// Rotas de API que podem ter fallback offline
const API_ROUTES = [
  '/api/status',
  '/api/me',
  '/api/dashboard/stats'
];

// Instalação - cache dos assets estáticos
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Instalação completa');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Erro na instalação:', error);
      })
  );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Ativação completa');
      return self.clients.claim();
    })
  );
});

// Estratégia de cache: network-first para navegação, cache-first para assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requisições não-GET
  if (request.method !== 'GET') return;
  
  // API requests - network first com fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }
  
  // HTML navigation - network first
  if (request.mode === 'navigate' || 
      (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(handleNavigationRequest(request));
    return;
  }
  
  // Static assets - cache first
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(handleStaticRequest(request));
    return;
  }
  
  // Default - network first
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Handler para requisições de API
async function handleAPIRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const responseClone = response.clone();
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, responseClone);
    }
    
    return response;
  } catch (error) {
    console.log('[Service Worker] API offline, tentando cache:', request.url);
    
    // Try to get from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for specific endpoints
    if (request.url.includes('/api/status')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'offline',
          message: 'Você está offline. Conecte-se à internet para atualizar.'
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Generic offline response
    return new Response(
      JSON.stringify({
        success: false,
        error: 'offline',
        message: 'Sem conexão com o servidor'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handler para navegação (páginas HTML)
async function handleNavigationRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const responseClone = response.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, responseClone);
    }
    
    return response;
  } catch (error) {
    console.log('[Service Worker] Navegação offline, servindo cache');
    
    // Try to get from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to homepage
    const homepage = await caches.match('/');
    if (homepage) {
      return homepage;
    }
    
    // Ultimate fallback - simple offline page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Offline - IEQ Central</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui; text-align: center; padding: 2rem; background: #f3f4f6; }
          .offline { max-width: 400px; margin: 0 auto; padding: 2rem; background: white; border-radius: 1rem; }
          h1 { color: #3b82f6; }
        </style>
      </head>
      <body>
        <div class="offline">
          <h1>📡 IEQ Central</h1>
          <p>Você está offline</p>
          <p>Conecte-se à internet para continuar usando o sistema.</p>
        </div>
      </body>
      </html>
      `,
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}

// Handler para assets estáticos (cache-first)
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Serve from cache and update in background
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, response);
          });
        }
      })
      .catch(() => {});
    
    return cachedResponse;
  }
  
  // Not in cache, fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, responseClone);
    }
    return response;
  } catch (error) {
    return new Response('Recurso não encontrado', { status: 404 });
  }
}

// Background sync para operações offline (opcional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-presenca') {
    console.log('[Service Worker] Sincronizando presenças offline');
    // Implementar sincronização de dados offline aqui
  }
});

// Push notifications (opcional)
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: '/static/images/icon-192.png',
    badge: '/static/images/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click em notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
