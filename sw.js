const CACHE = "chat-inbox-v1";
const APP_SHELL = ["./operator.html", "./styles.css", "./operator.js", "./config.js", "./manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match("./operator.html"))));
});

self.addEventListener("push", event => {
  let data = { title: "New chat message", body: "Someone sent you a message.", conversationId: null };
  try { data = { ...data, ...event.data.json() }; } catch {}
  const url = data.conversationId ? `operator.html?chat=${encodeURIComponent(data.conversationId)}` : "operator.html";
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: data.conversationId ? `chat-${data.conversationId}` : "chat-message",
    renotify: true,
    data: { url },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const target = new URL(event.notification.data.url, self.registration.scope).href;
    for (const client of clients) { if ("focus" in client) { await client.navigate(target); return client.focus(); } }
    return self.clients.openWindow(target);
  }));
});
