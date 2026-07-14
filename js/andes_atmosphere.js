/* andes_atmosphere.js - additive, ILLUSTRATIVE p5 particle layer over #atmo, styled and driven like the
   soy landing's "Living Precipitationshed" (viz/js/atmosphere.js). Tracers are released from the committed
   basin source centroids in window.ANDES_DATA.corridors[].flows and RIDE the measured source->sink flow
   track (a cubic bezier bowed by the ERA5 mean vapour-transport direction, the same bend the drawn ribbons
   use) to each city's water tower, where they rain out. Riding the track keeps every stream clean: it lands
   at its tower, never overshoots the city into the Pacific, and its per-class colour and count are the
   measured RECON/AMSSRAB shares. Curl noise adds organic wander that narrows toward the sink. Rendering
   matches soy: a persistent trail buffer faded toward transparent and re-accumulated additively, a soft
   bloom, phase colour, a source breath, and rain shimmer. Direction is mechanism only; attribution stays in
   window.ANDES_DATA and the page spans. Seeded 42, geo-locked to window.__CINE.project, reduced-motion
   aware, verifiable via window.__ATMO. */
(function () {
  "use strict";
  var A = window.ANDES_DATA;
  var atmo = {
    ready: false,
    seed: 42,
    particleCount: 0,
    fps: 0,
    mode: "live",
    errors: [],
    emitterMode: "source-centroid",
    advection: "flow-track-era5-curved",
    fluxState: { season: "Annual", emitters: [] },
    ratios: {},
    annualRatios: {},
    bogotaOrinocoGteAmazon: null
  };
  window.__ATMO = atmo;
  if (!A || !A.map || !window.p5 || !document.getElementById("atmo")) {
    atmo.mode = "absent"; return;
  }

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var transport = ((A.map || {}).transport || {});
  var field = (transport.vectors || []).filter(function (v) {
    return isFinite(v.lon) && isFinite(v.lat) && isFinite(v.u) && isFinite(v.v) && Math.hypot(v.u, v.v) > 1;
  });
  var bbox = transport.bbox || { lon_min: -82, lon_max: -58, lat_min: -14, lat_max: 13 };
  if (!field.length) { atmo.mode = "no-era5-field"; return; }

  var corridorsById = {};
  (A.corridors || []).forEach(function (c) { corridorsById[c.id] = c; });

  function cssTok(n, f) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n);
    return (v || f).trim();
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function currentSeasonFromDom() {
    var on = document.querySelector("#andes-season-btns button.on");
    return on ? (on.getAttribute("data-s") || "Annual") : "Annual";
  }
  var currentSeason = "Annual";

  function classFlux(corr, cls, annualShare, season) {
    if (season === "Annual") return annualShare;
    var s = corr && corr.seasonal_amssrab ? corr.seasonal_amssrab[season] : null;
    if (!s) return annualShare;
    if (cls === "amazon" && isFinite(s.amazon_mean)) return s.amazon_mean;
    if (cls === "orinoco" && isFinite(s.orinoco_mean)) return s.orinoco_mean;
    return annualShare;
  }

  var emitters = [];
  (A.corridors || []).forEach(function (corr) {
    (corr.flows || []).filter(function (f) { return f.draw && (f.cls === "amazon" || f.cls === "orinoco"); })
      .forEach(function (f) {
        emitters.push({
          id: corr.id + ":" + f.cls,
          sink: corr.id,
          site: corr.short,
          cls: f.cls,
          label: f.label || f.cls,
          from: { lon: f.from[0], lat: f.from[1] },
          to: { lon: f.to[0], lat: f.to[1] },
          annualFlux: f.share,
          currentFlux: f.share,
          color: null
        });
      });
  });
  if (!emitters.length) { atmo.mode = "no-emitters"; return; }

  function updateFluxState(season) {
    currentSeason = season || currentSeasonFromDom();
    emitters.forEach(function (e) {
      e.currentFlux = classFlux(corridorsById[e.sink], e.cls, e.annualFlux, currentSeason);
    });
    var bySink = {}, annual = {};
    emitters.forEach(function (e) {
      bySink[e.sink] = bySink[e.sink] || {};
      bySink[e.sink][e.cls] = e.currentFlux;
      annual[e.sink] = annual[e.sink] || {};
      annual[e.sink][e.cls] = e.annualFlux;
    });
    function ratios(src) {
      var out = {};
      Object.keys(src).forEach(function (sink) {
        var a = src[sink].amazon || 0, o = src[sink].orinoco || 0;
        out[sink] = {
          amazon: a,
          orinoco: o,
          amazon_to_orinoco: o > 0 ? a / o : null,
          orinoco_to_amazon: a > 0 ? o / a : null
        };
      });
      return out;
    }
    atmo.ratios = ratios(bySink);
    atmo.annualRatios = ratios(annual);
    atmo.bogotaOrinocoGteAmazon = !!(annual.amazon_bogota_paramo &&
      annual.amazon_bogota_paramo.orinoco >= annual.amazon_bogota_paramo.amazon);
    atmo.fluxState = {
      season: currentSeason,
      emitters: emitters.map(function (e) {
        return { id: e.id, sink: e.sink, cls: e.cls, annualFlux: e.annualFlux, currentFlux: e.currentFlux };
      })
    };
    atmo.emitters = atmo.fluxState.emitters;
  }
  updateFluxState(currentSeason);

  function bindSeasonButtons() {
    var host = document.getElementById("andes-season-btns");
    if (!host || host.__atmoBound) return;
    host.__atmoBound = true;
    host.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("button[data-s]") : null;
      if (b) updateFluxState(b.getAttribute("data-s"));
    });
    updateFluxState(currentSeasonFromDom());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindSeasonButtons);
  else bindSeasonButtons();
  setTimeout(bindSeasonButtons, 80);

  // ---- one flow track per emitter: a cubic bezier from the basin source to the water tower, bowed by the
  //      ERA5 mean IVT direction exactly as andes_stage.js ribbonPath bows the drawn ribbon, so the
  //      particles ride the ribbons. Sampled to a polyline for cheap along-track lookup. ---------------
  (function buildTracks() {
    var mu = transport.mean_u != null ? transport.mean_u : -1, mv = transport.mean_v || 0;
    var fld = Math.hypot(mu, mv) || 1, nx = -mv / fld, ny = mu / fld;
    emitters.forEach(function (e) {
      var ax = e.from.lon, ay = e.from.lat, bx = e.to.lon, by = e.to.lat;
      var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, bend = (e.cls === "orinoco" ? -0.08 : 0.12) * len;
      var c1x = ax + dx * 0.34 + nx * bend, c1y = ay + dy * 0.34 + ny * bend;
      var c2x = ax + dx * 0.70 + nx * bend * 0.55, c2y = ay + dy * 0.70 + ny * bend * 0.55;
      var N = 44, pts = [], L = 0, px = 0, py = 0;
      for (var i = 0; i <= N; i++) {
        var u = i / N, v = 1 - u;
        var x = v * v * v * ax + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * bx;
        var y = v * v * v * ay + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * by;
        if (i) L += Math.hypot(x - px, y - py);
        px = x; py = y; pts.push([x, y]);
      }
      e.track = { pts: pts, N: N, len: Math.max(2, L) };
    });
  })();
  function alongTrack(tr, u) {
    var x = clamp(u, 0, 1) * tr.N, i = x | 0, r = x - i, a = tr.pts[i], b = tr.pts[Math.min(tr.N, i + 1)];
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
  }

  // ---- rendering (matches the soy landing's flowing-streak look) --------------------------------
  var MOBILE = Math.min(window.innerWidth, window.innerHeight) < 620;
  var MAXP = reduce ? 700 : (MOBILE ? 1100 : 1600);
  var MAXP_soft = MAXP;
  var parts = [];

  // phase palette per source class: bright vapour at the basin, class colour in transport, a soft rain
  // highlight at the water tower. Class identity (teal Amazon, amber Orinoco) is preserved the whole way,
  // so Bogota always reads Orinoco heavier than Amazon; only brightness and alpha breathe.
  var PAL = {
    amazon:  { vapour: [150, 255, 210], water: [43, 212, 196], rain: [190, 255, 228], rgb: [43, 212, 196] },
    orinoco: { vapour: [255, 224, 168], water: [242, 162, 78], rain: [255, 216, 150], rgb: [242, 162, 78] }
  };
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  new p5(function (p) {
    var W = 0, H = 0, trail = null, frame = 0, lastNow = 0, fpsE = 60, pulseT = 0, tick = 0, curlAmp = 0.35;
    var sparks = [];
    function projOf() { var c = window.__CINE || {}; return typeof c.project === "function" ? c.project : null; }

    p.setup = function () {
      var host = document.getElementById("atmo");
      W = window.innerWidth; H = window.innerHeight;
      var c = p.createCanvas(W, H); c.parent(host);
      p.pixelDensity(1); p.clear(); p.randomSeed(42); p.noiseSeed(42);
      trail = p.createGraphics(W, H); trail.pixelDensity(1); trail.clear();
      var TEAL = cssTok("--teal-bright", "#2bd4c4"), AMBER = cssTok("--amber", "#f2a24e");
      emitters.forEach(function (e) { e.color = e.cls === "orinoco" ? AMBER : TEAL; e.pal = PAL[e.cls] || PAL.amazon; });
      for (var i = 0; i < MAXP; i++) parts.push({ active: false });
      updateFluxState(currentSeasonFromDom());
      atmo.ready = true; atmo.particleCount = 0;
      if (reduce) { atmo.mode = "reduced"; renderStatic(); p.noLoop(); }
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) p.noLoop(); else if (!reduce) p.loop();
      });
    };

    function emitterWeight(e) {
      var w = Math.max(0, e.currentFlux != null ? e.currentFlux : e.annualFlux);
      var C = window.__CINE, focus = C && C.emphasis ? C.emphasis.focusCorridor : null;
      if (focus && e.sink !== focus) w *= 0.3;   // soften (not silence) the other city on a single-city scene
      return Math.max(0.0005, w);
    }
    function pickEmitter() {
      var total = 0; emitters.forEach(function (e) { total += emitterWeight(e); });
      var r = p.random(total), acc = 0;
      for (var i = 0; i < emitters.length; i++) { acc += emitterWeight(emitters[i]); if (r <= acc) return i; }
      return emitters.length - 1;
    }
    function spawn(o) {
      o.ei = pickEmitter(); o.active = true;
      o.u = 0; o.prog = 0;
      o.sp = 0.9 + p.random(0, 0.7);                              // deg/sec along-track base speed
      o.ox = p.random(-0.5, 0.5); o.oy = p.random(-0.42, 0.42);   // spawn ribbon spread, narrows to the sink
      o.fl = p.random();
      return o;
    }
    function placeAlong(o) {
      var tr = emitters[o.ei].track, base = alongTrack(tr, o.u), decay = 1 - smooth(o.u), amp = curlAmp * decay;
      var wx = (p.noise(o.fl * 5, o.u * 2.6 + tick * 0.35) - 0.5) * amp;
      var wy = (p.noise(o.fl * 5 + 9, o.u * 2.6 + tick * 0.35) - 0.5) * amp;
      o.lon = base[0] + wx + o.ox * decay;
      o.lat = base[1] + wy + o.oy * decay;
    }

    function drawParticle(o, project) {
      if (!o.active || !project) return;
      var s = project([o.lon, o.lat]); if (!s) return;
      var x = s[0], y = s[1]; if (s[2] != null && s[2] > 1) return;
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) return;
      var pal = emitters[o.ei].pal, prog = o.prog;
      var col = prog < 0.5 ? mix3(pal.vapour, pal.water, prog * 2) : mix3(pal.water, pal.rain, (prog - 0.5) * 2);
      var a = lerp(46, 15, prog) * smooth(clamp(prog * 6, 0, 1));   // fade in off the source, soften as it rains
      var r = lerp(2.3, 1.0, prog);
      trail.noStroke(); trail.fill(col[0], col[1], col[2], a); trail.circle(x, y, r);
    }

    // ---- glows on the MAIN canvas (source breath + additive bloom of the trail) ----
    function radial(cx, cy, rad, stops) {
      if (!isFinite(cx) || !isFinite(cy) || !isFinite(rad) || rad <= 0) return;
      var ctx = p.drawingContext, gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      stops.forEach(function (st) { gr.addColorStop(st[0], st[1]); });
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    function sourceBreath(project, emp) {
      emitters.forEach(function (e, idx) {
        var w = emitterWeight(e); if (w < 0.02) return;
        var c = project([e.from.lon, e.from.lat]);
        if (!c || !isFinite(c[0]) || !isFinite(c[1])) return;
        var g = e.pal.rgb;
        var rad = (34 + 18 * Math.sin(pulseT * 1.8 + idx)) * (0.6 + 0.9 * Math.min(1, w * 3)) * (0.7 + 0.5 * emp);
        if (!isFinite(rad)) return;
        p.push(); p.blendMode(p.ADD);
        radial(c[0], c[1], Math.max(22, rad), [
          [0, "rgba(" + g[0] + "," + g[1] + "," + g[2] + ",0.15)"],
          [0.5, "rgba(" + g[0] + "," + g[1] + "," + g[2] + ",0.05)"],
          [1, "rgba(0,0,0,0)"]]);
        p.pop();
      });
    }
    function composite(project, emp, bloom) {
      p.clear(); p.blendMode(p.BLEND);            // transparent main: the map underneath shows through
      if (project) sourceBreath(project, emp);
      p.blendMode(p.BLEND); p.image(trail, 0, 0);
      p.blendMode(p.ADD);                          // soft bloom where the moisture is bright
      p.tint(255, 120 * clamp(bloom, 0, 1)); p.image(trail, -3, -3, W + 6, H + 6); p.noTint();
      p.blendMode(p.BLEND);
    }

    function drawRain(project) {
      for (var k = sparks.length - 1; k >= 0; k--) {
        var sp = sparks[k]; sp.life -= 0.03; if (sp.life <= 0) { sparks.splice(k, 1); continue; }
        if (!project) continue; var q = project([sp.lon, sp.lat]); if (!q) continue;
        trail.noStroke(); trail.fill(sp.rgb[0], sp.rgb[1], sp.rgb[2], 58 * sp.life);
        trail.circle(q[0], q[1], 1.9 * sp.life + 0.5);
      }
    }

    function renderStatic() {
      // one frozen cohort spread along each track source -> sink (reduced motion)
      trail.clear();
      var project = projOf();
      for (var i = 0; i < MAXP; i++) {
        var o = spawn(parts[i]); o.u = p.random(0.02, 0.99); o.prog = o.u;
        placeAlong(o); drawParticle(o, project);
      }
      composite(project, 0.6, 0.7);
      atmo.particleCount = MAXP;
    }

    p.draw = function () {
      var now = p.millis(), dt = lastNow ? (now - lastNow) / 1000 : 0.016; lastNow = now;
      dt = clamp(dt, 0, 0.05); pulseT += dt; tick += dt;
      fpsE = lerp(fpsE, dt > 0 ? 1 / dt : 60, 0.05); atmo.fps = Math.round(fpsE);
      var C = window.__CINE, project = projOf();
      if (!C || !project) return;
      var emp = (C.emphasis && C.emphasis.emit) != null ? C.emphasis.emit : 0.5;
      var bloom = (C.emphasis && C.emphasis.bloom) != null ? C.emphasis.bloom : 0.5;
      var turb = (C.emphasis && C.emphasis.turb) != null ? C.emphasis.turb : 0.35;
      curlAmp = 0.28 + 0.5 * turb;

      // fade the trail toward transparent (destination-out lowers alpha), then accumulate the live cohort
      // additively so the streaks glow where moisture is dense.
      var tctx = trail.drawingContext; tctx.save();
      tctx.globalCompositeOperation = "destination-out";
      trail.noStroke(); trail.fill(0, 0, 0, 16); trail.rect(0, 0, W, H);
      tctx.globalCompositeOperation = "lighter";
      var vis = Math.min(parts.length, Math.round(MAXP_soft * (0.4 + 0.6 * emp)));
      var live = 0;
      for (var i = 0; i < vis; i++) {
        var o = parts[i];
        if (!o.active) spawn(o);
        var tr = emitters[o.ei].track;
        o.u += (o.sp / tr.len) * dt * (0.7 + emp);
        if (o.u >= 1) {                              // reached the water tower -> rains out and resets
          if (sparks.length < 150) {
            var e = emitters[o.ei];
            sparks.push({ lon: e.to.lon + p.random(-0.26, 0.26), lat: e.to.lat + p.random(-0.26, 0.26),
              life: 1, rgb: e.pal.rain });
          }
          spawn(o); continue;
        }
        o.prog = o.u; placeAlong(o); live++; drawParticle(o, project);
      }
      drawRain(project);
      tctx.restore();

      composite(project, emp, bloom);
      atmo.particleCount = live;

      // adaptive throttle: shed budget if the frame is starving, restore it when it recovers
      if (atmo.fps && atmo.fps < 26 && MAXP_soft > 700) MAXP_soft -= 40;
      else if (atmo.fps > 52 && MAXP_soft < MAXP) MAXP_soft = Math.min(MAXP, MAXP_soft + 20);
      frame++;
    };

    p.windowResized = function () {
      W = window.innerWidth; H = window.innerHeight; p.resizeCanvas(W, H);
      trail = p.createGraphics(W, H); trail.pixelDensity(1); trail.clear();
      if (reduce) renderStatic();
    };
  });
})();
