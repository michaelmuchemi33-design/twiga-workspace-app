const CACHE = "twiga-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/twiga-mark.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(fetch(request).then((response) => { const copy=response.clone(); caches.open(CACHE).then((cache)=>cache.put("/",copy)); return response; }).catch(() => caches.match("/")));
  else if (request.destination === "style" || request.destination === "script" || request.destination === "image") event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const copy=response.clone(); caches.open(CACHE).then((cache)=>cache.put(request,copy)); } return response; })));
});
