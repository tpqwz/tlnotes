const CACHE = "tlnotes-share";
const SHELL = "tlnotes-shell-v5";
const KEY = "/__tlnotes/share-payload";
const FONTS = [
  "/fonts/monaspace-argon.woff2",
  "/fonts/monaspace-neon.woff2",
  "/fonts/monaspace-xenon.woff2",
  "/fonts/monaspace-radon.woff2",
  "/fonts/monaspace-krypton.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(FONTS.map((path) => `${mountPath()}${path}`)))
      .catch(() => undefined),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting();
  if (event.data?.type === "refresh-shell") {
    event.waitUntil(
      caches.delete(SHELL).then(() => {
        event.ports[0]?.postMessage("ok");
      }),
    );
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const { prefix, path } = splitPrefix(url.pathname);
  if (
    event.request.method === "GET" &&
    (path === "/manifest.webmanifest" || path === "/__grok/manifest.webmanifest" || path === "/__grok/manifest.json")
  ) {
    event.respondWith(namedManifest(event.request, prefix));
    return;
  }
  if (path === "/share-target" || path === "/share-target/" || path === "/share-target/index.html") {
    if (event.request.method === "GET") {
      event.respondWith(fetch(event.request));
      return;
    }
  }
  if (event.request.method === "POST" && (path === "/share-target" || path === "/share-target/")) {
    event.respondWith(storeAndOpen(event.request, prefix));
    return;
  }
  if (event.request.method !== "GET") return;
  if (path === "/__tlnotes/build" || url.searchParams.has("tlnotes-probe")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  event.respondWith(route(event, path));
});

function mountPath() {
  try {
    return new URL(self.registration.scope).pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function splitPrefix(pathname) {
  const match = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i.exec(pathname);
  if (match) {
    const rest = pathname.slice(match[0].length);
    return { prefix: match[0], path: rest.startsWith("/") ? rest : `/${rest}` };
  }
  const mount = mountPath();
  if (mount && (pathname === mount || pathname.startsWith(`${mount}/`))) {
    const rest = pathname.slice(mount.length);
    return { prefix: mount, path: rest.startsWith("/") ? rest : `/${rest}` };
  }
  return { prefix: "", path: pathname };
}

async function isNested(event) {
  if (event.request.mode === "navigate") return event.request.headers.get("sec-fetch-dest") === "iframe";
  if (!event.clientId) return false;
  const client = await self.clients.get(event.clientId);
  return client?.frameType === "nested";
}

function isAppAsset(pathname) {
  return (
    isShellAsset(pathname) ||
    pathname.startsWith("/src/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules/")
  );
}

async function route(event, path) {
  if (await isNested(event)) return fetch(event.request);
  if (path === "/@vite/client" || path.startsWith("/@react-refresh")) {
    return new Response("export {}", { headers: { "content-type": "text/javascript" } });
  }
  const navigation = event.request.mode === "navigate";
  if (!navigation && !isAppAsset(path) && event.request.destination !== "script" && event.request.destination !== "style") {
    return fetch(event.request);
  }
  return cacheFirst(event.request, navigation);
}

function isShellAsset(pathname) {
  return (
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.svg" ||
    pathname === "/og.jpg" ||
    pathname === "/x-banner.jpg"
  );
}

async function cacheFirst(request, navigation) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) {
    await cache.put(request, fresh.clone());
    if (navigation) {
      const text = await fresh.clone().text();
      await cache.put("/__tlnotes/shell-hash", new Response(await sha(text)));
    }
  }
  return fresh;
}

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function namedManifest(request, prefix) {
  const origin = new URL(request.url).origin;
  const share = {
    action: `${origin}${prefix}/share-target/index.html`,
    method: "GET",
    enctype: "application/x-www-form-urlencoded",
    params: { title: "title", text: "text", url: "url" },
  };
  try {
    const response = await fetch(request);
    const data = await response.json();
    data.name = "TLNotes";
    data.short_name = "TLNotes";
    data.share_target = share;
    data.scope = `${origin}${prefix}/`;
    data.start_url = `${origin}${prefix}/`;
    data.id = `${origin}${prefix}/tlnotes`;
    if (Array.isArray(data.icons)) {
      data.icons = data.icons.map((icon) =>
        typeof icon?.src === "string" && icon.src.startsWith("/") ? { ...icon, src: `${origin}${prefix}${icon.src}` } : icon,
      );
    }
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" },
    });
  } catch {
    return new Response(
      JSON.stringify({
        name: "TLNotes",
        short_name: "TLNotes",
        id: `${origin}${prefix}/tlnotes`,
        start_url: `${origin}${prefix}/`,
        scope: `${origin}${prefix}/`,
        display: "standalone",
        background_color: "#f3efe6",
        theme_color: "#f3efe6",
        share_target: share,
      }),
      { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" } },
    );
  }
}

async function fieldText(form, name) {
  const value = form.get(name);
  if (typeof value === "string") return value;
  if (value && typeof value.text === "function") return value.text();
  return "";
}

async function storeAndOpen(request, prefix) {
  const form = await request.formData();
  const payload = {
    title: await fieldText(form, "title"),
    text: await fieldText(form, "text"),
    url: await fieldText(form, "url"),
  };
  const cache = await caches.open(CACHE);
  await cache.put(
    new URL(`${mountPath()}${KEY}`, self.location.origin).href,
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    }),
  );
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: "tlnotes-share" });
  return Response.redirect(new URL(`${prefix}/?shared=1`, self.location.origin), 303);
}
