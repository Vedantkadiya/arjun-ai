// ============================================================
// sw.js — Service Worker
// Makes Arjun AI work offline and load instantly on repeat visits.
//
// Strategy:
//   - Cache First for static assets (JS, CSS, fonts)
//   - Network First for API calls (always fresh from Groq)
//
// This is what makes it a real PWA — installable on Android/iOS
// and loads in <100ms even on slow connections.
// ============================================================

const CACHE_NAME = 'arjun-ai-v6';

// Files to cache on install — the entire app shell
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/variables.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/config.js',
  '/js/storage.js',
  '/js/api.js',
  '/js/app.js'
];

// ── Install: pre-cache the app shell ───────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: clean up old caches ──────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ──────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Groq API calls — always go to network
  if (url.hostname.includes('groq.com')) {
    return; // pass through, no caching
  }

  // Never intercept Google Fonts — they have their own caching
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // For everything else: Cache First strategy
  // 1. Try cache → fast
  // 2. Fall back to network → update cache
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Only cache valid GET responses
        if (!response || response.status !== 200 || e.request.method !== 'GET') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, toCache));
        return response;
      });
    })
  );
});
