/* Q Berries Proyecciones — Service Worker */
const CACHE = "qb-proyecciones-v88";
const ASSETS = [
  "./",
  "./index.html",
  "./install.html",
  "./css/fonts.css",
  "./css/styles.css",
  "./js/config.js",
  "./js/data.js",
  "./js/select.js",
  "./js/api.js",
  "./js/app.js",
  "./manifest.json",
  "./assets/logo-qberries.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/qr-install.png",
  "./data/lotes-licapa.json",
  "./data/evaluadores.json",
  "./fonts/plus-jakarta-sans-500.woff2",
  "./fonts/plus-jakarta-sans-600.woff2",
  "./fonts/plus-jakarta-sans-700.woff2",
  "./fonts/plus-jakarta-sans-800.woff2",
];

function isShellRequest_(url) {
  const path = url.pathname || "";
  return (
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith("/install.html") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith("/manifest.json") ||
    path.endsWith("/sw.js")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "NOTIFY" && data.title) {
    event.waitUntil(
      self.registration.showNotification(String(data.title), {
        body: String(data.body || ""),
        icon: "./assets/icon-192.png",
        badge: "./assets/icon-192.png",
        tag: String(data.tag || "qb-proy-sync"),
        renotify: true,
        vibrate: [90, 40, 90],
        data: { url: "./index.html" },
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification && event.notification.data && event.notification.data.url) || "./index.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (let i = 0; i < clients.length; i++) {
        const c = clients[i];
        if (c.url && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App shell: red primero para detectar cambios; caché si no hay señal
  if (isShellRequest_(url) || req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Estáticos: caché primero (offline estable)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
