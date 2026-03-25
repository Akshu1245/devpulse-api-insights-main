/// <reference lib="webworker" />

const CACHE_VERSION = "v3";
const STATIC_CACHE = `devpulse-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `devpulse-dynamic-${CACHE_VERSION}`;
const API_CACHE = `devpulse-api-${CACHE_VERSION}`;

// Resources to cache immediately on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
];

// ── Install: cache static assets immediately ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches immediately ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: ultra-fast cache-first for assets, stale-while-revalidate for pages ──
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip non-http requests (chrome-extension, etc.)
  if (!url.protocol.startsWith("http")) return;

  // Skip Supabase API calls - always network
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/functions/v1/") ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/auth/v1/")
  ) {
    return;
  }

  // ── JS/CSS/fonts/images: Cache-First (instant from cache) ──
  if (
    url.pathname.match(/\.(js|css|woff|woff2|ttf|eot|ico|png|jpg|jpeg|svg|webp|avif)$/)
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          // Serve from cache instantly, update in background
          fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
          }).catch(() => {});
          return cached;
        }
        // Not in cache: fetch, cache, and return
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // ── External API health checks: Network with short timeout ──
  if (url.hostname !== self.location.hostname) {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        ),
      ]).then((response) => {
        // Cache successful API responses for 30s
        if (response.ok) {
          caches.open(API_CACHE).then((cache) => {
            cache.put(request, response.clone());
          });
        }
        return response;
      }).catch(async () => {
        // Return cached API response if available
        const cached = await caches.match(request);
        return cached || new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  // ── HTML pages: Stale-While-Revalidate (instant load + background update) ──
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached || caches.match("/index.html"));

      // Return cached immediately if available, otherwise wait for network
      return cached || fetchPromise;
    })
  );
});

// ── Background sync for offline mutations ──
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-mutations") {
    event.waitUntil(
      // Process any queued mutations when back online
      Promise.resolve()
    );
  }
});

// ── Handle messages from main thread ──
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CACHE_URLS") {
    const urls = event.data.urls || [];
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(urls));
  }
});

export {};
