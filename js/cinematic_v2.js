/* cinematic_v2.js - deck.gl controller for the "Living Precipitationshed" (v2).
   Forked from cinematic.js (v1 untouched). Differences:
     - drops the static HeatmapLayer; the moisture field is now the p5 atmosphere
       (atmosphere.js), which this file geo-locks to the camera via window.__CINE.project.
     - adds L2: precipitationshed isolines from D.precipitationshed_field via d3.contours
       (deck PathLayers, halo + core), tied to the per-scene `shed` mood.
     - publishes the live viewState, projector, size and per-scene emphasis on window.__CINE
       so the atmosphere rides the map. Verification fields (ready/scene/nScenes/fallback/
       errors) are carried over from v1. Camera is still the proven manual cubic tween. */
(function () {
  const D = window.FLUVION_DATA, ML = D.map_layers;
  const { Deck, MapView, ArcLayer, GeoJsonLayer, ScatterplotLayer, PathLayer } = deck;
  const CINE = (window.__CINE = {
    ready: false, scene: 0, nScenes: 9, errors: [],
    useDeck: false, width: window.innerWidth, height: window.innerHeight,
    viewState: null, emphasis: null, project: null, time: 0,
  });

  // ---- stat fills (same data-bound headline numbers as v1) ----
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("s-perha", "$" + Math.round(D.parcel_values.perha.central));
  set("s-var", "$" + (D.monte_carlo.var95 / 1e6).toFixed(2) + "M");

  // ---- colour helpers ----
  const div = d3.scaleDiverging([-50, 0, 50], d3.interpolateRdYlGn);
  const rgb = (hex) => { const c = d3.color(hex) || d3.color("#888"); return [c.r, c.g, c.b]; };
  const TEAL = [58, 214, 163];
  const lerp = (a, b, e) => a + (b - a) * e;

  // ---- L2: precipitationshed isolines from the real flow field (d3.contours) ----
  const contourPaths = (function () {
    try {
      const F = D.precipitationshed_field;
      if (!F || !F.flow_m3yr || !d3.contours) return [];
      const nx = F.lons.length, ny = F.lats.length;
      const lon0 = F.lons[0], lat0 = F.lats[0];
      const dlon = (F.lons[nx - 1] - lon0) / (nx - 1), dlat = (F.lats[ny - 1] - lat0) / (ny - 1);
      const vals = new Array(nx * ny);
      let maxV = 0;
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const v = Math.log10(1 + Math.max(0, F.flow_m3yr[y][x]));
        vals[y * nx + x] = v; if (v > maxV) maxV = v;
      }
      const levels = [0.5, 0.62, 0.74, 0.85, 0.93];
      const thresholds = levels.map((f) => f * maxV);
      const cs = d3.contours().size([nx, ny]).smooth(true).thresholds(thresholds)(vals);
      const paths = [];
      cs.forEach((feature, k) => {
        const t = levels[k] != null ? levels[k] : 0.6; // intensifies toward the source
        feature.coordinates.forEach((poly) => poly.forEach((ring) => {
          if (ring.length < 4) return;
          const path = ring.map((pt) => [lon0 + pt[0] * dlon, lat0 + pt[1] * dlat]);
          paths.push({ path, t });
        }));
      });
      return paths;
    } catch (e) { CINE.errors.push("contours: " + e.message); return []; }
  })();

  // ---- scenes: camera (same as v1) + per-scene atmosphere mood ----
  // emphasis: arcs/proof/src drive deck layers; shed drives the isolines; emit/turb/bloom
  // are read by atmosphere.js. (grade is owned per-scene by atmosphere: 0 except scene 6/7.)
  const SCENES = [
    { v: { longitude: -57, latitude: -16, zoom: 3.3, pitch: 35, bearing: -8 }, arcs: .9, proof: 0, src: 1, shed: .5, emit: .65, turb: .35, bloom: .5 },
    { v: { longitude: -57, latitude: -16, zoom: 3.05, pitch: 28, bearing: 0 }, arcs: .7, proof: 0, src: 1, shed: .4, emit: .4, turb: .3, bloom: .4 },
    { v: { longitude: -66.5, latitude: -6.2, zoom: 5.1, pitch: 46, bearing: 18 }, arcs: .4, proof: 0, src: 1.7, shed: .85, emit: 1, turb: .25, bloom: .7 },
    { v: { longitude: -60, latitude: -18, zoom: 3.6, pitch: 52, bearing: -14 }, arcs: .9, proof: 0, src: 1.2, shed: 1, emit: 1, turb: .5, bloom: .85 },
    { v: { longitude: -53, latitude: -27, zoom: 4.5, pitch: 40, bearing: 2 }, arcs: .35, proof: 1, src: .6, shed: .45, emit: .6, turb: .45, bloom: .5 },
    { v: { longitude: -67.25, latitude: -6, zoom: 6, pitch: 50, bearing: 24 }, arcs: .3, proof: 0, src: 2, shed: .8, emit: .7, turb: .3, bloom: .6 },
    { v: { longitude: -65.8, latitude: -6.6, zoom: 5.5, pitch: 52, bearing: 16 }, arcs: .25, proof: 0, src: 2.2, shed: .55, emit: 1, turb: .45, bloom: .7 },
    { v: { longitude: -64, latitude: -9, zoom: 4.3, pitch: 46, bearing: 14 }, arcs: .3, proof: 0, src: 2.2, shed: .6, emit: .85, turb: .55, bloom: .6 },
    { v: { longitude: -57, latitude: -17, zoom: 3.2, pitch: 24, bearing: 0 }, arcs: .9, proof: 0, src: 1, shed: .4, emit: .9, turb: .35, bloom: .5 },
  ];
  const EKEYS = ["arcs", "proof", "src", "shed", "emit", "turb", "bloom"];
  function emOf(s) { const o = {}; EKEYS.forEach((k) => (o[k] = s[k])); return o; }
  function lerpView(a, b, e) {
    return { longitude: lerp(a.longitude, b.longitude, e), latitude: lerp(a.latitude, b.latitude, e),
             zoom: lerp(a.zoom, b.zoom, e), pitch: lerp(a.pitch, b.pitch, e), bearing: lerp(a.bearing, b.bearing, e) };
  }
  function lerpEmph(a, b, e) { const o = {}; EKEYS.forEach((k) => (o[k] = lerp(a[k], b[k], e))); return o; }

  // ---- deck layer builder ----
  function stateFill(em) {
    return (f) => {
      const uf = +f.properties.codarea, st = ML.states.find((s) => s.uf === uf), base = [20, 36, 56];
      if (em.proof > 0.02 && st && st.obs2022 != null) {
        const c = rgb(div(st.obs2022));
        return [lerp(base[0], c[0], em.proof), lerp(base[1], c[1], em.proof), lerp(base[2], c[2], em.proof), 235];
      }
      return [...base, 205];
    };
  }
  function buildLayers(em, time) {
    const pulse = 1 + 0.28 * Math.sin(time * 2.2);
    const layers = [];
    layers.push(new GeoJsonLayer({
      id: "states", data: D.geo_uf, stroked: true, filled: true,
      getFillColor: stateFill(em), getLineColor: [90, 130, 165, 150],
      lineWidthUnits: "pixels", lineWidthMinPixels: 0.7, updateTriggers: { getFillColor: [em.proof] },
    }));
    // precipitationshed isolines: a wide faint halo + a thin bright core, tied to `shed`
    if (em.shed > 0.02 && contourPaths.length) {
      layers.push(new PathLayer({
        id: "shed-halo", data: contourPaths, getPath: (d) => d.path,
        getColor: (d) => [26, 168, 155, 26 * d.t * em.shed], widthUnits: "pixels", getWidth: (d) => 5 + 8 * d.t,
        capRounded: true, jointRounded: true, updateTriggers: { getColor: [em.shed] },
      }));
      layers.push(new PathLayer({
        id: "shed-core", data: contourPaths, getPath: (d) => d.path,
        getColor: (d) => [lerp(26, 150, d.t), lerp(168, 255, d.t), lerp(155, 210, d.t), (70 + 150 * d.t) * em.shed],
        widthUnits: "pixels", getWidth: (d) => 0.7 + 1.4 * d.t, capRounded: true, jointRounded: true,
        updateTriggers: { getColor: [em.shed] },
      }));
    }
    if (em.arcs > 0.02) layers.push(new ArcLayer({
      id: "arcs", data: ML.arcs, getSourcePosition: (d) => d.source, getTargetPosition: (d) => d.target,
      getSourceColor: [...TEAL, 150 * em.arcs], getTargetColor: (d) => [...rgb(div(d.obs2022 ?? 0)), 150 * em.arcs],
      widthUnits: "pixels", getWidth: (d) => 0.8 + Math.sqrt(d.share) * 1.2, getHeight: 0.42,
      updateTriggers: { getSourceColor: [em.arcs], getTargetColor: [em.arcs] },
    }));
    layers.push(new ScatterplotLayer({
      id: "nodes", data: ML.states, getPosition: (d) => [d.lon, d.lat], radiusUnits: "pixels",
      getRadius: (d) => 3 + Math.sqrt(d.share) * 2.2, getFillColor: (d) => [...rgb(div(d.obs2022 ?? 0)), 230],
      stroked: true, getLineColor: [255, 255, 255, 120], lineWidthUnits: "pixels", getLineWidth: 0.6,
    }));
    layers.push(new ScatterplotLayer({
      id: "src", data: [ML.source], getPosition: (d) => [d.lon, d.lat], radiusUnits: "pixels",
      getRadius: (8 + 4 * em.src) * pulse, getFillColor: [...TEAL, 235],
      stroked: true, getLineColor: [200, 255, 240, 180], lineWidthUnits: "pixels", getLineWidth: 1.4,
      updateTriggers: { getRadius: [time, em.src] },
    }));
    return layers;
  }

  // ---- projector for the atmosphere: real deck WebMercator (pitch-aware) preferred,
  //      with a pitchless safety net so particles always have somewhere to land ----
  function deckProjector(vs) {
    try {
      if (deck.WebMercatorViewport) {
        const vp = new deck.WebMercatorViewport({ ...vs, width: CINE.width, height: CINE.height });
        return (ll) => { try { return vp.project(ll); } catch (e) { return null; } };
      }
    } catch (e) { /* fall through */ }
    return manualProjector(vs);
  }
  function manualProjector(vs) {
    const W = CINE.width, H = CINE.height, ws = 512 * Math.pow(2, vs.zoom);
    const mx = (lo) => (lo + 180) / 360 * ws;
    const my = (la) => { const s = Math.sin(Math.max(-85, Math.min(85, la)) * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * ws; };
    const cx = mx(vs.longitude), cy = my(vs.latitude);
    const br = (vs.bearing || 0) * Math.PI / 180, cb = Math.cos(br), sb = Math.sin(br);
    return (ll) => { const dx = mx(ll[0]) - cx, dy = my(ll[1]) - cy; return [W / 2 + dx * cb - dy * sb, H / 2 + dx * sb + dy * cb]; };
  }

  // ---- deck instance + manual camera tween, with the v1 SVG fallback ----
  const wrap = document.getElementById("deckwrap");
  let cur = { ...SCENES[0].v }, emCur = emOf(SCENES[0]);
  let from = null, emFrom = null, t0 = 0, target = SCENES[0], DUR = 2200;
  let deckgl = null;

  function hasWebGL() {
    try { const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }

  let fbProject = null, fbDrawn = false;
  function drawFallback(reason) {
    CINE.fallback = reason; CINE.ready = true; CINE.useDeck = false; CINE.emphasis = emOf(SCENES[CINE.scene] || SCENES[0]);
    const W = window.innerWidth, H = window.innerHeight;
    const proj = d3.geoMercator().fitExtent([[44, 44], [W - 44, H - 44]],
      { type: "MultiPoint", coordinates: [[-75, -34], [-44, 4]] });
    fbProject = (ll) => proj(ll); CINE.project = fbProject; // share the static projector with the atmosphere
    if (fbDrawn) return; fbDrawn = true;
    const P = (lon, lat) => proj([lon, lat]), path = d3.geoPath(proj);
    const obs = {}; ML.states.forEach((s) => (obs[s.uf] = s.obs2022));
    const host = d3.select(wrap); host.selectAll("svg.fallback").remove();
    const svg = host.append("svg").attr("class", "fallback")
      .style("position", "absolute").style("inset", "0").style("width", "100%").style("height", "100%")
      .attr("viewBox", `0 0 ${W} ${H}`).style("background", "#070b16");
    svg.append("g").selectAll("path").data(D.geo_uf.features).join("path").attr("d", path)
      .attr("fill", (f) => { const v = obs[+f.properties.codarea]; return v == null ? "#16233a" : div(v); })
      .attr("fill-opacity", 0.9).attr("stroke", "#3a516e").attr("stroke-width", 0.6);
    ML.arcs.forEach((a) => { const s = P(a.source[0], a.source[1]), t = P(a.target[0], a.target[1]);
      const mx = (s[0] + t[0]) / 2, my = (s[1] + t[1]) / 2 - Math.hypot(t[0] - s[0], t[1] - s[1]) * 0.18;
      svg.append("path").attr("d", `M${s[0]},${s[1]} Q${mx},${my} ${t[0]},${t[1]}`).attr("fill", "none")
        .attr("stroke", "#00d4aa").attr("stroke-opacity", 0.3 + 0.5 * Math.sqrt(a.share))
        .attr("stroke-width", 1 + 3 * Math.sqrt(a.share)).attr("stroke-linecap", "round"); });
    const sp = P(ML.source.lon, ML.source.lat);
    svg.append("circle").attr("cx", sp[0]).attr("cy", sp[1]).attr("r", 9).attr("fill", "#00d4aa").attr("stroke", "#cffaf0").attr("stroke-width", 1.6);
    svg.append("text").attr("x", sp[0] + 12).attr("y", sp[1] + 4).attr("fill", "#8fe9d6").attr("font-size", 13).attr("font-weight", 600).text("Amazonas source");
    svg.append("text").attr("x", 18).attr("y", H - 16).attr("fill", "#5a6b86").attr("font-size", 11)
      .text("Static map (3D unavailable here); same data. The moisture layer still breathes above it.");
  }

  CINE.emphasis = emCur; CINE.viewState = cur;
  if (!hasWebGL()) {
    drawFallback("no-webgl");
  } else {
    try {
      deckgl = new Deck({
        parent: wrap, views: new MapView({ repeat: false }), controller: false,
        width: window.innerWidth, height: window.innerHeight, viewState: cur,
        layers: buildLayers(emCur, 0), onError: (e) => CINE.errors.push(e.message),
      });
      CINE.useDeck = true; CINE.ready = true;
      const cv = wrap.querySelector("canvas");
      if (cv) cv.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); drawFallback("context-lost"); }, false);
    } catch (e) { CINE.errors.push("init: " + e.message); drawFallback("init"); }
  }

  function resize() {
    CINE.width = window.innerWidth; CINE.height = window.innerHeight;
    if (CINE.useDeck && deckgl) deckgl.setProps({ width: CINE.width, height: CINE.height });
    else if (!CINE.useDeck) { fbDrawn = false; d3.select(wrap).selectAll("svg.fallback").remove(); drawFallback(CINE.fallback || "no-webgl"); }
  }
  window.addEventListener("resize", resize);

  function go(i) {
    CINE.scene = i;
    if (!CINE.useDeck) { CINE.emphasis = emOf(SCENES[i] || SCENES[0]); CINE.viewState = (SCENES[i] || SCENES[0]).v; return; }
    from = { ...cur }; emFrom = { ...emCur }; target = SCENES[i]; t0 = performance.now();
  }

  function frame(now) {
    if (!CINE.useDeck || !deckgl) return;
    if (from) {
      const k = Math.min(1, (now - t0) / DUR), e = d3.easeCubicInOut(k);
      cur = lerpView(from, target.v, e); emCur = lerpEmph(emFrom, emOf(target), e);
      if (k >= 1) from = null;
    }
    const time = now / 1000;
    const layers = buildLayers(emCur, time);
    try { deckgl.setProps({ viewState: cur, layers }); }
    catch (e) { CINE.errors.push("frame: " + e.message); drawFallback("frame-error"); return; }
    // publish live state for the atmosphere overlay
    CINE.viewState = cur; CINE.emphasis = emCur; CINE.time = time;
    CINE.project = deckProjector(cur);
    CINE.frames = (CINE.frames || 0) + 1; CINE.view = cur; CINE.nLayers = layers.length;
    requestAnimationFrame(frame);
  }
  if (CINE.useDeck) requestAnimationFrame(frame);

  // ---- scrollama ----
  const legend = document.getElementById("legend");
  const illus = document.getElementById("illus");
  const ILLUS = {
    2: "Tracers are released from the source box and ride the fixed flying-river edges to the soy belt. Counts and speeds are illustrative; parcel polygons are private.",
    3: "Stylized rendering: particles follow the share-weighted moisture edges, consistent with the precipitationshed. Not a wind measurement.",
    6: "The grade changes reliability, not the average. Same mean rain, fatter drought tail. Illustrative of the mechanism.",
    7: "Volatility here tracks the observed forest condition. Descriptive, lagging, never a forecast.",
  };
  function setLegend(i) {
    if (i === 4) { legend.innerHTML = '<i style="background:#e63946"></i>soy lost &nbsp; <i style="background:#f4d35e"></i>steady &nbsp; <i style="background:#43aa8b"></i>resilient'; legend.classList.add("show"); }
    else legend.classList.remove("show");
    if (illus) { if (ILLUS[i]) { illus.innerHTML = "<b>Illustrative.</b> " + ILLUS[i]; illus.classList.add("show"); } else illus.classList.remove("show"); }
  }
  const scroller = scrollama();
  scroller.setup({ step: ".step", offset: 0.6 }).onStepEnter(({ element, index }) => {
    document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
    element.classList.add("active");
    go(index); setLegend(index);
    const hint = document.getElementById("hint"); if (hint) hint.style.opacity = index === 0 ? "1" : "0";
  });
  window.addEventListener("resize", scroller.resize);

  // progress bar
  addEventListener("scroll", () => {
    const h = document.documentElement;
    document.getElementById("prog").style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + "%";
  }, { passive: true });
})();
