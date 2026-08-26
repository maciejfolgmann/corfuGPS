const MapDownload = (() => {
  const BBOX = { minLat: 39.335865, maxLat: 39.84154, minLon: 19.615067, maxLon: 20.1462 };
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const PACKS = {
    base: { label: "Paczka bazowa", zooms: [10, 11, 12, 13, 14], approx: "~60 MB" },
    detail: { label: "Paczka szczegółowa", zooms: [10, 11, 12, 13, 14, 15], approx: "~220 MB łącznie" },
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

    const workers = 6;
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const t = queue[cursor++];
        const ok = await loadOne(t);
        if (ok) done++;
        else failed++;
        if (onProgress) onProgress({ total, done: done + failed, failed, zooms: pack.zooms });
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));

    // zoom bez zadnego bledu = kompletny (kafelki z cache licza sie jako sukces)
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
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    const cache = await caches.open("corfu-gps-tiles");
    const keys = await cache.keys();
    let removed = 0;
    for (const k of keys) {
      if (k.url.includes("tile.openstreetmap.org")) {
        await cache.delete(k);
        removed++;
      }
    }
    for (let z = 10; z <= 16; z++) localStorage.removeItem(zoomFlag(z));
    return removed;
  }

  return {
    start,
    cachedZoomCount,
    clearAll,
    isZoomCached,
    isBusy: () => running,
    PACKS,
  };
})();
