/* ============================================================================
   atmosphere.js  ·  Fluvion "Living Precipitationshed" (v2, experimental)
   ----------------------------------------------------------------------------
   ALGORITHMIC PHILOSOPHY  ·  "Respiration Fields"

   A forest does not pump water; it breathes it. This layer renders that breath
   as a divergence-free flow: thousands of Lagrangian tracers released from the
   western-Amazon source box, advected down a climatological NW->SE channel that
   is deflected east off the Andes, and rained out over the soy belt in
   proportion to the engine's share weights. Turbulence is curl noise (the curl
   of a Perlin potential, so the field neither sources nor sinks mass), sampled
   on a coarse grid and bilinearly interpolated per particle: organic motion at
   a price the frame budget can pay. Colour is phase, not decoration: teal vapour
   at the source, water-blue in transport, amber where it falls as rain.

   The soul of the piece is the GRADE. A degraded forest does not make less rain
   on average; it makes the SAME rain less reliably. So the grade parameter moves
   only the second moment: at "intact" the breath is laminar and steady; at
   "degraded" the emission gusts and stutters with intermittent drought-tail
   collapses that later surge to repay the debt. The long-run mean is conserved
   BY CONSTRUCTION (a credit bucket whose inflow ignores the grade), while the
   short-run variance and the dry tail grow. This is the same honesty rule as the
   copy, enforced in arithmetic: more degradation never paints less average rain.

   Determinism is provenance, not polish. A fixed seed reproduces every frame of
   the field; the default seed is 42, the engine's own Monte-Carlo seed. Particle
   counts, speeds and turbulence are DECORATIVE and labelled illustrative; the
   numbers that matter (the headline attribution, weight, price and VaR) live in the
   data layer and are never touched here. Any temporal motion illustrates the
   mechanism; it is never a time series and never a forecast.

   Built as an additive, transparent p5.js overlay, geo-locked each frame to the
   deck.gl camera through a projector handed in by cinematic_v2.js (or a static
   d3.geoMercator in the non-WebGL fallback). It reads window.__CINE (scene,
   projector, per-scene mood); it writes window.__ATMO for headless verification.
   ============================================================================ */
