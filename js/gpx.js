const GPX = (() => {
  const NS = "http://www.topografix.com/GPX/1/1";

  function parse(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Zły plik GPX");
    const get = (el, tag) => {
      if (!el) return "";
      const n = el.getElementsByTagNameNS(NS, tag)[0] || el.getElementsByTagName(tag)[0];
      return n ? n.textContent.trim() : "";
    };
    const byTag = (tag) => {
      const ns = Array.from(doc.getElementsByTagNameNS(NS, tag));
      return ns.length ? ns : Array.from(doc.getElementsByTagName(tag));
    };
    const wpts = byTag("wpt").map((w) => ({
      lat: parseFloat(w.getAttribute("lat")),
      lon: parseFloat(w.getAttribute("lon")),
      name: get(w, "name"),
      desc: get(w, "desc"),
    }));
    const track = byTag("trkpt").map((p) => [
      parseFloat(p.getAttribute("lat")),
      parseFloat(p.getAttribute("lon")),
    ]);
    const metaName = get(byTag("metadata")[0], "name") || get(byTag("rte")[0], "name") || get(byTag("trk")[0], "name");
    const metaDesc = get(byTag("metadata")[0], "desc");
    return { name: metaName, desc: metaDesc, waypoints: wpts, track };
  }

  const R = 6371;

  function haversine(a, b) {
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLon = ((b[1] - a[1]) * Math.PI) / 180;
    const la1 = (a[0] * Math.PI) / 180;
    const la2 = (b[0] * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function bearing(a, b) {
    const dLon = ((b[1] - a[1]) * Math.PI) / 180;
    const la1 = (a[0] * Math.PI) / 180;
    const la2 = (b[0] * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return (deg + 360) % 360;
  }

  function cumulative(track) {
    const c = new Float64Array(track.length);
    let sum = 0;
    for (let i = 1; i < track.length; i++) {
      sum += haversine(track[i - 1], track[i]);
      c[i] = sum;
    }
    return c;
  }

  // Douglas-Peucker (plasko, w stopniach) - redukcja punktow dla iOS Safari,
  // ktory nie renderuje bardzo dlugich sciezek SVG
  function simplify(points, tolerance) {
    if (points.length < 3) return points.slice();
    const tol2 = tolerance * tolerance;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      let maxD = 0;
      let idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = pointSegDist2(points[i], points[a], points[b]);
        if (d > maxD) {
          maxD = d;
          idx = i;
        }
      }
      if (maxD > tol2) {
        keep[idx] = 1;
        stack.push([a, idx], [idx, b]);
      }
    }
    const out = [];
    for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
    return out;
  }

  function pointSegDist2(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
  }

  return { parse, haversine, bearing, cumulative, simplify };
})();
