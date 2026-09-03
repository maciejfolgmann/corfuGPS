const Recording = (() => {
  const KEY = "corfu-recordings";
  const PROGRESS_KEY = "corfu-rec-inprogress";
  const MIN_POINT_M = 0.008; // ~8 m — mniej śmieci w localStorage
  let state = "idle"; // idle | recording | paused
  let points = [];
  let startTs = 0;
  let elapsed = 0;
  let autoSaveTimer = null;
  let onChange = null;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function save(list) {
    const payload = JSON.stringify(list);
    try {
      localStorage.setItem(KEY, payload);
      return true;
    } catch {
      // quota — obetnij stare nagrania
      try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)));
        return true;
      } catch {
        try {
          localStorage.setItem(KEY, JSON.stringify(list.slice(0, 3).map(thinRec)));
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  function thinRec(rec) {
    if (!rec.points || rec.points.length < 4) return rec;
    const step = Math.ceil(rec.points.length / 800);
    return { ...rec, points: rec.points.filter((_, i) => i % step === 0 || i === rec.points.length - 1) };
  }

  function persistProgress() {
    if (state === "idle") return;
    try {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          points,
          startTs,
          elapsed: getElapsed(),
          state,
        })
      );
    } catch {
      /* quota — szkic może nie wejść, nagranie i tak leci w RAM */
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistProgress();
  });
  window.addEventListener("pagehide", persistProgress);

  function notify(reason) {
    if (onChange) onChange({ state, pts: points, elapsed: getElapsed(), dist: distance(), reason: reason || "update" });
  }

  function getElapsed() {
    if (state === "recording") return elapsed + (Date.now() - startTs) / 1000;
    return elapsed;
  }

  function armAutoSave() {
    clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(persistProgress, 15000);
  }

  function start() {
    if (state !== "idle") return;
    state = "recording";
    points = [];
    startTs = Date.now();
    elapsed = 0;
    armAutoSave();
    persistProgress();
    notify("start");
  }

  function addPoint(latLng, ts) {
    if (state !== "recording") return;
    if (points.length) {
      const last = points[points.length - 1];
      if (GPX.haversine([last.lat, last.lon], latLng) < MIN_POINT_M) return;
    }
    points.push({ lat: latLng[0], lon: latLng[1], t: ts });
    notify("point");
  }

  function pause() {
    if (state !== "recording") return;
    elapsed += (Date.now() - startTs) / 1000;
    state = "paused";
    clearInterval(autoSaveTimer);
    persistProgress();
    notify("pause");
  }

  function resume() {
    if (state !== "paused") return;
    startTs = Date.now();
    state = "recording";
    armAutoSave();
    persistProgress();
    notify("resume");
  }

  function stop() {
    if (state === "idle") return null;
    const endTs = Date.now();
    const totalSec = elapsed + (state === "recording" ? (endTs - startTs) / 1000 : 0);
    clearInterval(autoSaveTimer);
    localStorage.removeItem(PROGRESS_KEY);
    state = "idle";
    elapsed = 0;
    const rec = {
      id: "rec-" + endTs,
      name: "Przejazd " + fmtDate(new Date(endTs)),
      ts: endTs,
      sec: Math.round(totalSec),
      dist: distance(),
      points,
    };
    const list = load();
    list.unshift(rec);
    const ok = save(list.slice(0, 50));
    rec.saved = ok;
    const out = rec;
    points = [];
    notify("stop");
    return out;
  }

  function restore() {
    if (state !== "idle") return false;
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.points) || data.points.length === 0) return false;
      points = data.points;
      elapsed = Number(data.elapsed) || 0;
      startTs = Date.now();
      state = "paused";
      notify("restore");
      return true;
    } catch {
      return false;
    }
  }

  function distance() {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += GPX.haversine([points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]);
    }
    return d;
  }

  function list() {
    return load();
  }

  function remove(id) {
    save(load().filter((r) => r.id !== id));
    notify("remove");
  }

  function fmtDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function xmlEsc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportGpx(rec) {
    const header =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Korfu GPS" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      `  <metadata><name>${xmlEsc(rec.name)}</name><desc>dystans ${rec.dist.toFixed(2)} km, czas ${fmtDur(rec.sec)}</desc></metadata>\n` +
      `  <trk><name>${xmlEsc(rec.name)}</name><trkseg>\n`;
    const body = rec.points
      .map((p) => `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
      .join("\n");
    const footer = "\n  </trkseg></trk>\n</gpx>\n";
    return header + body + footer;
  }

  function fmtDur(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  }

  function download(rec) {
    const blob = new Blob([exportGpx(rec)], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.name.replace(/[^0-9a-z\- ]/gi, "").replace(/ /g, "-").toLowerCase() + ".gpx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  return {
    start,
    pause,
    resume,
    stop,
    restore,
    addPoint,
    list,
    remove,
    download,
    exportGpx,
    getPoints: () => points,
    getElapsed,
    getState: () => state,
    onChange: (f) => (onChange = f),
  };
})();
