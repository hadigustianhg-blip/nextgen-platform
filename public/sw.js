const CACHE_NAME = "nextgen-team-shell-v1";
const OFFLINE_URL = "/team/offline";
const STATIC_ASSETS = [
  "/brand/app-icon-192.png",
  "/brand/app-icon-512.png",
  "/brand/nextgen-mark.svg",
  "/avatars/default-user.svg",
];
const OFFLINE_HTML = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f2b5b"><title>Offline | NEXTGEN Team</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#0f172a;font-family:system-ui,sans-serif;padding:24px;box-sizing:border-box}.card{max-width:360px;background:white;border:1px solid #e2e8f0;border-radius:24px;padding:28px;text-align:center;box-shadow:0 18px 50px rgba(15,23,42,.08)}.icon{width:56px;height:56px;border-radius:18px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;margin:auto;font-size:28px}h1{font-size:22px;margin:18px 0 8px}p{font-size:14px;line-height:1.6;color:#64748b}button{min-height:44px;width:100%;border:0;border-radius:14px;background:#2563eb;color:white;font-weight:700;margin-top:16px}</style></head><body><main class="card"><div class="icon">↻</div><h1>Anda sedang offline</h1><p>Hubungkan kembali internet untuk menggunakan Attendance dan data Team.</p><button onclick="location.reload()">Coba Lagi</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }));
    await Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("nextgen-team-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/salary-card") || url.pathname.startsWith("/s/")) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/team")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(async () => (await caches.match(OFFLINE_URL)) || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }

  const cacheableStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/avatars/");
  if (!cacheableStatic) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone()).catch(() => undefined);
    return response;
  })());
});
