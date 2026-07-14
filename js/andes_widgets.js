/* andes_widgets.js - the data widgets for the Andean landing. Every value is PROJECTED from
   window.ANDES_DATA; nothing is recomputed in the browser. Toggles switch between precomputed
   states only. Each widget fails quiet if its data or host is missing and writes a
   window.__ANDES_<WIDGET> verification hook whose last field is ready:true. */
(function () {
  "use strict";
  var A = window.ANDES_DATA;
  if (!A) return;
  var d3 = window.d3;
  var css = getComputedStyle(document.documentElement);
  function tok(n, f) { return (css.getPropertyValue(n) || f).trim(); }

  // committed source-class palette (matches the money-shot figure)
  var WEDGE_COLOR = {
    amazon: tok("--teal", "#1aa89b"), orinoco: tok("--amber", "#f2a24e"),
    local_land: "#8ecae6", other_sa_land: tok("--green", "#3ad6a3"),
    window_ocean: "#3a4d61", outside_domain_residual: "#6b7f92"
  };
  function pct1(f) { return (f * 100).toFixed(1) + "%"; }
  function pct0(f) { return Math.round(f * 100) + "%"; }
  function byId(cid) { for (var i = 0; i < A.corridors.length; i++) if (A.corridors[i].id === cid) return A.corridors[i]; return null; }
  var Q = byId("amazon_quito_paramo"), B = byId("amazon_bogota_paramo");
  function chuzaReservoir() {
    var rs = (((A.map || {}).hydrology || {}).towers || {}).amazon_bogota_paramo;
    rs = rs && rs.reservoirs ? rs.reservoirs : [];
    for (var i = 0; i < rs.length; i++) if (rs[i].id === "chuza") return rs[i];
    return null;
  }

  // ---- 1. bind the headline spans (no computed literal lives in the HTML copy) -----------------
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function bindHeadlines() {
    setText("reuse-w", A.reuse_w.toFixed(4));
    setText("anchor-w", A.reuse_w.toFixed(4));
    setText("res-deg", String(A.resolution_deg));
    setText("res-km", String(A.resolution_km_approx));
    if (Q) { setText("q-amazon", pct1(Q.amazon_annual)); setText("q-jja", pct1(Q.seasonal_amssrab.JJA.amazon_mean)); }
    if (B) {
      setText("b-amazon", pct1(B.amazon_annual));
      setText("b-orinoco", pct1(B.orinoco_annual));
      setText("b-jja", pct1(B.seasonal_amssrab.JJA.amazon_mean));
    }
    var ch = chuzaReservoir(); if (ch) setText("chuza-cap", ch.capacity_mcm_label);
    var sd = document.getElementById("snap-date"); if (sd) sd.textContent = A.as_of;
    window.__ANDES_HEAD = { ready: true, q_amazon: Q ? Q.amazon_annual : null, b_amazon: B ? B.amazon_annual : null,
      b_orinoco: B ? B.orinoco_annual : null, reuse_w: A.reuse_w, res_km: A.resolution_km_approx,
      chuza: ch ? ch.capacity_mcm_label : null };
  }

  // ---- 2. six-wedge source-class bar (per corridor) -------------------------------------------
  function wedgeBar(corr, mountId, readId, legId) {
    var host = document.getElementById(mountId);
    var readEl = document.getElementById(readId), legEl = document.getElementById(legId);
    if (!corr || !host || !d3) { if (host) host.style.display = "none"; return null; }
    var cls = corr.annual_classes;                 // [{key,label,frac}] committed, already normalized
    var W = 660, H = 60, m = { l: 2, r: 2, t: 2, b: 2 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var x = d3.scaleLinear().domain([0, 1]).range([0, iw]);
    var svg = d3.select(host).append("svg").attr("viewBox", "0 0 " + W + " " + H)
      .attr("preserveAspectRatio", "xMidYMid meet").attr("role", "img")
      .attr("aria-label", corr.short + " moisture source-class composition");
    var g = svg.append("g").attr("transform", "translate(" + m.l + "," + m.t + ")");
    var acc = 0, segs = cls.map(function (c) { var s = { c: c, x0: acc, x1: acc + c.frac }; acc += c.frac; return s; });
    function show(s) {
      if (readEl) readEl.innerHTML = '<b>' + s.c.label + '</b> &middot; <span class="g">' + pct1(s.c.frac) + '</span> of the water tower’s source moisture';
    }
    g.selectAll("rect").data(segs).enter().append("rect")
      .attr("x", function (s) { return x(s.x0); }).attr("y", 0)
      .attr("width", function (s) { return Math.max(0, x(s.x1) - x(s.x0)); }).attr("height", ih)
      .attr("fill", function (s) { return WEDGE_COLOR[s.c.key] || "#556"; })
      .attr("stroke", tok("--bg", "#06141f")).attr("stroke-width", 1.4)
      .style("cursor", "pointer")
      .on("mouseenter", function (e, s) { show(s); })
      .on("click", function (e, s) { show(s); });
    // in-wedge percent labels for the big wedges
    g.selectAll("text").data(segs.filter(function (s) { return (s.x1 - s.x0) >= 0.08; })).enter().append("text")
      .attr("x", function (s) { return x((s.x0 + s.x1) / 2); }).attr("y", ih / 2 + 4)
      .attr("text-anchor", "middle").attr("fill", "#06141f").attr("font-family", "var(--mono)")
      .attr("font-size", 15).attr("font-weight", 700).text(function (s) { return pct0(s.c.frac); });
    // legend
    if (legEl) {
      legEl.innerHTML = "";
      cls.forEach(function (c) {
        var b = document.createElement("button"); b.type = "button";
        b.innerHTML = '<i style="background:' + (WEDGE_COLOR[c.key] || "#556") + '"></i>' + c.label;
        b.addEventListener("click", function () { show({ c: c }); });
        legEl.appendChild(b);
      });
    }
    show(segs[0]);
    return { n: segs.length, amazon: corr.amazon_annual };
  }

  // ---- 3. season toggle: Annual (RECON) + DJF/MAM/JJA/SON (AMSSRAB), precomputed states --------
  function seasonWidget() {
    var host = document.getElementById("andes-season-bars");
    var btns = document.getElementById("andes-season-btns"), read = document.getElementById("andes-season-read");
    if (!Q || !B || !host || !btns || !d3) { if (host) host.style.display = "none"; return null; }
    var STATES = ["Annual"].concat(A.seasons);   // ["Annual","DJF","MAM","JJA","SON"]
    function amazonFor(corr, state) {
      return state === "Annual" ? corr.amazon_annual : corr.seasonal_amssrab[state].amazon_mean;
    }
    function orinocoAnnual(corr) { return corr.orinoco_annual; }
    var W = 620, H = 150, m = { l: 92, r: 16, t: 10, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var y = d3.scalePoint().domain([Q.short, B.short]).range([m.t + 22, m.t + ih - 22]);
    var x = d3.scaleLinear().domain([0, 0.55]).range([0, iw]);
    var svg = d3.select(host).append("svg").attr("viewBox", "0 0 " + W + " " + H)
      .attr("preserveAspectRatio", "xMidYMid meet").attr("role", "img").attr("aria-label", "Amazon source share by season");
    var g = svg.append("g").attr("transform", "translate(" + m.l + "," + 0 + ")");
    // x grid + ticks
    [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach(function (t) {
      g.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.t).attr("y2", m.t + ih)
        .attr("stroke", "rgba(255,255,255,.08)").attr("stroke-dasharray", "2,4");
      g.append("text").attr("x", x(t)).attr("y", m.t + ih + 16).attr("text-anchor", "middle")
        .attr("fill", tok("--faint", "#5c6e78")).attr("font-family", "var(--mono)").attr("font-size", 9)
        .text(Math.round(t * 100) + "%");
    });
    [Q, B].forEach(function (corr) {
      g.append("text").attr("x", -10).attr("y", y(corr.short) + 4).attr("text-anchor", "end")
        .attr("fill", tok("--muted", "#8fa3ad")).attr("font-family", "var(--mono)").attr("font-size", 11).text(corr.short);
    });
    var TEAL = tok("--teal", "#1aa89b"), GREEN = tok("--green", "#3ad6a3"), AMBER = tok("--amber", "#f2a24e");
    var bars = g.selectAll("rect.amz").data([Q, B]).enter().append("rect").attr("class", "amz")
      .attr("x", 0).attr("y", function (c) { return y(c.short) - 9; }).attr("height", 18)
      .attr("rx", 2).attr("fill", TEAL).attr("width", 0);
    var lab = g.selectAll("text.amzl").data([Q, B]).enter().append("text").attr("class", "amzl")
      .attr("y", function (c) { return y(c.short) + 4; }).attr("fill", "#eaf2f2")
      .attr("font-family", "var(--mono)").attr("font-size", 11).attr("font-weight", 600);
    // Orinoco reference tick per corridor (annual), so "Amazon vs Orinoco" is visible
    var oriMark = g.selectAll("line.ori").data([Q, B]).enter().append("line").attr("class", "ori")
      .attr("x1", function (c) { return x(orinocoAnnual(c)); }).attr("x2", function (c) { return x(orinocoAnnual(c)); })
      .attr("y1", function (c) { return y(c.short) - 13; }).attr("y2", function (c) { return y(c.short) + 13; })
      .attr("stroke", AMBER).attr("stroke-width", 1.6).attr("opacity", 0.9);
    function render(state) {
      bars.transition().duration(500)
        .attr("width", function (c) { return x(amazonFor(c, state)); })
        .attr("fill", state === "JJA" ? GREEN : TEAL);
      lab.transition().duration(500)
        .attr("x", function (c) { return x(amazonFor(c, state)) + 6; })
        .tween("t", function (c) { var self = d3.select(this); var v = amazonFor(c, state);
          return function () { self.text(pct1(v)); }; });
      Array.prototype.forEach.call(btns.children, function (bn) { bn.classList.toggle("on", bn.getAttribute("data-s") === state); });
      if (read) {
        var qv = amazonFor(Q, state), bv = amazonFor(B, state);
        var src = state === "Annual" ? "annual RECON" : "AMSSRAB " + state + " ensemble";
        var extra = state === "JJA" ? " In JJA, the seasonal ensemble puts Bogota's Amazon share above its seasonal Orinoco mean, while the annual anchor remains mixed-source." : "";
        read.innerHTML = '<b>' + state + '</b> (' + src + ') &middot; Amazon share: <span class="g">' + Q.short + ' ' + pct1(qv) +
          '</span>, <span class="g">' + B.short + ' ' + pct1(bv) + '</span>. <span class="c">|</span> amber tick = annual Orinoco.' + extra;
      }
    }
    STATES.forEach(function (s) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-s", s); b.textContent = s;
      b.addEventListener("click", function () { render(s); });
      btns.appendChild(b);
    });
    render("JJA");   // open on the load-bearing dry-season beat
    return { states: STATES, quito_jja: Q.seasonal_amssrab.JJA.amazon_mean, bogota_jja: B.seasonal_amssrab.JJA.amazon_mean };
  }

  // ---- 4. gate ladder (honest states, not fabricated numbers) ---------------------------------
  function gateLadder() {
    var host = document.getElementById("andes-gates"); if (!host || !Q) return null;
    var rows = [
      { k: "Gate 1 attribution", cls: "caveat", v: Q.gate1_status.replace(/_/g, " ").toLowerCase() + " (annual RECON six-class)" },
      { k: "Seasonal check", cls: "pass", v: "AMSSRAB 3-model check; JJA is the peak Amazon season" },
      { k: "Water-tower risk", cls: "closed", v: "deferred: needs gauged runoff + naturalized inflow + supply cost" },
      { k: "Gate F forecast", cls: "closed", v: "NOT RUN, fail-closed: no lead-time water-supply forecast" }
    ];
    host.innerHTML = rows.map(function (r) {
      return '<div class="gaterow ' + r.cls + '"><span class="gdot"></span><span class="gk">' + r.k + '</span><span class="gv">' + r.v + '</span></div>';
    }).join("");
    return { n: rows.length, gate1: Q.gate1_status };
  }

  // ---- 5. corridor library cards --------------------------------------------------------------
  function corridorCards() {
    var host = document.getElementById("andes-corridors"); if (!host || !Q || !B) return null;
    host.innerHTML =
      '<div class="corridorcard soy"><div class="cc-k">Corridor 1 &middot; checked</div>' +
      '<div class="cc-name">Amazon to soy</div><div class="cc-val">La Plata crop corridor &middot; ' +
      'moisture weight <b>w = ' + A.reuse_w.toFixed(4) + '</b> &middot; concurrent sign/rank validation</div></div>' +
      '<div class="corridorcard andes"><div class="cc-k">Corridor 2 &middot; ' + Q.gate1_status.replace(/_/g, " ").toLowerCase() + '</div>' +
      '<div class="cc-name">Amazon to Andean water towers</div><div class="cc-val">' +
      Q.short + ' Amazon <b>' + pct1(Q.amazon_annual) + '</b> (JJA ' + pct1(Q.seasonal_amssrab.JJA.amazon_mean) + ') &middot; ' +
      B.short + ' Amazon <b>' + pct1(B.amazon_annual) + '</b>, mixed-source</div></div>';
    return { corridors: 2 };
  }

  // ---- boot -----------------------------------------------------------------------------------
  function boot() {
    bindHeadlines();
    var wq = wedgeBar(Q, "andes-wedge-quito", "andes-read-quito", "andes-leg-quito");
    var wb = wedgeBar(B, "andes-wedge-bogota", "andes-read-bogota", "andes-leg-bogota");
    var sw = seasonWidget();
    var gl = gateLadder();
    var cc = corridorCards();
    window.__ANDES_WIDGETS = {
      ready: true, wedge_quito: wq, wedge_bogota: wb, season: sw, gates: gl, cards: cc,
      as_of: A.as_of, schema: A.schema
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
