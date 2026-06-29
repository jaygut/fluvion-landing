// utils.js - shared helpers for both Fluvion viz artifacts.
// All data comes from window.FLUVION_DATA (bundle.js, exported from real engine outputs).

const D = window.FLUVION_DATA;

// ---- palette (design tokens, mirrored from the strategy) ----
const C = {
  moisture: "#00d4aa", water: "#4fc3f7", risk: "#ff8a65", riskDeep: "#d84315",
  prov: "#b39ddb", success: "#66bb6a", warn: "#ffa726", danger: "#ef5350",
  firewall: "#78909c", bgDark: "#0a0e1a", textLight: "#e8eaf6", textDim: "#7986cb",
};
const CONF = { high: "#66bb6a", "medium-high": "#7cb342", medium: "#ffa726", low: "#ef5350" };

// ---- formatters ----
const fmt = {
  usd: (v) => "$" + d3.format(",.0f")(v),
  usdc: (v) => "$" + d3.format(".3s")(v).replace("G", "bn").replace("M", "M").replace("k", "k"),
  pct: (v, d = 1) => d3.format("+." + d + "%")(v),
  pct0: (v, d = 0) => d3.format("." + d + "%")(v),
  num: (v) => d3.format(",.0f")(v),
  sig: (v, d = 2) => d3.format("." + d + "g")(v),
  r: (v) => d3.format("+.2f")(v),
};

// ---- tooltip factory ----
function tooltip() {
  let t = d3.select("body").select(".fv-tooltip");
  if (t.empty()) t = d3.select("body").append("div").attr("class", "fv-tooltip");
  return {
    show(html, ev) {
      t.html(html).style("opacity", 1)
       .style("left", (ev.clientX + 14) + "px")
       .style("top", (ev.clientY + 14) + "px");
    },
    hide() { t.style("opacity", 0); },
  };
}

// ---- projections ----
// Corridor (field + boxes): equirectangular fit to the corridor bbox.
// Use a MultiPoint of the SW + NE corners so d3 computes an unambiguous extent.
// (A hand-wound Polygon ring can be read as the whole-globe complement, which
// collapses the corridor to a sliver.)
function corridorProjection(w, h, corridor) {
  const c = corridor;
  return d3.geoEquirectangular().fitSize([w, h], {
    type: "MultiPoint",
    coordinates: [[c.lon_min, c.lat_min], [c.lon_max, c.lat_max]],
  });
}
// Planar [lon,lat] bounding box of any GeoJSON, by walking the coordinates.
// (We avoid d3.geoBounds because it is spherical: if a polygon ring is wound
// the "wrong" way it is read as the whole-globe complement, returning world
// bounds and collapsing the map to a dot. A planar walk is winding-proof.)
function geoBBox(geojson) {
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  const walk = (o) => {
    if (!Array.isArray(o)) return;
    if (o.length >= 2 && typeof o[0] === "number" && typeof o[1] === "number") {
      if (o[0] < lo[0]) lo[0] = o[0];
      if (o[1] < lo[1]) lo[1] = o[1];
      if (o[0] > hi[0]) hi[0] = o[0];
      if (o[1] > hi[1]) hi[1] = o[1];
    } else { for (const e of o) walk(e); }
  };
  (geojson.features || [geojson]).forEach((f) => walk((f.geometry || f).coordinates));
  return { lo, hi };
}
// Brazil soy choropleth: fit Mercator to the UF geometry's planar bbox corners.
// Fitting a 2-corner MultiPoint sidesteps the spherical-winding collapse above.
function geoProjection(w, h, geojson) {
  const { lo, hi } = geoBBox(geojson);
  return d3.geoMercator().fitSize([w, h], {
    type: "MultiPoint", coordinates: [[lo[0], lo[1]], [hi[0], hi[1]]],
  });
}

// ---- responsive svg ----
function svgIn(sel, vbW, vbH) {
  d3.select(sel).selectAll("*").remove();
  return d3.select(sel).append("svg")
    .attr("viewBox", `0 0 ${vbW} ${vbH}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%").style("height", "auto").style("display", "block");
}

// ---- scroll reveal (report) ----
// Renders a figure as it nears the viewport, with a hard safety net so nothing
// is ever left blank: fast programmatic scrolls or figures taller than the
// viewport could otherwise miss a 0.25-threshold observer. We fire on the
// first near-intersection (generous rootMargin) and, failing that, force-render
// shortly after load. cb is idempotent (svgIn clears its container first).
function onReveal(node, cb, once = true) {
  let done = false;
  const fire = () => { if (done && once) return; done = true; try { cb(); } catch (e) { console.error(e); } };
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { fire(); if (once) io.unobserve(e.target); } });
  }, { threshold: 0, rootMargin: "400px 0px 400px 0px" });
  io.observe(node);
  // safety net: never leave a figure unrendered (idempotent re-render is cheap)
  setTimeout(() => { if (!done) fire(); }, 2500);
}

// confidence chip html
function confChip(level) {
  return `<span class="conf conf-${level}">confidence: ${level}</span>`;
}
