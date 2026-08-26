const Recording = (() => {
  const KEY = "corfu-recordings";
  const PROGRESS_KEY = "corfu-rec-inprogress";
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
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function notify() {
    if (onChange) onChange({ state, pts: points, elapsed: getElapsed(), dist: distance() });
  }

  function getElapsed() {
    if (state === "recording") return elapsed + (Date.now() - startTs) / 1000;
    return elapsed;
  }

  function start() {
    if (state !== "idle") return;
    state = "recording";
    points = [];
    startTs = Date.now();
    elapsed = 0;
    autoSaveTimer = setInterval(() => {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({ points, startTs, elapsed: (Date.now() - startTs) / 1000 })
      );
    }, 15000);
    notify();
  }

  function addPoint(latLng, ts) {
    if (state !== "recording") return;
    points.push({ lat: latLng[0], lon: latLng[1], t: ts });
    notify();
  }

  function pause() {
    if (state !== "recording") return;
    elapsed += (Date.now() - startTs) / 1000;
    state = "paused";
    clearInterval(autoSaveTimer);
    notify();
  }

  function resume() {
    if (state !== "paused") return;
    startTs = Date.now();
    state = "recording";
    autoSaveTimer = setInterval(() => {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({ points, startTs, elapsed: (Date.now() - startTs) / 1000 })
      );
    }, 15000);
    notify();
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
    save(list.slice(0, 50));
    const out = rec;
    points = [];
    notify();
    return out;
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
  }

  function fmtDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function exportGpx(rec) {
    const header =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Korfu GPS" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      `  <metadata><name>${rec.name}</name><desc>dystans ${rec.dist.toFixed(2)} km, czas ${fmtDur(rec.sec)}</desc></metadata>\n` +
      `  <trk><name>${rec.name}</name><trkseg>\n`;
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
