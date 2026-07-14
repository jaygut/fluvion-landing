/* andes_stage.js - the cinematic geographic stage + scene controller for the Andean landing.
   Builds a RECOGNIZABLE map of northern South America from window.ANDES_DATA.map.geo (a filled land
   polygon, the coastline, the Amazon + Orinoco basin outlines, a graticule, and committed labels) with
   the 0.5deg RECON source cells on top, and DATA-DRIVEN moisture-flow ribbons whose WIDTH is the
   audited sink-centric share (window.ANDES_DATA.corridors[].flows). A deck.gl path renders on a GPU; a
   first-class D3 SVG fallback (viewBox-tween camera) renders everywhere else, including headless.
   Every drawn geometry is a projection of committed data; the ribbon path links two real endpoints
   (basin flow-weighted source centroid -> the water tower) and uses the reduced ERA5 IVT mean only
   for visual curvature. Publishes
   window.__CINE (for the atmosphere) and window.__STAGE (for headless verification). */
(function () {
  "use strict";
  var A = window.ANDES_DATA;
  var errors = [];
  var deckwrap = document.getElementById("deckwrap");

  // ---- scene model (data-scene string keys) : focus {lon,lat,span deg}, camera pitch, ribbon emphasis
  // hook + engine + ask open on the whole continent so the Amazon reads in perspective; quito/bogota/
  // honesty zoom to the water towers. A city sink is a single dot inside a faint 0.5deg RECON cell.
  var SCENES = {
    hook:    { focus: { lon: -62, lat: -4,    span: 60 }, pitch: 0,  cells: .5,  arcs: .55, sinks: .8, focusCorridor: null, emit: .5,  turb: .3,  bloom: .5 },
    quito:   { focus: { lon: -73.5, lat: -1,  span: 19 }, pitch: 0,  cells: 1,   arcs: 1,   sinks: 1,  focusCorridor: "amazon_quito_paramo", emit: .7, turb: .35, bloom: .6 },
    bogota:  { focus: { lon: -72.5, lat: 3,   span: 20 }, pitch: 0,  cells: 1,   arcs: 1,   sinks: 1,  focusCorridor: "amazon_bogota_paramo", emit: .6, turb: .35, bloom: .55 },
    season:  { focus: { lon: -74, lat: 2,     span: 22 }, pitch: 0,  cells: .85, arcs: .8,  sinks: 1,  focusCorridor: null, emit: .6,  turb: .5,  bloom: .55 },
    honesty: { focus: { lon: -78, lat: -0.25, span: 6 },  pitch: 0,  cells: .95, arcs: .25, sinks: 1,  focusCorridor: "amazon_quito_paramo", emit: .4, turb: .3, bloom: .45 },
    engine:  { focus: { lon: -62, lat: -4,    span: 58 }, pitch: 0,  cells: .5,  arcs: .55, sinks: .7, focusCorridor: null, emit: .5,  turb: .4,  bloom: .55 },
    ask:     { focus: { lon: -62, lat: -4,    span: 60 }, pitch: 0,  cells: .5,  arcs: .4,  sinks: .7, focusCorridor: null, emit: .45, turb: .3, bloom: .5 }
  };
  var SCENE_IDS = Object.keys(SCENES);

  var ILLUS = {
    hook: "Ribbon width is the measured Amazon share of each city's rain. Particles rise from the Amazon and Orinoco basin sources and ride the prevailing wind (ERA5) to each city; their colour and number are the measured shares, their motion is mechanism, not a forecast.",
    quito: "Teal particles rise from the Amazon and ride the easterly wind up the Andes to Quito. The teal ribbon's width is the measured Amazon share; motion is mechanism, not a forecast.",
    bogota: "Amber Orinoco particles outnumber the teal Amazon ones here, the measured mix. The wider amber ribbon is Bogota's larger Orinoco share, the thin teal ribbon the Amazon slice. Widths are measured shares.",
    season: "Step to the dry season and the Amazon particle flux rises with its measured seasonal share. A seasonal cross-check, never a time series and never a forecast.",
    honesty: "The coarse source-map cell dwarfs the paramo intake marked by the dot inside it. A region, not a pixel."
  };

  var CLASS_COLOR = {}, BASIN_RGB = {}, TEALB = "#2bd4c4", PANEL = "#0e2738";
  function tok(n, f) { var v = getComputedStyle(document.documentElement).getPropertyValue(n); return (v || f).trim(); }
  function resolveColors() {
    CLASS_COLOR = { amazon: tok("--teal", "#1aa89b"), orinoco: tok("--amber", "#f2a24e"),
      other_land: tok("--green", "#3ad6a3"), ocean: "#14283a" };
    BASIN_RGB = { amazon: [43, 212, 196], orinoco: [242, 162, 78], other_sa_land: [58, 214, 163] };
    TEALB = tok("--teal-bright", "#2bd4c4"); PANEL = tok("--panel", "#0e2738");
  }
  function hexRGB(h) { h = (h || "").replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, function (m) { return m + m; });
    return [parseInt(h.substr(0, 2), 16) || 40, parseInt(h.substr(2, 2), 16) || 70, parseInt(h.substr(4, 2), 16) || 90]; }

  // ---- geo projection for SVG: userspace = [lon, -lat] (north up) ------------------------------
  function px(lon) { return lon; }
  function py(lat) { return -lat; }
  function ringPath(r) { return "M" + r.map(function (p) { return px(p[0]) + "," + py(p[1]); }).join("L") + "Z"; }
  function linePath(r) { return "M" + r.map(function (p) { return px(p[0]) + "," + py(p[1]); }).join("L"); }
  // DISPLAY-ONLY cartographic smoothing: centripetal Catmull-Rom (alpha 0.5) rounds the coarse
  // HydroBASINS vertices into refined curves without self-intersection or overshoot. It changes
  // nothing that is computed - masks, attribution, sink boxes, ribbon widths are all untouched; this
  // only interpolates the polylines drawn on screen.
  function _projPts(r) { return r.map(function (p) { return [px(p[0]), py(p[1])]; }); }
  var _curveLine = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
  var _curveRing = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
  function smoothLine(r) { return _curveLine(_projPts(r)); }
  function smoothRing(r) { return _curveRing(_projPts(r)); }
  function imageBox(asset) {
    var b = asset.bbox;
    return { x: px(b.lon_min), y: py(b.lat_max), w: b.lon_max - b.lon_min, h: b.lat_max - b.lat_min };
  }

  // ---- data-driven ribbon list (drawn flows only), {from,to,cls,share,sink} --------------------
  var ribbonData = [];
  (A && A.corridors ? A.corridors : []).forEach(function (cor) {
    (cor.flows || []).filter(function (f) { return f.draw; }).forEach(function (f) {
      ribbonData.push({ from: f.from, to: f.to, cls: f.cls, share: f.share, sink: cor.id });
    });
  });
  ribbonData.sort(function (a, b) { return b.share - a.share; }); // fat first (thin drawn on top)
  function ribbonWidthPx(share) { return 1.5 + 22 * share; }      // 0.089->3.5px .133->4.4 .207->6 .319->8.5
  function ribbonPath(d) {
    var ax = px(d.from[0]), ay = py(d.from[1]), bx = px(d.to[0]), by = py(d.to[1]);
    var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    var meanU = A.map.transport ? A.map.transport.mean_u : -1;
    var meanV = A.map.transport ? A.map.transport.mean_v : 0;
    var field = Math.hypot(meanU, meanV) || 1;
    var nx = -meanV / field, ny = meanU / field;
    var bend = (d.cls === "orinoco" ? -0.08 : 0.12) * len;
    var c1x = ax + dx * 0.34 + nx * bend, c1y = ay + dy * 0.34 + ny * bend;
    var c2x = ax + dx * 0.70 + nx * bend * 0.55, c2y = ay + dy * 0.70 + ny * bend * 0.55;
    return "M" + ax + "," + ay + " C" + c1x + "," + c1y + " " + c2x + "," + c2y + " " + bx + "," + by;
  }

  // (The static ERA5 streamline layer was removed: the flowing particle atmosphere now carries the
  // wind/flow story, and the old streamlines leaked west into the Pacific as stray "random" lines.)

  // ---- SVG stage (primary + fallback) ---------------------------------------------------------
  var svg, gWorld, gLabels, curBox, animId, mode = "svg", labelSel;
  var W0 = A && A.map ? A.map.window : { lat_min: -14, lat_max: 13, lon_min: -82, lon_max: -58 };
  function fullBox() { return { x: px(W0.lon_min), y: py(W0.lat_max), w: (W0.lon_max - W0.lon_min), h: (W0.lat_max - W0.lat_min) }; }
  function focusBox(f) {
    var aspect = (deckwrap.clientWidth || 1200) / (deckwrap.clientHeight || 800);
    var hh = f.span / aspect;
    return { x: px(f.lon) - f.span / 2, y: py(f.lat) - hh / 2, w: f.span, h: hh };
  }
  function boxStr(b) { return b.x + " " + b.y + " " + b.w + " " + b.h; }
  var LABEL_PX = { sink: 15, country: 13, region: 12, ocean: 11 };

  function buildSVG() {
    resolveColors();
    var geo = A.map.geo;
    svg = d3.select(deckwrap).append("svg").attr("preserveAspectRatio", "xMidYMid slice")
      .attr("role", "img").attr("aria-label", "Northern South America: source basins, the Quito and Bogota paramo water towers, and the measured moisture-source ribbons");
    curBox = fullBox(); svg.attr("viewBox", boxStr(curBox));
    gWorld = svg.append("g");
    var defs = svg.append("defs");
    defs.append("filter").attr("id", "andesGlow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%")
      .append("feGaussianBlur").attr("stdDeviation", "0.09").attr("result", "blur");
    defs.select("#andesGlow").append("feMerge").html('<feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/>');

    // baked terrain relief: build-time elevation tiles, runtime-offline PNGs
    var relief = A.map.relief && A.map.relief.assets ? A.map.relief.assets : {};
    var gr = gWorld.append("g").attr("class", "relief");
    ["overview", "quito", "bogota"].forEach(function (k) {
      if (!relief[k]) return;
      var ib = imageBox(relief[k]);
      gr.append("image").attr("class", "relief-img relief-" + k).attr("href", relief[k].href)
        .attr("x", ib.x).attr("y", ib.y).attr("width", ib.w).attr("height", ib.h)
        .attr("preserveAspectRatio", "none").attr("opacity", k === "overview" ? 0.92 : 0.0);
    });

    // land fill (transparent mass over the relief so the continent reads without hiding terrain)
    gWorld.append("path").attr("class", "land").attr("d", smoothRing(geo.land_fill[0]))
      .attr("fill", PANEL).attr("stroke", "none").attr("opacity", 0.28);
    // basin fills + outlines (smoothed for refined cartography)
    var gb = gWorld.append("g").attr("class", "basins");
    gb.append("path").attr("d", smoothRing(geo.basins.amazon[0])).attr("fill", "rgba(26,168,155,.16)").attr("stroke", "rgba(26,168,155,.5)").attr("stroke-width", 0.055).attr("stroke-linejoin", "round");
    gb.append("path").attr("d", smoothRing(geo.basins.orinoco[0])).attr("fill", "rgba(242,162,78,.15)").attr("stroke", "rgba(242,162,78,.5)").attr("stroke-width", 0.055).attr("stroke-linejoin", "round");
    // graticule
    var gg = gWorld.append("g").attr("class", "grat");
    geo.graticule.parallels.concat(geo.graticule.meridians).forEach(function (l) {
      gg.append("path").attr("d", linePath(l.seg)).attr("fill", "none").attr("stroke", "rgba(39,64,86,.6)").attr("stroke-width", 0.04);
    });
    // cells (ocean recedes; land = texture on top of the fill)
    var gc = gWorld.append("g").attr("class", "cells");
    gc.selectAll("rect").data(A.map.cells).enter().append("rect")
      .attr("x", function (d) { return px(d.lon) - 0.25; }).attr("y", function (d) { return py(d.lat) - 0.25; })
      .attr("width", 0.5).attr("height", 0.5)
      .attr("fill", function (d) { return CLASS_COLOR[d.c] || "#33465a"; })
      .attr("opacity", function (d) { return d.c === "ocean" ? 0.0 : 0.13; });

    // (No static streamline layer: the p5 particle atmosphere carries the ERA5-curved flow instead.)

    // coastline hairline on top -> the silhouette pops (smoothed, round joins)
    var gco = gWorld.append("g").attr("class", "coast");
    geo.coastline.forEach(function (pl) {
      gco.append("path").attr("d", smoothLine(pl)).attr("fill", "none").attr("stroke", TEALB)
        .attr("stroke-width", 0.07).attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("opacity", 0.85);
    });
    // ribbons (width = audited share, in degrees userspace)
    var ga = gWorld.append("g").attr("class", "arcs");
    ga.selectAll("path").data(ribbonData).enter().append("path")
      .attr("d", ribbonPath)
      .attr("fill", "none").attr("stroke-linecap", "round")
      .attr("stroke", function (d) { var c = BASIN_RGB[d.cls] || [120, 150, 180]; return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; })
      .attr("vector-effect", "non-scaling-stroke")
      .attr("filter", "url(#andesGlow)")
      .attr("stroke-width", function (d) { return ribbonWidthPx(d.share); }).attr("opacity", 0.86);
    // each city sink: a single clean SITE DOT inside a faint 0.5deg RECON cell footprint. The dot marks
    // the water tower; the pale square is the coarse regional cell (dwarfing the intake in the honesty
    // close-up). No corner ticks, no dashes, no rings - a debug box read as amateur.
    var gs = gWorld.append("g").attr("class", "sinks");
    var sinkG = gs.selectAll("g.sink-footprint").data(A.map.sinks).enter().append("g").attr("class", "sink-footprint");
    sinkG.each(function (d) {
      var g = d3.select(this);
      var x0 = d.box.lon_min, y0 = -d.box.lat_max, w = d.box.lon_max - d.box.lon_min, h = d.box.lat_max - d.box.lat_min;
      var cx = x0 + w / 2, cy = y0 + h / 2;
      g.append("rect").attr("class", "sink-cell").attr("x", x0).attr("y", y0).attr("width", w).attr("height", h)
        .attr("fill", "rgba(43,212,196,.06)").attr("stroke", "rgba(190,230,226,.34)").attr("stroke-width", 0.02)
        .attr("stroke-linejoin", "round");
      g.append("circle").attr("class", "sink-dot").attr("cx", cx).attr("cy", cy).attr("r", 0.12)
        .attr("fill", "#eaf7f4").attr("stroke", "rgba(6,20,31,.85)").attr("stroke-width", 0.03);
    });
    // labels (SVG text; font-size kept ~constant px by rescaling with the camera each frame)
    gLabels = gWorld.append("g").attr("class", "labels");
    labelSel = gLabels.selectAll("text").data(geo.labels).enter().append("text")
      .attr("x", function (d) { return px(d.lon); }).attr("y", function (d) { return py(d.lat); })
      .attr("text-anchor", "middle").attr("dy", function (d) { return d.kind === "sink" ? -0.5 : 0.3; })
      .attr("font-family", "var(--mono)").attr("font-weight", function (d) { return d.kind === "sink" ? 700 : 500; })
      .attr("fill", function (d) { return d.kind === "ocean" ? tok("--faint", "#5c6e78") : "#eaf2f2"; })
      .attr("paint-order", "stroke").attr("stroke", "rgba(6,20,31,.6)").attr("stroke-width", 0.02)
      .text(function (d) { return d.text; });
    rescaleLabels();
    return (gc.selectAll("rect").size() > 0);
  }
  function rescaleLabels() {
    if (!labelSel || !curBox) return;
    var Wpx = deckwrap.clientWidth || 1200;
    labelSel.attr("font-size", function (d) { return (LABEL_PX[d.kind] || 11) * curBox.w / Wpx; })
      .attr("stroke-width", function () { return 0.12 * curBox.w / Wpx; });
  }

  // ---- deck.gl stage (GPU; progressive enhancement) -------------------------------------------
  var deckInst = null;
  function webglOK() {
    // Default to the D3 SVG stage: it draws the full basemap (land + coastline + basins + graticule +
    // labels) and the data-driven, width-encoded flow ribbons on EVERY device with no GPU, and is
    // fully verifiable headless. The deck.gl 3D-pitched stage is opt-in via ?deck for real GPUs
    // (software WebGL / SwiftShader constructs deck layers but does not paint them reliably).
    if (window.__NO_DECK || !/[?&]deck\b/.test(location.search)) return false;
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))); } catch (e) { return false; }
  }
  function spanToZoom(span) { return Math.max(2.6, Math.min(6.8, Math.log2(360 / span) + 0.35)); }
  function buildDeck() {
    if (!window.deck || !webglOK()) return false;
    try {
      var f = SCENES.hook;
      deckInst = new deck.DeckGL({
        container: deckwrap, controller: false, style: { background: "transparent" },
        initialViewState: { longitude: f.focus.lon, latitude: f.focus.lat, zoom: spanToZoom(f.focus.span), pitch: f.pitch, bearing: 0 },
        layers: deckLayers(SCENES.hook)
      });
      mode = "deck"; return true;
    } catch (e) { errors.push("deck:" + e.message); deckInst = null; return false; }
  }
  function deckLayers(sc) {
    resolveColors();
    var geo = A.map.geo;
    var landFillL = new deck.PolygonLayer({ id: "land", data: [{ poly: geo.land_fill[0] }],
      getPolygon: function (d) { return d.poly; }, filled: true, stroked: false, getFillColor: [14, 39, 56, 255] });
    var basinFillL = new deck.PolygonLayer({ id: "basins",
      data: [{ poly: geo.basins.amazon[0], rgb: [26, 168, 155], a: 60 }, { poly: geo.basins.orinoco[0], rgb: [242, 162, 78], a: 55 }],
      getPolygon: function (d) { return d.poly; }, filled: true, stroked: true,
      getFillColor: function (d) { return [d.rgb[0], d.rgb[1], d.rgb[2], d.a]; },
      getLineColor: function (d) { return [d.rgb[0], d.rgb[1], d.rgb[2], 150]; }, getLineWidth: 1.4, lineWidthUnits: "pixels" });
    var graticuleL = new deck.PathLayer({ id: "grat",
      data: geo.graticule.parallels.concat(geo.graticule.meridians).map(function (x) { return { path: x.seg }; }),
      getPath: function (d) { return d.path; }, getColor: [39, 64, 86, 130], getWidth: 1, widthUnits: "pixels" });
    var cellsL = new deck.ScatterplotLayer({ id: "cells", data: A.map.cells,
      getPosition: function (d) { return [d.lon, d.lat]; }, getRadius: 15000, radiusUnits: "meters", stroked: false,
      getFillColor: function (d) { if (d.c === "ocean") return [20, 40, 58, 0]; var c = hexRGB(CLASS_COLOR[d.c]); return [c[0], c[1], c[2], Math.round(120 * sc.cells)]; },
      updateTriggers: { getFillColor: [sc.cells] } });
    var coastL = new deck.PathLayer({ id: "coast", data: geo.coastline.map(function (r) { return { path: r }; }),
      getPath: function (d) { return d.path; }, getColor: [43, 212, 196, 235], getWidth: 1.6, widthUnits: "pixels", widthMinPixels: 1 });
    var arcsL = new deck.ArcLayer({ id: "arcs", data: ribbonData,
      getSourcePosition: function (d) { return d.from; }, getTargetPosition: function (d) { return d.to; },
      getSourceColor: function (d) { var c = BASIN_RGB[d.cls] || [120, 150, 180]; return [c[0], c[1], c[2], Math.round(210 * ribbonAlpha(sc, d))]; },
      getTargetColor: function (d) { var c = BASIN_RGB[d.cls] || [120, 150, 180]; return [c[0], c[1], c[2], Math.round(240 * ribbonAlpha(sc, d))]; },
      getWidth: function (d) { return ribbonWidthPx(d.share); }, widthUnits: "pixels", widthMinPixels: 2, widthMaxPixels: 16,
      getHeight: 0.42, greatCircle: false, updateTriggers: { getSourceColor: [sc.arcs, sc.focusCorridor], getTargetColor: [sc.arcs, sc.focusCorridor] } });
    var sinkL = new deck.PolygonLayer({ id: "sinks", data: A.map.sinks, stroked: true, filled: true,
      getPolygon: function (d) { var b = d.box; return [[[b.lon_min, b.lat_min], [b.lon_max, b.lat_min], [b.lon_max, b.lat_max], [b.lon_min, b.lat_max]]]; },
      getFillColor: [43, 212, 196, Math.round(18 * sc.sinks)],
      getLineColor: [190, 230, 226, Math.round(150 * sc.sinks)], getLineWidth: 1.1, lineWidthUnits: "pixels", lineWidthMinPixels: 1,
      updateTriggers: { getFillColor: [sc.sinks], getLineColor: [sc.sinks] } });
    var siteDotsL = new deck.ScatterplotLayer({ id: "sitedots", data: A.map.sinks,
      getPosition: function (d) { var b = d.box; return [(b.lon_min + b.lon_max) / 2, (b.lat_min + b.lat_max) / 2]; },
      getRadius: 6, radiusUnits: "pixels", radiusMinPixels: 4, stroked: true, getLineColor: [6, 20, 31, 220], lineWidthUnits: "pixels", getLineWidth: 1.4,
      getFillColor: [234, 247, 244, 240] });
    var labelL = new deck.TextLayer({ id: "labels", data: geo.labels,
      getPosition: function (d) { return [d.lon, d.lat]; }, getText: function (d) { return d.text; },
      getSize: function (d) { return LABEL_PX[d.kind] || 11; }, sizeUnits: "pixels",
      getColor: function (d) { return d.kind === "ocean" ? [140, 163, 173, 220] : [234, 242, 242, 240]; },
      fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, getPixelOffset: function (d) { return d.kind === "sink" ? [0, -12] : [0, 0]; },
      background: true, getBackgroundColor: [6, 20, 31, 160], backgroundPadding: [3, 1] });
    return [landFillL, basinFillL, graticuleL, cellsL, coastL, arcsL, sinkL, siteDotsL, labelL];
  }
  function ribbonAlpha(sc, d) {
    var base = sc.arcs;
    if (sc.focusCorridor && d.sink !== sc.focusCorridor) base *= 0.06; // hide the other city's ribbons
    return Math.max(0, Math.min(1, base));
  }

  // ---- camera + emphasis tween ----------------------------------------------------------------
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function project(lonlat) {
    if (!curBox) return null;
    var Wpx = deckwrap.clientWidth, Hpx = deckwrap.clientHeight;
    return [(px(lonlat[0]) - curBox.x) / curBox.w * Wpx, (py(lonlat[1]) - curBox.y) / curBox.h * Hpx];
  }
  var cine = { scene: "hook", emphasis: SCENES.hook, project: project, useDeck: false, ready: false, ribbons: ribbonData };
  window.__CINE = cine;

  function tweenSVGCamera(target) {
    if (animId) cancelAnimationFrame(animId);
    var from = curBox, dur = 950, t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = easeInOut(Math.min(1, (ts - t0) / dur));
      curBox = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k,
        w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k };
      if (svg) svg.attr("viewBox", boxStr(curBox));
      rescaleLabels();
      if (k < 1) animId = requestAnimationFrame(step);
    }
    animId = requestAnimationFrame(step);
  }

  function go(sceneId) {
    var sc = SCENES[sceneId]; if (!sc) return;
    cine.scene = sceneId; cine.emphasis = sc;
    if (mode === "deck" && deckInst) {
      try {
        deckInst.setProps({ layers: deckLayers(sc), viewState: { longitude: sc.focus.lon, latitude: sc.focus.lat,
          zoom: spanToZoom(sc.focus.span), pitch: sc.pitch, bearing: 0, transitionDuration: 950, transitionInterpolator: new deck.FlyToInterpolator() } });
        curBox = focusBox(sc.focus);
      } catch (e) { errors.push("go-deck:" + e.message); }
    } else {
      tweenSVGCamera(focusBox(sc.focus));
      if (gWorld) {
        gWorld.select(".cells").selectAll("rect").attr("opacity", function (d) { return d.c === "ocean" ? 0.0 : 0.13 * sc.cells; });
        gWorld.select(".arcs").selectAll("path").attr("opacity", function (d) { return 0.2 + 0.75 * ribbonAlpha(sc, d); });
        // site dots always legible; the faint cell square strengthens in the honesty close-up
        gWorld.select(".sinks").selectAll(".sink-dot").attr("opacity", 0.92);
        gWorld.select(".sinks").selectAll(".sink-cell").attr("opacity", sceneId === "honesty" ? 0.95 : (0.3 + 0.45 * sc.sinks));
        var quitoFocus = sc.focusCorridor === "amazon_quito_paramo" || sceneId === "season";
        var bogotaFocus = sc.focusCorridor === "amazon_bogota_paramo" || sceneId === "season";
        gWorld.select(".relief-overview").attr("opacity", (quitoFocus || bogotaFocus) ? 0.42 : 0.92);
        gWorld.select(".relief-quito").attr("opacity", quitoFocus ? 0.94 : 0.0);
        gWorld.select(".relief-bogota").attr("opacity", bogotaFocus ? 0.94 : 0.0);
      }
    }
  }

  // ---- overlay: illustrative caption (the basin key lives in the in-card wedge legend) ----------
  var legendEl = document.getElementById("legend"), illusEl = document.getElementById("illus");
  // scenes whose card sits on the LEFT -> put the caption on the RIGHT so it never overlaps the card
  var LEFT_CARD = { bogota: 1 };
  function setLegend(sceneId) {
    if (legendEl) { legendEl.classList.remove("show"); }
    var I = ILLUS[sceneId];
    if (I && illusEl) {
      illusEl.innerHTML = "<b>Illustrative.</b> " + I;
      illusEl.classList.toggle("rightside", !!LEFT_CARD[sceneId]);
      illusEl.classList.add("show");
    } else if (illusEl) { illusEl.classList.remove("show"); }
  }

  // ---- boot -----------------------------------------------------------------------------------
  function boot() {
    if (!A || !A.map || !A.map.geo || !deckwrap) { errors.push("no ANDES_DATA.map.geo"); publish(0); return; }
    resolveColors();
    if (!buildDeck()) { buildSVG(); mode = "svg"; }
    cine.useDeck = (mode === "deck"); cine.ready = true;

    if (window.scrollama) {
      var scroller = scrollama();
      scroller.setup({ step: ".step", offset: 0.6 }).onStepEnter(function (r) {
        document.querySelectorAll(".step").forEach(function (s) { s.classList.remove("active"); });
        r.element.classList.add("active");
        go(r.element.dataset.scene); setLegend(r.element.dataset.scene);
      });
      window.addEventListener("resize", function () { scroller.resize(); rescaleLabels(); });
    } else { errors.push("no scrollama"); }
    var prog = document.getElementById("prog"), hint = document.getElementById("hint");
    window.addEventListener("scroll", function () {
      var h = document.documentElement, s = h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1);
      if (prog) prog.style.width = (s * 100) + "%";
      if (hint) hint.style.opacity = s > 0.02 ? 0 : 0.85;
    }, { passive: true });
    go("hook"); setLegend("hook");
    publish(mode === "deck" ? 8 : (gWorld ? 8 : 0));
  }

  function publish(nLayers) {
    var coastVerts = (A && A.map && A.map.geo) ? A.map.geo.coastline.reduce(function (s, p) { return s + p.length; }, 0) : 0;
    window.__STAGE = {
      ready: !!cine.ready, errors: errors, nScenes: SCENE_IDS.length, mode: mode, nLayers: nLayers || 0,
      sceneIds: SCENE_IDS, project: project, ribbons: ribbonData, ribbonWidthSource: "sink_centric",
      geo: { coastVerts: coastVerts, labels: (A && A.map && A.map.geo) ? A.map.geo.labels.length : 0,
        transportFlows: gWorld ? gWorld.select(".transport").selectAll("path").size() : 0 },
      corridors: (A && A.corridors) ? A.corridors.map(function (c) { return c.short; }) : []
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
