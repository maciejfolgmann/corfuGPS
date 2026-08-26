const GPX = (() => {
  const NS = "http://www.topografix.com/GPX/1/1";

  function parse(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Zły plik GPX");
    const get = (el, tag) => {
      const n = el.getElementsByTagNameNS(NS, tag)[0];
      return n ? n.textContent.trim() : "";
    };
    const wpts = Array.from(doc.getElementsByTagNameNS(NS, "wpt")).map((w) => ({
      lat: parseFloat(w.getAttribute("lat")),
      lon: parseFloat(w.getAttribute("lon")),
      name: get(w, "name"),
      desc: get(w, "desc"),
    }));
    const track = Array.from(doc.getElementsByTagNameNS(NS, "trkpt")).map((p) => [
      parseFloat(p.getAttribute("lat")),
      parseFloat(p.getAttribute("lon")),
    ]);
    const metaName = get(doc.getElementsByTagNameNS(NS, "metadata")[0], "name") ||
      get(doc.getElementsByTagNameNS(NS, "rte")[0], "name");
    const metaDesc = get(doc.getElementsByTagNameNS(NS, "metadata")[0], "desc");
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
    return (Math.atan2(y, x) * 180) / Math.PI;
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

  return { parse, haversine, bearing, cumulative };
})();
