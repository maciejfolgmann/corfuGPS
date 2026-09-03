const MapDownload = (() => {
  const BBOX = { minLat: 39.335865, maxLat: 39.84154, minLon: 19.615067, maxLon: 20.1462 };
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_CACHE = "corfu-gps-tiles";
  const PACKS = {
    base: { label: "Cała mapa Korfu", zooms: [10, 11, 12, 13, 14, 15], approx: "~100 MB" },
    detail: { label: "Bliższy zoom", zooms: [16], approx: "~200 MB extra" },
  };

  let running = false;
  let onProgress = null;
  let onDone = null;
  let total = 0;
  let done = 0;
  let failed = 0;
  let queue = [];

  function lon2x(lon, n) {
    return ((lon + 180) / 360) * n;
  }
  function lat2y(lat, n) {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n;
  }

  function tileRange(z) {
    const n = 2 ** z;
    const x0 = Math.floor(lon2x(BBOX.minLon, n));
    const x1 = Math.floor(lon2x(BBOX.maxLon, n));
    const y0 = Math.floor(lat2y(BBOX.maxLat, n));
    const y1 = Math.floor(lat2y(BBOX.minLat, n));
    return { x0, x1, y0, y1 };
  }

  function zoomFlag(z) {
    return "corfu-pack-z" + z;
  }

  function isZoomCached(z) {
    return localStorage.getItem(zoomFlag(z)) === "1";
  }

  function tileUrlOf(u) {
    // https://tile.openstreetmap.org/{z}/{x}/{y}.png
    const m = String(u).match(/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)/);
    return m ? { z: +m[1], x: +m[2], y: +m[3] } : null;
  }

  async function verifyCachedZooms() {
    if (typeof caches === "undefined") return;
    try {
      const cache = await caches.open(TILE_CACHE);
      const keys = await cache.keys();
      const byZoom = Object.create(null);
      for (const k of keys) {
        const t = tileUrlOf(k.url);
        if (!t) continue;
        byZoom[t.z] = (byZoom[t.z] || 0) + 1;
      }
      for (let z = 10; z <= 16; z++) {
        if (localStorage.getItem(zoomFlag(z)) !== "1") continue;
        const { x0, x1, y0, y1 } = tileRange(z);
        const expected = (x1 - x0 + 1) * (y1 - y0 + 1);
        const have = byZoom[z] || 0;
        // iOS mógł wyrzucić cache — flaga kłamie
        if (expected > 0 && have < expected * 0.7) localStorage.removeItem(zoomFlag(z));
      }
    } catch {
      /* brak Cache API */
    }
  }

  function buildQueue(pack) {
    const q = [];
    for (const z of pack.zooms) {
      if (isZoomCached(z)) continue;
      const { x0, x1, y0, y1 } = tileRange(z);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          q.push({ z, x, y });
        }
      }
    }
    return q;
  }

  function tileUrl(t) {
    return TILE_URL.replace("{z}", t.z).replace("{x}", t.x).replace("{y}", t.y);
  }

  function loadOne(t) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = tileUrl(t);
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function start(packName, progressCb, doneCb) {
    if (running) return;
    const pack = PACKS[packName];
    if (!pack) return;
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      if (doneCb) doneCb({ error: "no-sw" });
      return;
    }
    running = true;
    onProgress = progressCb;
    onDone = doneCb;
    queue = buildQueue(pack);
    total = queue.length;
    done = 0;
    failed = 0;

    if (total === 0) {
      running = false;
      if (onDone) onDone({ total: 0, done: 0, failed: 0 });
      return;
    }

    // 3 równoległe + mała pauza — mniej walimy w OSM niż 6 na raz
    const workers = 3;
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const t = queue[cursor++];
        const ok = await loadOne(t);
        if (ok) done++;
        else failed++;
        if (onProgress) onProgress({ total, done: done + failed, failed, zooms: pack.zooms });
        if (cursor % 40 === 0) await sleep(40);
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));

    if (failed === 0) {
      for (const z of pack.zooms) {
        if (queue.some((t) => t.z === z)) localStorage.setItem(zoomFlag(z), "1");
      }
    }

    running = false;
    if (onDone) onDone({ total, done, failed });
  }

  function cachedZoomCount() {
    let n = 0;
    for (let z = 10; z <= 16; z++) if (isZoomCached(z)) n++;
    return n;
  }

  async function clearAll() {
    let removed = 0;
    try {
      const cache = await caches.open(TILE_CACHE);
      const keys = await cache.keys();
      for (const k of keys) {
        if (k.url.includes("tile.openstreetmap.org")) {
          await cache.delete(k);
          removed++;
        }
      }
    } catch {
      /* brak Cache API */
    }
    for (let z = 10; z <= 19; z++) localStorage.removeItem(zoomFlag(z));
    return removed;
  }

  return {
    start,
    cachedZoomCount,
    clearAll,
    isZoomCached,
    verifyCachedZooms,
    isBusy: () => running,
    PACKS,
  };
})();
