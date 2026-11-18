// Service worker sederhana agar aplikasi bisa di-install sebagai aplikasi desktop/HP.
// Selalu ambil versi terbaru dari server (network-first); cache hanya cadangan bila offline.
const CACHE = "mflash-maint-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // data Supabase tidak di-cache
  e.respondWith(
    fetch(e.request)
      .then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request))
  );
});
