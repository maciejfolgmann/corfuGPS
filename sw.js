const VERSION = "corfu-gps-app-v2";
const TILE_CACHE = "corfu-gps-tiles";

const APP_SHELL = [
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/app.js",
  "js/gpx.js",
  "js/map-download.js",
  "js/recording.js",
  "js/compass.js",
  "leaflet/leaflet.js",
  "leaflet/leaflet.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "routes/dzien1_poludnie_pelekas.gpx",
  "routes/dzien2_zachodnie_wybrzeze.gpx",
  "routes/dzien3_afionas_drastis.gpx",
  "routes/dzien4_pantokrator.gpx",
  "routes/dzien5_wschodnie_wybrzeze.gpx",
  "routes/dzien6_korfu_town_poludnie.gpx",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== VERSION && k !== TILE_CACHE && k !== "corfu-gps-v1")
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isTile(url) {
  return url.hostname.endsWith("tile.openstreetmap.org");
}

// apka moze byc serwowana z podsciezki (np. /corfuGPS/) - porownuj koncowke sciezki
function isShellPath(url) {
  const rel = url.pathname.replace(/^\//, "");
  return APP_SHELL.some((p) => rel === p || rel.endsWith("/" + p));
}

async function tileStrategy(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res) {
      await cache.put(req, res.clone());
      self.clients.matchAll({ includeUncontrolled: true }).then((cls) =>
        cls.forEach((c) => c.postMessage({ type: "tile-cached" }))
      );
    }
    return res;
  } catch {
    const fallback = await cache.match(req);
    return fallback || new Response("", { status: 502, statusText: "Tile unavailable" });
  }
}

async function navStrategy(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(VERSION);
    cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match("index.html");
    return cached || Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  return hit || fetch(req);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (isTile(url)) {
    e.respondWith(tileStrategy(e.request));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(navStrategy(e.request));
    return;
  }
  if (isShellPath(url)) {
    e.respondWith(cacheFirst(e.request));
  }
});
