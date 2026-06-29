// cinematic.js - deck.gl flying-rivers scrollytelling controller.
// Real data from window.FLUVION_DATA. Camera is tweened manually (robust), arcs flow
// via animated particles. Instrumented on window.__CINE for headless verification.
(function () {
  const D = window.FLUVION_DATA, ML = D.map_layers;
  const { Deck, MapView, ArcLayer, GeoJsonLayer, ScatterplotLayer, HeatmapLayer } = deck;
  const CINE = (window.__CINE = { ready: false, scene: 0, errors: [] });

  // ---- stat fills ----
  document.getElementById("s-perha").textContent = "$" + Math.round(D.parcel_values.perha.central);
  document.getElementById("s-var").textContent = "$" + (D.monte_carlo.var95 / 1e6).toFixed(2) + "M";

  // ---- colour helpers ----
  const div = d3.scaleDiverging([-50, 0, 50], d3.interpolateRdYlGn);
  const rgb = (hex) => { const c = d3.color(hex) || d3.color("#888"); return [c.r, c.g, c.b]; };
  const TEAL = [0, 212, 170], WATER = [79, 195, 247];

  // ---- precompute flowing-particle ground tracks per arc (quadratic bezier) ----
  const N = 48;
  const tracks = ML.arcs.map((a, k) => {
    const [sx, sy] = a.source, [tx, ty] = a.target;
    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, bulge = len * 0.16;
    const cx = mx + nx * bulge, cy = my + ny * bulge;     // control point (lateral bow)
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      pts.push([v * v * sx + 2 * v * u * cx + u * u * tx,
                v * v * sy + 2 * v * u * cy + u * u * ty]);
    }
    return { pts, phase: (k * 0.137) % 1, share: a.share, obs: a.obs2022 };
  });
  function along(track, f) {
    const x = Math.max(0, Math.min(0.999, f)) * N, i = Math.floor(x), r = x - i;
    const a = track.pts[i], b = track.pts[i + 1] || track.pts[i];
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
  }

  // ---- scenes: camera + what is emphasised ----
  const SCENES = [
    { v: { longitude: -57, latitude: -16, zoom: 3.3, pitch: 35, bearing: -8 }, arcs: 1, field: .4, proof: 0, src: 1 },
    { v: { longitude: -57, latitude: -16, zoom: 3.05, pitch: 28, bearing: 0 }, arcs: .8, field: .3, proof: 0, src: 1 },
    { v: { longitude: -66.5, latitude: -6.2, zoom: 5.1, pitch: 46, bearing: 18 }, arcs: .5, field: 1, proof: 0, src: 1.7 },
    { v: { longitude: -60, latitude: -18, zoom: 3.6, pitch: 52, bearing: -14 }, arcs: 1, field: .7, proof: 0, src: 1.2 },
    { v: { longitude: -53, latitude: -27, zoom: 4.5, pitch: 40, bearing: 2 }, arcs: .35, field: .15, proof: 1, src: .6 },
    { v: { longitude: -67.25, latitude: -6, zoom: 6, pitch: 50, bearing: 24 }, arcs: .3, field: .8, proof: 0, src: 2 },
    { v: { longitude: -65.8, latitude: -6.6, zoom: 5.5, pitch: 52, bearing: 16 }, arcs: .25, field: .9, proof: 0, src: 2.4 },
    { v: { longitude: -64, latitude: -9, zoom: 4.3, pitch: 46, bearing: 14 }, arcs: .5, field: .7, proof: 0, src: 1.8 },
    { v: { longitude: -57, latitude: -17, zoom: 3.2, pitch: 24, bearing: 0 }, arcs: .9, field: .3, proof: 0, src: 1 },
  ];
  const lerp = (a, b, e) => a + (b - a) * e;
  function lerpView(a, b, e) {
    return { longitude: lerp(a.longitude, b.longitude, e), latitude: lerp(a.latitude, b.latitude, e),
             zoom: lerp(a.zoom, b.zoom, e), pitch: lerp(a.pitch, b.pitch, e),
             bearing: lerp(a.bearing, b.bearing, e) };
  }
  // emphasis values tween too
  function lerpEmph(a, b, e) {
    return { arcs: lerp(a.arcs, b.arcs, e), field: lerp(a.field, b.field, e),
             proof: lerp(a.proof, b.proof, e), src: lerp(a.src, b.src, e) };
  }

  // ---- layer builder ----
  function stateFill(em) {
    return (f) => {
      const uf = +f.properties.codarea;
      const st = ML.states.find((s) => s.uf === uf);
      const base = [20, 36, 56];
      if (em.proof > 0.02 && st && st.obs2022 != null) {
        const c = rgb(div(st.obs2022));
        return [lerp(base[0], c[0], em.proof), lerp(base[1], c[1], em.proof),
                lerp(base[2], c[2], em.proof), 235];
      }
      return [...base, 210];
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
    if (em.field > 0.02) layers.push(new HeatmapLayer({
      id: "field", data: ML.field_points, getPosition: (d) => [d[0], d[1]], getWeight: (d) => d[2],
      radiusPixels: 38, intensity: em.field * 1.2, threshold: 0.06,
      colorRange: [[8, 36, 52], [16, 96, 130], [0, 160, 150], [0, 212, 170], [150, 255, 215]],
    }));
    if (em.arcs > 0.02) layers.push(new ArcLayer({
      id: "arcs", data: ML.arcs, getSourcePosition: (d) => d.source, getTargetPosition: (d) => d.target,
      getSourceColor: [...TEAL, 230 * em.arcs], getTargetColor: (d) => [...rgb(div(d.obs2022 ?? 0)), 210 * em.arcs],
      widthUnits: "pixels", getWidth: (d) => 1.2 + Math.sqrt(d.share) * 1.7, getHeight: 0.45,
      updateTriggers: { getSourceColor: [em.arcs], getTargetColor: [em.arcs] },
    }));
    if (em.arcs > 0.05) {  // flowing particles
      const parts = [];
      tracks.forEach((tr) => {
        [0, 0.34, 0.67].forEach((off) => {
          const p = along(tr, (time * 0.11 + tr.phase + off) % 1);
          parts.push({ p, s: tr.share });
        });
      });
      layers.push(new ScatterplotLayer({
        id: "flow", data: parts, getPosition: (d) => d.p, radiusUnits: "pixels",
        getRadius: (d) => 1.6 + Math.sqrt(d.s) * 0.9, getFillColor: [180, 255, 230, 235 * em.arcs],
        updateTriggers: { getPosition: time },
      }));
    }
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

  // ---- deck instance + manual camera tween, with a non-WebGL fallback ----
  const wrap = document.getElementById("deckwrap");
  let cur = { ...SCENES[0].v }, emCur = { arcs: SCENES[0].arcs, field: SCENES[0].field, proof: SCENES[0].proof, src: SCENES[0].src };
  let from = null, emFrom = null, t0 = 0, target = SCENES[0], DUR = 2200;
  let deckgl = null, useDeck = false;

  function hasWebGL() {
    try { const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }

  // Static SVG map from the SAME committed data (map_layers + geo_uf). Shown when deck.gl
  // cannot run: no WebGL, init throw, or a lost WebGL context. The story still scrolls; only
  // the background swaps from the live 3D field to a static one. Never a blank canvas.
  let fbDrawn = false;
  function drawFallback(reason) {
    CINE.fallback = reason; CINE.ready = true; CINE.nScenes = SCENES.length; useDeck = false;
    if (fbDrawn) return; fbDrawn = true;
    const W = window.innerWidth, H = window.innerHeight;
    const proj = d3.geoMercator().fitExtent([[44, 44], [W - 44, H - 44]],
      { type: "MultiPoint", coordinates: [[-75, -34], [-44, 4]] });
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
    svg.append("g").selectAll("circle.n").data(ML.states).join("circle").attr("class", "n")
      .attr("cx", (d) => P(d.lon, d.lat)[0]).attr("cy", (d) => P(d.lon, d.lat)[1]).attr("r", (d) => 3 + 4 * Math.sqrt(d.share))
      .attr("fill", (d) => d.obs2022 == null ? "#9fb0c0" : div(d.obs2022)).attr("stroke", "#fff").attr("stroke-opacity", 0.5).attr("stroke-width", 0.6);
    const sp = P(ML.source.lon, ML.source.lat);
    svg.append("circle").attr("cx", sp[0]).attr("cy", sp[1]).attr("r", 9).attr("fill", "#00d4aa").attr("stroke", "#cffaf0").attr("stroke-width", 1.6);
    svg.append("text").attr("x", sp[0] + 12).attr("y", sp[1] + 4).attr("fill", "#8fe9d6").attr("font-size", 13).attr("font-weight", 600).text("Amazonas source");
    svg.append("text").attr("x", 18).attr("y", H - 16).attr("fill", "#5a6b86").attr("font-size", 11)
      .text("Static map (3D view unavailable in this browser); same committed data.");
  }

  if (!hasWebGL()) {
    drawFallback("no-webgl");
  } else {
    try {
      deckgl = new Deck({
        parent: wrap, views: new MapView({ repeat: false }), controller: false,
        width: window.innerWidth, height: window.innerHeight, viewState: cur,
        layers: buildLayers(emCur, 0),
        onError: (e) => CINE.errors.push(e.message),
      });
      useDeck = true; CINE.ready = true; CINE.nScenes = SCENES.length;
      const cv = wrap.querySelector("canvas");
      if (cv) cv.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); drawFallback("context-lost"); }, false);
    } catch (e) { CINE.errors.push("init: " + e.message); drawFallback("init"); }
  }

  function resize() { if (useDeck && deckgl) deckgl.setProps({ width: window.innerWidth, height: window.innerHeight }); }
  window.addEventListener("resize", resize);

  function go(i) {
    if (i === CINE.scene && from === null) return;
    CINE.scene = i;
    if (!useDeck) return;
    from = { ...cur }; emFrom = { ...emCur }; target = SCENES[i]; t0 = performance.now();
  }

  function frame(now) {
    if (!useDeck || !deckgl) return;
    if (from) {
      const k = Math.min(1, (now - t0) / DUR), e = d3.easeCubicInOut(k);
      cur = lerpView(from, target.v, e);
      emCur = lerpEmph(emFrom, { arcs: target.arcs, field: target.field, proof: target.proof, src: target.src }, e);
      if (k >= 1) from = null;
    }
    const time = now / 1000;
    const layers = buildLayers(emCur, time);
    try { deckgl.setProps({ viewState: cur, layers }); }
    catch (e) { CINE.errors.push("frame: " + e.message); drawFallback("frame-error"); return; }
    CINE.frames = (CINE.frames || 0) + 1;
    CINE.view = cur; CINE.nLayers = layers.length;
    requestAnimationFrame(frame);
  }
  if (useDeck) requestAnimationFrame(frame);

  // ---- scrollama ----
  const legend = document.getElementById("legend");
  function setLegend(i) {
    if (i === 4) { legend.innerHTML = '<i style="background:#e63946"></i>soy lost &nbsp; <i style="background:#f4d35e"></i>steady &nbsp; <i style="background:#43aa8b"></i>resilient'; legend.classList.add("show"); }
    else legend.classList.remove("show");
  }
  const scroller = scrollama();
  scroller.setup({ step: ".step", offset: 0.6 }).onStepEnter(({ element, index }) => {
    document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
    element.classList.add("active");
    go(index); setLegend(index);
    document.getElementById("hint").style.opacity = index === 0 ? "1" : "0";
  });
  window.addEventListener("resize", scroller.resize);

  // progress bar
  addEventListener("scroll", () => {
    const h = document.documentElement;
    document.getElementById("prog").style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + "%";
  }, { passive: true });
})();
