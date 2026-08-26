(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ROUTE_FILES = [
    "dzien1_poludnie_pelekas.gpx",
    "dzien2_zachodnie_wybrzeze.gpx",
    "dzien3_afionas_drastis.gpx",
    "dzien4_pantokrator.gpx",
    "dzien5_wschodnie_wybrzeze.gpx",
    "dzien6_korfu_town_poludnie.gpx",
    "test_olsztyn_petla.gpx",
  ];

  const DIACRITICS = {
    Poludnie: "Południe",
    Poludniowe: "Południowe",
    Wybrzeze: "Wybrzeże",
    Polnoc: "Północ",
    Plaza: "Plaża",
    Plaze: "Plaże",
  };

  const state = {
    routes: [],
    active: null,
    follow: true,
    compassOn: false,
    pos: null,
    gpsHeading: 0,
    lastArrowDeg: 0,
    speedKmh: 0,
    alt: 0,
    tripDist: 0,
    lastFix: null,
    lastFixTs: 0,
    fullScanCount: 0,
    routeFinished: false,
    routeMaxAlong: 0,
    recBadgeTimer: null,
  };

  // ---------------- mapa ----------------
  const map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    minZoom: 8,
    maxZoom: 19,
  }).setView([39.62, 19.9], 12);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

  window.__map = map; // uchwyt do debugowania

  const routeLayer = L.layerGroup().addTo(map);
  const recLine = L.polyline([], { color: "#4ade80", weight: 5, opacity: 0.9 }).addTo(map);

  const arrow = L.marker([0, 0], {
    icon: L.divIcon({ className: "pos-wrap", html: '<div class="pos-arrow"></div>', iconSize: [44, 44], iconAnchor: [22, 22] }),
    interactive: false,
    zIndexOffset: 1000,
  });

  map.on("dragstart", () => {
    state.follow = false;
    updateFollowBtn();
  });

  // ---------------- trasy ----------------
  function prettify(name) {
    let n = name.replace(/^Dzien (\d+)\s*-\s*/, "Dzień $1 — ");
    for (const [from, to] of Object.entries(DIACRITICS)) n = n.split(from).join(to);
    return n;
  }

  async function loadRoutes() {
    const out = [];
    for (const file of ROUTE_FILES) {
      try {
        const res = await fetch("routes/" + file);
        const text = await res.text();
        const g = GPX.parse(text);
        // uproszczenie geometrii (iOS Safari nie renderuje bardzo dlugich linii SVG)
        const track = GPX.simplify(g.track, 0.0001);
        const cum = GPX.cumulative(track);
        const length = cum[cum.length - 1] || 0;
        const wpts = g.waypoints.map((w, wi) => {
          const wll = [w.lat, w.lon];
          // trasy sa petlami: pierwszy i ostatni punkt geometrii to to samo miejsce
          // (start = meta). Pierwszy waypoint ma dlugosc 0, ostatni = cala trasa.
          if (wi === 0 && GPX.haversine(wll, track[0]) < 0.5) {
            return { ...w, idx: 0, along: 0 };
          }
          if (wi === g.waypoints.length - 1 && GPX.haversine(wll, track[track.length - 1]) < 0.5) {
            return { ...w, idx: track.length - 1, along: length };
          }
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < track.length; i++) {
            const d = (track[i][0] - w.lat) ** 2 + (track[i][1] - w.lon) ** 2;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          return { ...w, idx: best, along: cum[best] };
        });
        const day = parseInt(file.replace(/\D/g, ""), 10) || 999;
        out.push({
          file,
          day,
          name: prettify(g.name || file),
          desc: g.desc || "",
          track,
          cum,
          length,
          wpts,
          lastIdx: 0,
        });
      } catch (e) {
        console.warn("Nie udalo sie wczytac trasy", file, e);
      }
    }
    out.sort((a, b) => a.day - b.day);
    state.routes = out;
    renderRouteList();
    const saved = localStorage.getItem("corfu-active-route");
    const savedRoute = out.find((r) => r.file === saved);
    if (savedRoute) showRoute(savedRoute);
  }

  function showRoute(r) {
    clearRoute();
    state.active = r;
    state.routeFinished = false;
    state.routeMaxAlong = 0;
    state.follow = true;
    updateFollowBtn();
    localStorage.setItem("corfu-active-route", r.file);

    routeLayer.addLayer(
      L.polyline(r.track, { color: "#ffffff", weight: 9, opacity: 0.9, interactive: false })
    );
    routeLayer.addLayer(
      L.polyline(r.track, { color: "#ff6b35", weight: 5, interactive: false })
    );

    r.markers = r.wpts.map((w, i) => {
      const m = L.marker([w.lat, w.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="wpt-pin">${i + 1}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      });
      m.bindPopup(`<b>${w.name}</b>${w.desc ? "<br>" + w.desc : ""}`);
      routeLayer.addLayer(m);
      return m;
    });

    $("route-bar").hidden = false;
    $("route-name").textContent = r.name;
    $("route-meta").textContent =
      r.desc + (r.desc ? " • " : "") + r.length.toFixed(1) + " km trasy";

    const bounds = L.latLngBounds(r.track);
    if (state.pos) bounds.extend(state.pos);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    updateProgress();
  }

  function clearRoute() {
    if (state.active) {
      state.active.markers = null;
      state.active.lastIdx = 0;
    }
    routeLayer.clearLayers();
    state.active = null;
    $("route-bar").hidden = true;
    $("route-progress-fill").style.width = "0%";
    $("hud-next-name").textContent = "—";
    $("hud-next-dist").textContent = "—";
  }

  // ---------------- nawigacja ----------------
  function nearestIdx(track, pos, hint) {
    const n = track.length;
    state.fullScanCount++;
    const fullScan = state.fullScanCount % 25 === 0;
    let best = Math.max(0, Math.min(n - 1, hint || 0));
    let bestD = Infinity;
    const W = 4000;
    const from = fullScan ? 0 : Math.max(0, best - W);
    const to = fullScan ? n : Math.min(n, best + W);
    for (let i = from; i < to; i++) {
      const d = (track[i][0] - pos[0]) ** 2 + (track[i][1] - pos[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function routeAlong(r, pos) {
    const i = nearestIdx(r.track, pos, r.lastIdx);
    let along = r.cum[i];
    // trasy sa petlami: start i meta w tym samym miejscu. Blisko pierwszego punktu
    // geometrii = start przejazdu, chyba ze trasa jest juz prawie przejechana.
    const nearStart = GPX.haversine(pos, r.track[0]) < 0.15;
    if (nearStart && along > 0.85 * r.length && state.routeMaxAlong < 0.85 * r.length) {
      along = 0;
    }
    state.routeMaxAlong = Math.max(state.routeMaxAlong, along);
    r.lastIdx = i;
    return along;
  }

  function updateProgress() {
    const r = state.active;
    if (!r || !state.pos) return;
    const along = routeAlong(r, state.pos);
    const pct = Math.min(100, (along / r.length) * 100);
    $("route-progress-fill").style.width = pct + "%";

    let next = null;
    for (const w of r.wpts) {
      if (w.along > along + 0.03) {
        next = w;
        break;
      }
    }
    if (!next) {
      $("hud-next-name").textContent = "Koniec trasy";
      $("hud-next-dist").textContent = "";
      if (!state.routeFinished && along > r.length - 0.15) {
        state.routeFinished = true;
        toast("Koniec trasy — " + r.name.split(" — ")[0]);
      }
    } else {
      const rem = (next.along - along) * 1000;
      $("hud-next-name").textContent = next.name;
      $("hud-next-dist").textContent = "do celu: " + fmtDist(rem);
    }

    if (r.markers) {
      r.markers.forEach((m, k) => {
        const w = r.wpts[k];
        const el = m.getElement();
        if (!el) return;
        const pin = el.querySelector(".wpt-pin");
        if (!pin) return;
        pin.classList.toggle("done", w.along < along - 0.03);
        pin.classList.toggle("next", next === w);
      });
    }
  }

  // ---------------- GPS ----------------
  function startGps() {
    if (!navigator.geolocation) {
      toast("Brak GPS w tej przeglądarce");
      return;
    }
    navigator.geolocation.watchPosition(
      onPos,
      (e) => {
        if (e.code === 1) toast("Brak zgody na lokalizację — włącz w Ustawieniach iPhone");
        else if (e.code === 2) toast("Brak sygnału GPS — sprawdź zasięg");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }

  function onPos(p) {
    const c = p.coords;
    const pos = [c.latitude, c.longitude];
    state.pos = pos;

    if (c.speed !== null && c.speed >= 0 && c.speed * 3.6 <= 250) state.speedKmh = c.speed * 3.6;
    else if (state.lastFix) {
      const d = GPX.haversine(state.lastFix, pos);
      const dt = (p.timestamp - state.lastFixTs) / 1000;
      const calc = dt > 0 ? (d / dt) * 3600 : state.speedKmh;
      if (calc <= 250) state.speedKmh = calc;
    }

    if (c.heading !== null && c.heading >= 0) state.gpsHeading = c.heading;
    else if (state.lastFix) state.gpsHeading = GPX.bearing(state.lastFix, pos);

    if (state.lastFix) state.tripDist += GPX.haversine(state.lastFix, pos);
    state.alt = c.altitude !== null ? c.altitude : state.alt;

    arrow.setLatLng(pos);
    if (!arrow._map) arrow.addTo(map);
    updateArrow();

    if (state.follow) map.panTo(pos, { animate: false });

    if (state.active) updateProgress();
    if (Recording.getState() === "recording") Recording.addPoint(pos, p.timestamp);

    state.lastFix = pos;
    state.lastFixTs = p.timestamp;
    updateHud();
  }

  function updateArrow() {
    let deg = state.gpsHeading;
    if (state.compassOn) {
      const h = Compass.getHeading();
      if (h !== null) deg = h;
    }
    if (isFinite(deg)) {
      state.lastArrowDeg = deg;
      const el = arrow.getElement();
      if (el) {
        const a = el.querySelector(".pos-arrow");
        if (a) a.style.transform = "rotate(" + deg + "deg)";
      }
    }
  }

  // ---------------- HUD ----------------
  function fmtDist(m) {
    if (m < 1000) return Math.max(0, Math.round(m)) + " m";
    return (m / 1000).toFixed(1) + " km";
  }

  function updateHud() {
    $("speed").textContent = Math.round(state.speedKmh);
    $("hud-dist").textContent = state.tripDist.toFixed(1);
    $("hud-alt").textContent = state.alt !== 0 ? Math.round(state.alt) : "--";
  }

  function updateFollowBtn() {
    $("btn-follow").classList.toggle("active", state.follow);
  }

  // ---------------- nagrywanie ----------------
  Recording.onChange((s) => {
    const badge = $("rec-badge");
    if (s.state === "recording") {
      badge.classList.add("on");
      if (!state.recBadgeTimer) {
        state.recBadgeTimer = setInterval(() => {
          if (Recording.getState() !== "recording") {
            clearInterval(state.recBadgeTimer);
            state.recBadgeTimer = null;
            return;
          }
          badge.textContent = "● " + fmtTime();
        }, 1000);
      }
      badge.textContent = "● " + fmtTime();
      $("btn-record").classList.add("danger");
    } else if (s.state === "paused") {
      badge.textContent = "⏸ " + fmtTime();
    } else {
      badge.classList.remove("on");
      $("btn-record").classList.remove("danger");
    }
    recLine.setLatLngs((Recording.getPoints() || []).map((pt) => [pt.lat, pt.lon]));
    renderRecordings();
  });

  function fmtTime() {
    const r = Recording;
    const sec = r.getState() === "recording" || r.getState() === "paused" ? r.getElapsed() : 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  // ---------------- szuflady ----------------
  function openDrawer(id) {
    $(id).classList.add("open");
  }
  function closeDrawers() {
    document.querySelectorAll(".drawer").forEach((d) => d.classList.remove("open"));
  }
  document.querySelectorAll(".drawer-close").forEach((b) =>
    b.addEventListener("click", closeDrawers)
  );
  $("btn-routes").addEventListener("click", () => {
    renderRouteList();
    openDrawer("drawer-routes");
  });
  $("btn-settings").addEventListener("click", () => {
    renderSettings();
    openDrawer("drawer-settings");
  });

  function renderRouteList() {
    const list = $("routes-list");
    list.innerHTML = "";
    for (const r of state.routes) {
      const div = document.createElement("div");
      div.className = "route-item" + (state.active === r ? " active" : "");
      const h = document.createElement("h4");
      h.textContent = r.name;
      const p = document.createElement("p");
      p.textContent = r.desc ? r.desc : "";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = r.length.toFixed(0) + " km • " + r.wpts.length + " punktów";
      div.append(h, p, tag);
      div.addEventListener("click", () => {
        closeDrawers();
        showRoute(r);
      });
      list.appendChild(div);
    }
  }

  function renderSettings() {
    renderMapSection();
    renderRecordings();
    const offline = !(window.navigator.standalone || matchMedia("(display-mode: standalone)").matches);
    $("install-hint").style.display = offline ? "block" : "none";
    $("compass-readout").textContent =
      Compass.getHeading() !== null ? Math.round(Compass.getHeading()) + "°" : "—";
  }

  // ---------------- mapa offline ----------------
  const PACK_INFO = {
    base: { tiles: 1030, label: "Paczka bazowa", desc: "cała wyspa, drogi lokalne (zoom 10–14)", approx: "~60 MB" },
    detail: { tiles: 3970, label: "Paczka szczegółowa", desc: "+ serwisówki, ścieżki i budynki (zoom 15)", approx: "~220 MB" },
  };

  function renderMapSection() {
    const chips = $("zoom-chips");
    chips.innerHTML = "";
    for (let z = 10; z <= 15; z++) {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = "z" + z;
      c.classList.toggle("ok", MapDownload.isZoomCached(z));
      chips.appendChild(c);
    }
    for (const [key, info] of Object.entries(PACK_INFO)) {
      const bar = $("bar-" + key);
      const status = $("status-" + key);
      const btn = $("dl-" + key);
      const ok = MapDownload.isZoomCached(key === "base" ? 14 : 15);
      if (ok) {
        btn.textContent = "Pobrano ✓";
        btn.disabled = true;
        status.textContent = info.desc + " — gotowe.";
        bar.style.width = "100%";
      } else {
        btn.disabled = MapDownload.isBusy();
        status.textContent = info.desc + " (ok. " + info.approx + ").";
      }
    }
  }

  function startDownload(key) {
    const info = PACK_INFO[key];
    const btn = $("dl-" + key);
    const bar = $("bar-" + key);
    const status = $("status-" + key);
    btn.disabled = true;
    btn.textContent = "Pobieranie…";
    MapDownload.start(key, (p) => {
      bar.style.width = Math.min(100, (p.done / p.total) * 100) + "%";
      status.textContent = p.done + " / " + p.total + " kafelków" + (p.failed ? " (błędów: " + p.failed + ")" : "");
    }, (r) => {
      if (r && r.error === "no-sw") {
        status.textContent = "Najpierw zainstaluj apkę (Dodaj do ekranu głównego), potem odśwież.";
      } else if (r && r.failed > 0) {
        status.textContent = "Zakończono z " + r.failed + " błędami — wciśnij ponownie, dokończy od miejsca przerwy.";
        toast("Pobieranie z błędami — spróbuj jeszcze raz");
      } else {
        toast("Mapa pobrana ✓");
      }
      renderSettings();
    });
  }

  $("dl-base").addEventListener("click", () => startDownload("base"));
  $("dl-detail").addEventListener("click", () => startDownload("detail"));
  $("clear-map").addEventListener("click", async () => {
    const n = await MapDownload.clearAll();
    toast("Wyczyszczono mapę offline (" + n + " kafelków)");
    renderSettings();
  });

  // ---------------- kompas ----------------
  $("btn-compass").addEventListener("click", async () => {
    if (!state.compassOn) {
      const perm = await Compass.requestPermission();
      if (perm === "granted") {
        Compass.setEnabled(true);
        state.compassOn = true;
        toast("Kompas włączony");
      } else {
        toast("Kompas zablokowany — włącz w Ustawieniach iPhone: Safari → Ruch i orientacja");
      }
    } else {
      Compass.setEnabled(false);
      state.compassOn = false;
      toast("Kompas wyłączony");
    }
    $("btn-compass").classList.toggle("active", state.compassOn);
  });
  Compass.onChange(() => {
    const el = $("compass-readout");
    if (el) el.textContent = Compass.getHeading() !== null ? Math.round(Compass.getHeading()) + "°" : "—";
    updateArrow();
  });

  // ---------------- przyciski akcji ----------------
  $("btn-follow").addEventListener("click", () => {
    state.follow = true;
    updateFollowBtn();
    if (state.pos) map.panTo(state.pos, { animate: true });
  });
  $("btn-zoom-in").addEventListener("click", () => map.zoomIn());
  $("btn-zoom-out").addEventListener("click", () => map.zoomOut());
  $("btn-record").addEventListener("click", () => {
    const s = Recording.getState();
    if (s === "idle") Recording.start();
    else if (s === "recording") Recording.pause();
    else Recording.resume();
  });
  $("btn-close-route").addEventListener("click", () => {
    clearRoute();
    localStorage.removeItem("corfu-active-route");
  });

  // ---------------- wake lock ----------------
  const wlToggle = $("wl-toggle");
  wlToggle.addEventListener("click", async () => {
    const on = wlToggle.classList.toggle("on");
    localStorage.setItem("corfu-wakelock", on ? "1" : "0");
    if (on) await acquireWakeLock();
  });
  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator) state.wl = await navigator.wakeLock.request("screen");
    } catch {
      /* ignoruj */
    }
  }
  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      (wlToggle.classList.contains("on") || Recording.getState() === "recording")
    ) {
      await acquireWakeLock();
    }
  });

  // ---------------- toast / offline ----------------
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }
  window.addEventListener("online", () => $("offline-badge").classList.remove("on"));
  window.addEventListener("offline", () => $("offline-badge").classList.add("on"));

  // ---------------- nagrania (ustawienia) ----------------
  function renderRecordings() {
    const box = $("recordings-list");
    box.innerHTML = "";
    const recs = Recording.list();
    if (recs.length === 0) {
      box.innerHTML = '<div class="dl-status">Brak nagrań. Użyj czerwonego przycisku ●, żeby nagrać przejazd.</div>';
      return;
    }
    for (const rec of recs) {
      const div = document.createElement("div");
      div.className = "rec-item";
      const head = document.createElement("div");
      head.className = "rec-head";
      const b = document.createElement("b");
      b.textContent = rec.name;
      const span = document.createElement("span");
      span.textContent = rec.dist.toFixed(1) + " km • " + rec.points.length + " pkt";
      head.append(b, span);
      const acts = document.createElement("div");
      acts.className = "rec-actions";
      const exp = document.createElement("button");
      exp.className = "btn-exp";
      exp.textContent = "Eksport GPX";
      exp.addEventListener("click", () => Recording.download(rec));
      const del = document.createElement("button");
      del.className = "btn-del";
      del.textContent = "Usuń";
      del.addEventListener("click", () => {
        Recording.remove(rec.id);
        renderRecordings();
      });
      acts.append(exp, del);
      div.append(head, acts);
      box.appendChild(div);
    }
  }

  // ---------------- start ----------------
  async function showVersion() {
    try {
      const t = await (await fetch("sw.js")).text();
      const m = t.match(/VERSION = "([^"]+)"/);
      if (m) $("app-version").textContent = m[1];
    } catch {
      /* offline przed pierwszym cachowaniem - zostaje '...' */
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      setTimeout(showVersion, 300);
    });
  }
  showVersion();
  if (localStorage.getItem("corfu-wakelock") === "1") wlToggle.classList.add("on");

  loadRoutes();
  startGps();
  updateFollowBtn();
})();