(function () {
  "use strict";
  const D = window.FLUVION_DATA || {};
  const ATMO = (window.__ATMO = {
    ready: false, seed: 42, particleCount: 0, fps: 0, grade: 0, mode: "init", errors: [],
  });

  // ---- corridor + boxes (degrees) ----
  const ML = D.map_layers || {};
  const SRC = ML.source || { lon: -67.25, lat: -6.0 };
  const SBOX = (D.source_parcels && D.source_parcels.source_box) || ML.source_box ||
               { lat_min: -8, lat_max: -4, lon_min: -72.5, lon_max: -62 };
  const SINK = ML.sink_box || { lat_min: -34, lat_max: -10, lon_min: -64, lon_max: -45 };
  const COR = { lonMin: -80, lonMax: -40, latMin: -40, latMax: 4 };

  // ---- illustrative parcel emission centres inside the source box (decorative;
  //      real polygons are private, only names + areas ship). Weighted by area. ----
  // Emission rides the fixed flying-river edges (see ATRACKS below): particles are released
  // at the shared source and assigned an arc weighted by production share, so the interactive
  // flow fans out exactly along the deck.gl ArcLayer and reinforces "a fifth reaches the soy belt".

  // ---- default illustrative grade for the monitor scene, from observed ET
  //      dry-season volatility (descriptive, NOT a forecast; art only) ----
  const FOREST_GRADE = (function () {
    try {
      const an = (D.forest_condition && D.forest_condition.et_anomaly) || [];
      if (an.length < 60) return 0.5;
      const half = Math.floor(an.length / 2);
      const sd = (arr) => {
        const m = arr.reduce((a, b) => a + b, 0) / arr.length;
        return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
      };
      const e = sd(an.slice(0, half).map((x) => x.anom));
      const l = sd(an.slice(half).map((x) => x.anom));
      return Math.max(0.2, Math.min(0.85, (l - e) / Math.max(1e-6, l))); // ~0.5 on real data
    } catch (e) { return 0.5; }
  })();

  // ---- small math ----
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  function mix3(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
  const TEAL = [58, 214, 163], WATER = [43, 212, 196], AMBER = [232, 105, 77], VAPOUR = [150, 255, 210];

  // ---- the FIXED flying-river edges = the deck.gl ArcLayer ground tracks. Each particle
  //      rides one of these (share-weighted), so the interactive flow follows the same fan
  //      the fixed arcs draw. Quadratic-bezier ground track with a lateral bow, matching the
  //      v1 arc tracks. This is the base trend; curl noise (below) only adds organic wander. ----
  const ATRACKS = (function () {
    const arcs = (ML.arcs || []).filter((a) => a && a.source && a.target);
    if (!arcs.length) return [];
    const totShare = arcs.reduce((s, a) => s + Math.max(0.05, +a.share || 0.2), 0);
    let acc = 0; const N = 40;
    return arcs.map((a) => {
      const sx = a.source[0], sy = a.source[1], tx = a.target[0], ty = a.target[1];
      const mx = (sx + tx) / 2, my = (sy + ty) / 2, dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, bulge = len * 0.16, cx = mx + nx * bulge, cy = my + ny * bulge;
      const pts = []; let lenDeg = 0;
      for (let i = 0; i <= N; i++) {
        const u = i / N, v = 1 - u;
        const x = v * v * sx + 2 * v * u * cx + u * u * tx, y = v * v * sy + 2 * v * u * cy + u * u * ty;
        if (i) lenDeg += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
        pts.push([x, y]);
      }
      acc += Math.max(0.05, +a.share || 0.2) / totShare;
      return { pts, dest: [tx, ty], lenDeg: Math.max(2, lenDeg), cum: acc, N };
    });
  })();
  function alongTrack(tr, u) {
    const N = tr.N, x = clamp(u, 0, 1) * N, i = x | 0, r = x - i;
    const a = tr.pts[i], b = tr.pts[Math.min(N, i + 1)];
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
  }

  // ---- coarse curl-noise field: divergence-free organic turbulence layered onto the edges ----
  const GW = 46, GH = 50;
  const dLon = (COR.lonMax - COR.lonMin) / (GW - 1), dLat = (COR.latMax - COR.latMin) / (GH - 1);
  const fldVX = new Float32Array(GW * GH), fldVY = new Float32Array(GW * GH);

  // ============================ p5 sketch ============================
  let inst = null;
  const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MOBILE = Math.min(window.innerWidth, window.innerHeight) < 620;

  const sketch = (p) => {
    let trail = null, W = 0, H = 0;
    let MAXP = REDUCED ? 1400 : MOBILE ? 1300 : 3000; // decorative cap; throttled below
    let MAXP_soft = MAXP;
    let particles = null, free = [], nt = 0, frame = 0;
    let credit = 0, curGrade = 0, gradeUser = null, touched = false;
    const sparks = []; // short-lived rain shimmer, lon/lat
    let pulseT = 0;

    // reliability signal (held at mean 1) drives both the gusts and the honest readout
    let tickClock = 0, tickClock2 = 0, rNorm = 1, rbar = 1;
    const RING = 64; const ring = new Float32Array(RING).fill(1); let rh = 0; // ~3.2s window
    let lastNow = 0, fpsE = 60;

    // p5 RNG is fully seeded in setup() (randomSeed/noiseSeed) -> reproducible frames.
    function projOf() { const c = window.__CINE || {}; return typeof c.project === "function" ? c.project : null; }

    function spawn(idx) {
      // share-weighted choice of WHICH fixed flying-river edge to ride
      let r = p.random(), k = ATRACKS.length - 1;
      for (let t = 0; t < ATRACKS.length; t++) { if (r <= ATRACKS[t].cum) { k = t; break; } }
      const o = particles[idx];
      o.arc = k; o.u = 0; o.prog = 0;
      o.ox = p.random(-0.7, 0.7); o.oy = p.random(-0.6, 0.6); // ribbon spread near the source box
      o.fl = p.random(); // per-particle flicker phase
      o.active = true;
    }

    // reliability r(t): the source's delivery factor. Its MEAN is held at 1 (the rNorm
    // normalisation in draw); the grade widens its VARIANCE only -> same average rain,
    // worse reliability, fatter drought tail. The honesty rule, written in arithmetic.
    function reliability(g, t) {
      if (g < 0.001) return 1;
      const gust = 0.85 * Math.sin(2.1 * t + 3 * p.noise(5.0, t * 0.4)) + 0.7 * (p.noise(9.0, t * 0.7) - 0.5) * 2;
      let r = 1 + g * gust;
      if (p.noise(20.0, t * 0.15) > 0.9 - 0.16 * g) r = Math.min(r, 0.04); // intermittent drought collapse
      return Math.max(0, r);
    }
    function emit(rate, dt) {
      // credit bucket: inflow ignores the grade, so cumulative emission -> rate*T exactly.
      // rNorm (mean 1) only reschedules WHEN particles leave: bursty at high grade, steady at low.
      credit += rate * dt;
      const drain = Math.min(credit, rate * dt * (rNorm * 2 + 0.001)); // surges (>inflow) clear backlog
      const n = Math.min(Math.floor(drain), free.length, Math.floor(credit));
      for (let k = 0; k < n; k++) { const idx = free.pop(); spawn(idx); credit -= 1; }
    }

    function sampleField(lon, lat) {
      const fi = clamp((lon - COR.lonMin) / dLon, 0, GW - 1.001);
      const fj = clamp((lat - COR.latMin) / dLat, 0, GH - 1.001);
      const i0 = fi | 0, j0 = fj | 0, tx = fi - i0, ty = fj - j0;
      const a = j0 * GW + i0, b = a + 1, c = a + GW, d = c + 1;
      const vx = lerp(lerp(fldVX[a], fldVX[b], tx), lerp(fldVX[c], fldVX[d], tx), ty);
      const vy = lerp(lerp(fldVY[a], fldVY[b], tx), lerp(fldVY[c], fldVY[d], tx), ty);
      return [vx, vy];
    }

    function recomputeCurl() {
      const ns = 0.075, e = 0.6;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const lon = COR.lonMin + i * dLon, lat = COR.latMin + j * dLat, id = j * GW + i;
        // curl of a Perlin potential -> divergence free; used as a positional wander (degrees)
        const dpdy = (p.noise(lon * ns, (lat + e) * ns, nt) - p.noise(lon * ns, (lat - e) * ns, nt)) / (2 * e);
        const dpdx = (p.noise((lon + e) * ns, lat * ns, nt) - p.noise((lon - e) * ns, lat * ns, nt)) / (2 * e);
        fldVX[id] = dpdy; fldVY[id] = -dpdx;
      }
    }

    function updateGrade(scene, dt) {
      let g = 0;
      if (scene === "6") {
        if (touched && gradeUser != null) g = gradeUser;
        else g = 0.5 - 0.5 * Math.cos(tickClock * 0.42); // gentle auto-morph intact<->degraded
      } else if (scene === "7") {
        g = FOREST_GRADE; // illustrative, descriptive (the live monitor), not a forecast
      }
      curGrade += (g - curGrade) * Math.min(1, dt * 2.2); // ease
      ATMO.grade = curGrade;
    }

    // ---------- glows (drawn fresh each frame, under the additive trail) ----------
    function radial(cx, cy, r, stops) {
      const ctx = p.drawingContext, gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      stops.forEach((s) => gr.addColorStop(s[0], s[1]));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    function shedGlow(shed, project) {
      if (shed < 0.03 || !project) return;
      const a = clamp(shed, 0, 1);
      // peak tied to the source box (where the rain is born)
      const c = project([(SBOX.lon_min + SBOX.lon_max) / 2, (SBOX.lat_min + SBOX.lat_max) / 2]);
      if (!c) return;
      const r = Math.max(W, H) * (0.34 + 0.12 * a);
      p.push(); p.blendMode(p.BLEND);
      radial(c[0], c[1], r, [
        [0, `rgba(26,168,155,${0.16 * a})`], [0.45, `rgba(20,140,128,${0.07 * a})`], [1, "rgba(0,0,0,0)"]]);
      p.pop();
    }
    function sourcePulse(emit, project) {
      if (!project) return;
      const c = project([SRC.lon, SRC.lat]); if (!c) return;
      const r = (54 + 26 * Math.sin(pulseT * 2.0)) * (0.6 + 0.6 * emit);
      p.push(); p.blendMode(p.ADD);
      radial(c[0], c[1], r, [[0, "rgba(90,230,180,0.20)"], [0.5, "rgba(50,190,160,0.07)"], [1, "rgba(0,0,0,0)"]]);
      p.pop();
    }
    function limbGlow() {
      const ctx = p.drawingContext, gr = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      gr.addColorStop(0, "rgba(40,90,120,0.10)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    let grainBuf = null;
    function buildGrain() {
      grainBuf = p.createGraphics(160, 160); grainBuf.pixelDensity(1); grainBuf.loadPixels();
      for (let i = 0; i < grainBuf.pixels.length; i += 4) {
        const v = 120 + p.random(-26, 26);
        grainBuf.pixels[i] = grainBuf.pixels[i + 1] = grainBuf.pixels[i + 2] = v; grainBuf.pixels[i + 3] = 9;
      }
      grainBuf.updatePixels();
    }
    function grain() {
      if (!grainBuf) return; p.push(); p.blendMode(p.OVERLAY);
      for (let y = 0; y < H; y += 160) for (let x = 0; x < W; x += 160) p.image(grainBuf, x, y);
      p.pop();
    }

    // ---------------- the scene-6 readout (HUD) ----------------
    let hud = {};
    function bindHud() {
      hud.box = document.getElementById("grade-hud");
      hud.slider = document.getElementById("gh-slider");
      hud.state = document.getElementById("gh-state");
      hud.mean = document.getElementById("gh-mean"); hud.meanV = document.getElementById("gh-mean-val");
      hud.var = document.getElementById("gh-var"); hud.varV = document.getElementById("gh-var-val");
      hud.spark = document.getElementById("gh-spark");
      if (hud.slider) {
        const onIn = () => { touched = true; gradeUser = +hud.slider.value / 100; };
        hud.slider.addEventListener("input", onIn);
        hud.slider.addEventListener("change", onIn);
      }
    }
    let hudShown = false, hudClock = 0;
    function updateHud(dt) {
      if (!hud.box) return;
      const onScene = (window.__CINE && window.__CINE.scene) === "6";
      if (onScene !== hudShown) { hud.box.classList.toggle("show", onScene); hudShown = onScene; }
      if (!onScene) return;
      hudClock += dt; if (hudClock < 0.07) return; hudClock = 0; // ~14fps DOM updates
      if (!touched && hud.slider) hud.slider.value = Math.round(curGrade * 100);
      const deg = curGrade > 0.5;
      if (hud.state) { hud.state.textContent = curGrade < 0.18 ? "intact" : curGrade > 0.6 ? "degraded" : "thinning"; hud.state.className = "gh-state" + (deg ? " deg" : ""); }
      // MEAN delivery: the windowed average, normalised to itself -> held at 1.00x. The
      // emission bucket conserves it independently of the grade. VARIANCE (CV) is what moves:
      // zero when intact, growing with the grade. Same average, worse reliability.
      let m = 0; for (let k = 0; k < RING; k++) m += ring[k]; m /= RING;
      let v = 0; for (let k = 0; k < RING; k++) { const x = ring[k] - m; v += x * x; }
      const sd = Math.sqrt(v / RING), cv = m > 1e-3 ? sd / m : 0;
      if (hud.mean) hud.mean.style.width = clamp(m / Math.max(1e-6, rbar), 0, 1.2) * 80 + "%";
      if (hud.meanV) hud.meanV.textContent = (m / Math.max(1e-6, rbar)).toFixed(2) + "x";
      if (hud.var) hud.var.style.width = clamp(cv / 0.85, 0, 1) * 100 + "%";
      if (hud.varV) hud.varV.textContent = cv < 0.12 ? "low" : cv < 0.45 ? "rising" : "high";
      drawSpark(m);
    }
    const SPARK_SCALE = 2.6; // reliability sits in ~[0, 2.6]; 1.0 is the held mean
    function sparkY(h, val) { return h - clamp(val / SPARK_SCALE, 0, 1) * h * 0.84 - h * 0.08; }
    function drawSpark(meanRef) {
      const cv = hud.spark; if (!cv) return;
      const ctx = cv.getContext("2d"); const w = cv.width, h = cv.height; const mr = Math.max(0.05, meanRef);
      ctx.clearRect(0, 0, w, h);
      const y1 = sparkY(h, 1); // the held mean (delivery normalised to its own average)
      ctx.strokeStyle = "rgba(58,214,163,0.55)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(232,105,77,0.95)"; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let k = 0; k < RING; k++) {
        const x = (k / (RING - 1)) * w, y = sparkY(h, ring[(rh + k) % RING] / mr);
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    function renderStaticHud() { // reduced-motion: a still intact-vs-degraded comparison
      const cv = hud.spark; if (!cv) return;
      const ctx = cv.getContext("2d"); const w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(58,214,163,0.85)"; ctx.lineWidth = 1.6; const y1 = sparkY(h, 1);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.stroke(); // intact: flat at the mean
      ctx.strokeStyle = "rgba(232,105,77,0.95)"; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let k = 0; k < RING; k++) { const t = k / (RING - 1); // degraded: spiky, same average
        let val = 1 + 0.9 * Math.sin(t * 22) + 0.5 * Math.sin(t * 7.3); if (Math.sin(t * 9.1) > 0.7) val = 0.05;
        const x = t * w, y = sparkY(h, Math.max(0, val)); k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      if (hud.meanV) hud.meanV.textContent = "1.00x"; if (hud.mean) hud.mean.style.width = "80%";
      if (hud.varV) hud.varV.textContent = "intact vs degraded"; if (hud.var) hud.var.style.width = "100%";
      if (hud.state) hud.state.textContent = "compare";
    }

    // ---------------- p5 lifecycle ----------------
    p.setup = function () {
      W = window.innerWidth; H = window.innerHeight;
      const cnv = p.createCanvas(W, H); cnv.parent("atmo");
      p.pixelDensity(1); p.randomSeed(ATMO.seed); p.noiseSeed(ATMO.seed);
      trail = p.createGraphics(W, H); trail.pixelDensity(1); trail.clear();
      buildGrain(); bindHud();
      particles = new Array(MAXP);
      for (let i = 0; i < MAXP; i++) { particles[i] = { active: false }; free.push(i); }
      ATMO.ready = true; ATMO.mode = REDUCED ? "reduced" : "live";
      if (REDUCED) {
        renderStatic(); renderStaticHud(); p.noLoop();
        // reduced motion still scrolls; toggle the comparison HUD on the grade scene
        window.addEventListener("scroll", () => { if (hud.box) hud.box.classList.toggle("show", (window.__CINE && window.__CINE.scene) === "6"); }, { passive: true });
      }
      document.addEventListener("visibilitychange", () => { if (document.hidden) p.noLoop(); else if (!REDUCED) p.loop(); });
    };

    function renderStatic() {
      // one elegant frozen frame: prime the field, advect a cohort, draw, stop.
      recomputeCurl(0.4);
      const project = projOf();
      // populate the whole fan: a cohort spread across all arcs and all progress values
      for (let i = 0; i < Math.min(1400, MAXP); i++) { const idx = free.pop(); if (idx == null) break; spawn(idx); }
      for (let i = 0; i < MAXP; i++) {
        const o = particles[i]; if (!o.active) continue;
        const tr = ATRACKS[o.arc]; if (!tr) continue;
        o.u = p.random(0.04, 0.985); o.prog = o.u;
        const base = alongTrack(tr, o.u), cf = sampleField(base[0], base[1]), decay = 1 - smooth(o.u);
        o.lon = base[0] + cf[0] * 0.8 + o.ox * decay; o.lat = base[1] + cf[1] * 0.8 + o.oy * decay;
      }
      trail.clear();
      const tctx = trail.drawingContext; tctx.save(); tctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < MAXP; i++) drawParticle(particles[i], project, true);
      tctx.restore();
      composite(project, 0.9, 0.7);
      ATMO.particleCount = MAXP - free.length;
    }

    function drawParticle(o, project, faded) {
      if (!o.active || !project) return;
      const s = project([o.lon, o.lat]); if (!s) return;
      const x = s[0], y = s[1]; if (s[2] != null && s[2] > 1) return;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
      const prog = clamp(o.prog, 0, 1);
      let col = prog < 0.5 ? mix3(VAPOUR, WATER, prog * 2) : mix3(WATER, AMBER, (prog - 0.5) * 2);
      // fade in just off the source, fade out as it rains; brighter as vapour, softer as rain
      let a = lerp(44, 18, prog) * smooth(clamp(prog * 6, 0, 1));
      if (!faded && curGrade > 0.05) a *= 0.7 + 0.3 * p.noise(o.fl * 10, tickClock * 3.0); // grade flicker
      const r = lerp(2.2, 1.0, prog);
      trail.noStroke(); trail.fill(col[0], col[1], col[2], a); trail.circle(x, y, r);
    }

    function composite(project, trailA, bloomA) {
      p.clear(); p.blendMode(p.BLEND); // transparent main: the deck.gl map underneath shows through
      const em = (window.__CINE && window.__CINE.emphasis) || {};
      shedGlow(em.shed != null ? em.shed : 0.5, project);
      sourcePulse(em.emit != null ? em.emit : 0.7, project);
      // base moisture at normal alpha (transparent where dry -> the map shows through)
      p.blendMode(p.BLEND); p.tint(255, 255 * trailA); p.image(trail, 0, 0); p.noTint();
      // soft additive bloom, only where the moisture is actually bright
      p.blendMode(p.ADD);
      const bl = clamp((em.bloom != null ? em.bloom : 0.6) * bloomA, 0, 1);
      p.tint(255, 110 * bl); p.image(trail, -3, -3, W + 6, H + 6); p.noTint();
      p.blendMode(p.BLEND);
      limbGlow(); if (!MOBILE) grain();
    }

    p.draw = function () {
      const now = p.millis();
      let dt = lastNow ? (now - lastNow) / 1000 : 0.016; lastNow = now;
      dt = clamp(dt, 0, 0.05); tickClock += dt; pulseT += dt;
      fpsE = lerp(fpsE, dt > 0 ? 1 / dt : 60, 0.05); ATMO.fps = Math.round(fpsE);
      const c = window.__CINE || {}; const project = projOf();
      const scene = c.scene || "0"; const em = c.emphasis || {};

      // adaptive throttle: if we are starving, shrink the active budget
      if (frame > 120 && fpsE < 34 && MAXP > 1200) { MAXP_soft = Math.max(1200, MAXP_soft - 60); }
      else if (fpsE > 52 && MAXP_soft < MAXP) { MAXP_soft = Math.min(MAXP, MAXP_soft + 25); }

      updateGrade(scene, dt);
      nt += dt * 0.05; if (frame % 5 === 0) recomputeCurl();

      // reliability signal; rNorm = rRaw / (windowed mean rbar), so its windowed mean is 1
      const rRaw = reliability(curGrade, tickClock);
      rNorm = rRaw / Math.max(0.05, rbar);

      const emitRate = (MOBILE ? 80 : 120) * (em.emit != null ? em.emit : 0.7) * (MAXP_soft / MAXP);
      emit(emitRate, dt);

      // Fade the trail toward TRANSPARENT (destination-out reduces alpha; it does NOT paint
      // dark over the buffer), so the deck.gl map keeps showing through everywhere the moisture
      // is not. Then accumulate the live cohort additively ('lighter').
      const tctx = trail.drawingContext; tctx.save();
      tctx.globalCompositeOperation = "destination-out";
      trail.noStroke(); trail.fill(0, 0, 0, 15); trail.rect(0, 0, W, H);
      tctx.globalCompositeOperation = "lighter";
      // Advect ALONG the fixed arc each particle was assigned (constant spatial speed, so a
      // longer edge takes proportionally longer). The base trend is the fixed flying-river
      // edge; curl noise adds organic wander around it, and the spawn-scatter ribbon narrows
      // toward the sink. Grade jitter is zero-mean, so the rain destination is unchanged.
      const jit = curGrade * 0.5, sp = (MOBILE ? 1.2 : 1.7);
      const curlScale = 0.45 + 1.2 * (em.turb != null ? em.turb : 0.4);
      let live = 0;
      for (let i = 0; i < MAXP; i++) {
        const o = particles[i]; if (!o.active) continue;
        const tr = ATRACKS[o.arc]; if (!tr) { o.active = false; free.push(i); continue; }
        o.u += (sp / tr.lenDeg) * dt;
        if (o.u >= 1) { // reached the destination soy state -> rained out
          if (sparks.length < 240) sparks.push({ lon: tr.dest[0] + p.random(-0.5, 0.5), lat: tr.dest[1] + p.random(-0.5, 0.5), life: 1 });
          o.active = false; free.push(i); continue;
        }
        live++; o.prog = o.u;
        const base = alongTrack(tr, o.u), cf = sampleField(base[0], base[1]);
        const decay = 1 - smooth(o.u); // ribbon wide at the source, converging at the sink
        let lon = base[0] + cf[0] * curlScale + o.ox * decay;
        let lat = base[1] + cf[1] * curlScale + o.oy * decay;
        if (jit > 0) { lon += (p.noise(o.fl * 5 + 1, tickClock * 1.6) - 0.5) * jit; lat += (p.noise(o.fl * 5 + 9, tickClock * 1.6) - 0.5) * jit; }
        o.lon = lon; o.lat = lat;
        drawParticle(o, project, false);
      }
      // rain shimmer
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k]; s.life -= dt * 1.6; if (s.life <= 0) { sparks.splice(k, 1); continue; }
        if (!project) continue; const q = project([s.lon, s.lat]); if (!q) continue;
        trail.noStroke(); trail.fill(232, 105, 77, 70 * s.life); trail.circle(q[0], q[1], 2.4 * s.life + 0.6);
      }
      tctx.restore();

      // sample the raw reliability into the ring; rbar is its windowed mean (the held average)
      tickClock2 += dt;
      if (tickClock2 >= 0.05) {
        rh = (rh - 1 + RING) % RING; ring[rh] = rRaw; tickClock2 = 0;
        let s = 0; for (let k = 0; k < RING; k++) s += ring[k]; rbar = s / RING;
      }

      composite(project, 1, 1);
      updateHud(dt);

      ATMO.particleCount = live; ATMO.mode = c.useDeck === false ? "fallback" : "live";
      frame++;
    };

    p.windowResized = function () {
      W = window.innerWidth; H = window.innerHeight; p.resizeCanvas(W, H);
      trail = p.createGraphics(W, H); trail.pixelDensity(1); trail.clear();
      if (REDUCED) renderStatic();
    };
  };

  // ---- boot once p5 + the data are present ----
  function boot() {
    if (inst) return;
    if (!window.p5) { ATMO.errors.push("p5 not loaded"); return; }
    if (!document.getElementById("atmo")) { ATMO.errors.push("#atmo host missing"); return; }
    try { inst = new p5(sketch); } catch (e) { ATMO.errors.push("init: " + e.message); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
