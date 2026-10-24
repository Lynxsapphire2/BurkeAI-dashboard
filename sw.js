// BurkeAI's offline cache (docs/dashboard.md). The installed app opens from its last copy when
// there's no signal:
// - the page itself and the encrypted data come from the network first, so a new version or new
//   numbers show at once, and fall back to the last copy offline;
// - files under assets/ have the build's hash in their names and never change, so they come from
//   the cache once fetched.
// The cache is named after the app's version (sw.js?v=...), so a new version starts a clean one.
// Storage can fail (a full disk, private browsing): then every request simply goes to the network.
const CACHE = "burkeai-" + (new URL(self.location.href).searchParams.get("v") || "dev");

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      } catch {
        /* no storage: nothing to clean */
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // HEAD checks for new data go straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.includes("/assets/") ? cacheFirst(req) : networkFirst(req));
});

async function cached(req) {
  try {
    return await caches.match(req, { ignoreSearch: true });
  } catch {
    return undefined;
  }
}

async function keep(req, res) {
  try {
    if (res.ok) await (await caches.open(CACHE)).put(req, res);
  } catch {
    /* no storage: this copy just isn't kept */
  }
}

async function cacheFirst(req) {
  const hit = await cached(req);
  if (hit) return hit;
  const res = await fetch(req);
  keep(req, res.clone());
  return res;
}

async function networkFirst(req) {
  let res;
  try {
    // by its address: a page load's own request can't be re-sent with options (a TypeError)
    res = await fetch(req.url, { cache: "no-store", credentials: "same-origin" });
  } catch (err) {
    const hit = await cached(req);
    if (hit) return hit;
    throw err;
  }
  keep(req, res.clone());
  return res;
}
