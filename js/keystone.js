/* keystone.js - the "keystone field" scene widgets (graph-intelligence pivot). D3 + DOM only.
   Reads window.FLUVION_KEYSTONE (data/keystone_public.js = scrubbed OUTPUTS of the null-audited
   flying_river_graph run: the observed Lorenz curve of the first-order sink-directed dependency, its
   concentration scalars, and the self-deflating null audit). It PROJECTS committed values; it never
   recomputes. Everything is the SAME first-order field, so the curve, the shares, and the w-anchor
   are self-consistent by construction. Pure SVG/DOM, so it survives the no-GPU fallback (the map
   choropleth needs a GPU, but the load-bearing claim here does not). Writes window.__KEYSTONE. */
(function () {
  "use strict";
  var K = window.FLUVION_KEYSTONE;
  if (!K || !window.d3) { return; }
  var d3 = window.d3;
  var css = getComputedStyle(document.documentElement);
  var v = function (n, f) { return (css.getPropertyValue(n) || f).trim(); };
  var GREEN = v("--green", "#3ad6a3"), TEAL = v("--teal-bright", "#2bd4c4"),
      CORAL = v("--coral", "#e8694d"), MUTED = v("--muted", "#8fa3ad"),
      TEXT = v("--text", "#eaf2f2"), FAINT = v("--faint", "#5c6e78");
  var pct = function (x) { return Math.round(x * 100) + "%"; };

  // ---------- beat 1: the Lorenz curve + w-anchor chip (#keystone) ----------
  var host = document.getElementById("keystone");
  if (host) {
    var top10 = K.top10pct_supply_share, halfFrac = K.half_supply_cell_frac, gini = K.gini,
        corr = K.corr_with_evaporation, w = K.w_anchor, lz = K.lorenz || [], mk = K.marker || [0.10, top10];

    // readout line (bound from data; the prose says "about 48 percent", this is the exact figure)
    d3.select(host).append("div").attr("class", "ks-read").html(
      'Top <b class="ks-g">10%</b> of cells supply <b class="ks-g">' + pct(top10) + '</b> of the belt\'s imported rain'
      + ' &middot; barely tracks evaporation (r ' + corr.toFixed(2) + ')'
      + ' &middot; reduces to <b class="ks-g">w = ' + w.toFixed(4) + '</b>');

    var W = 460, H = 300, m = { t: 16, r: 18, b: 40, l: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var x = d3.scaleLinear().domain([0, 1]).range([0, iw]), y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);
    var svg = d3.select(host).append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("width", "100%")
      .attr("preserveAspectRatio", "xMidYMid meet").attr("role", "img")
      .attr("aria-label", "Lorenz curve: a tenth of the upwind cells supply about half the belt's imported rain");
    var g = svg.append("g").attr("transform", "translate(" + m.l + "," + m.t + ")");

    // gridlines + axes (0, half, all)
    [0, 0.5, 1].forEach(function (t) {
      g.append("line").attr("x1", 0).attr("x2", iw).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", "rgba(255,255,255,.07)");
      g.append("text").attr("x", -8).attr("y", y(t) + 3).attr("text-anchor", "end").attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", MUTED).text(pct(t));
      g.append("text").attr("x", x(t)).attr("y", ih + 16).attr("text-anchor", "middle").attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", MUTED).text(pct(t));
    });
    g.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -32).attr("text-anchor", "middle").attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", MUTED).text("SHARE OF THE BELT'S RAIN");
    g.append("text").attr("x", iw / 2).attr("y", ih + 32).attr("text-anchor", "middle").attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", MUTED).text("SHARE OF UPWIND CELLS (RANKED)");

    // equality diagonal (if every cell mattered equally)
    g.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(1)).attr("y2", y(1))
      .attr("stroke", FAINT).attr("stroke-width", 1).attr("stroke-dasharray", "3,4");
    g.append("text").attr("x", x(0.72)).attr("y", y(0.66)).attr("font-family", "var(--mono)").attr("font-size", 8.5).attr("fill", FAINT).attr("transform", "rotate(-32 " + x(0.72) + " " + y(0.66) + ")").text("if every cell mattered equally");

    // observed Lorenz (ranked biggest-first, so it bows ABOVE the diagonal): the load piles up
    var area = d3.area().x(function (d) { return x(d[0]); }).y0(function (d) { return y(d[0]); }).y1(function (d) { return y(d[1]); }).curve(d3.curveMonotoneX);
    var line = d3.line().x(function (d) { return x(d[0]); }).y(function (d) { return y(d[1]); }).curve(d3.curveMonotoneX);
    g.append("path").attr("d", area(lz)).attr("fill", TEAL).attr("opacity", 0.12);
    g.append("path").attr("d", line(lz)).attr("fill", "none").attr("stroke", TEAL).attr("stroke-width", 2.4);

    // the "top tenth -> ~half" marker
    var mx = x(mk[0]), my = y(mk[1]);
    g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", y(0)).attr("y2", my).attr("stroke", GREEN).attr("stroke-width", 1).attr("stroke-dasharray", "2,3").attr("opacity", 0.7);
    g.append("line").attr("x1", 0).attr("x2", mx).attr("y1", my).attr("y2", my).attr("stroke", GREEN).attr("stroke-width", 1).attr("stroke-dasharray", "2,3").attr("opacity", 0.7);
    g.append("circle").attr("cx", mx).attr("cy", my).attr("r", 4).attr("fill", GREEN).attr("stroke", "#052017").attr("stroke-width", 1.2);
    g.append("text").attr("x", mx + 8).attr("y", my - 6).attr("font-family", "var(--mono)").attr("font-size", 10).attr("font-weight", 600).attr("fill", GREEN).text("top 10% -> " + pct(mk[1]));
    g.append("text").attr("x", iw).attr("y", 12).attr("text-anchor", "end").attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", MUTED).text("Gini " + gini.toFixed(2));

    // w-anchor chip
    d3.select(host).append("div").attr("class", "ks-wchip").html(
      '<b>Reduces to w = ' + w.toFixed(4) + '</b> &middot; the same weight the engine is validated on, '
      + 'recovered from the full field as a same-tensor consistency check, not an independent validation.');
  }

  // ---------- beat 2: the self-deflating audit chip (#kaudit) ----------
  var ah = document.getElementById("kaudit");
  if (ah) {
    var A = K.audit || {};
    var rows = [
      { tag: "HOLDS", cls: "hold", what: "Concentrated, not a magnitude artifact",
        detail: "top 10% of cells supply " + pct(K.top10pct_supply_share) + "; correlation with evaporation " + K.corr_with_evaporation.toFixed(2) },
      { tag: "HOLDS", cls: "hold", what: "A tenth of the cells carry half",
        detail: "the top " + pct(K.half_supply_cell_frac) + " of cells carry half the supply; a concentration result, not a cascade, nothing re-routes" },
      { tag: "DEFLATED", cls: "defl", what: "Mostly corridor geometry",
        detail: "a distance-preserving shuffle gives Gini " + A.distance_null_gini_mean.toFixed(3) + " versus observed " + K.gini.toFixed(3) + "; against equal-area patches the field sits at the " + Math.round(A.equal_area_null_observed_percentile * 100) + "th percentile" },
    ];
    var box = d3.select(ah).append("div").attr("class", "kaudit-box");
    rows.forEach(function (r) {
      var row = box.append("div").attr("class", "kaudit-row");
      row.append("span").attr("class", "kaudit-tag kaudit-" + r.cls).text(r.tag);
      var t = row.append("div").attr("class", "kaudit-txt");
      t.append("b").text(r.what);
      t.append("span").text(r.detail);
    });
    d3.select(ah).append("div").attr("class", "kaudit-verdict").html("Verdict <b>" + (A.verdict || "decision-useful, not Nature-grade") + "</b>. Topology after Wunderling 2022; teleconnection prior art Li 2026, Cui 2026, Pranindita 2025.");
  }

  window.__KEYSTONE = {
    ready: true,
    lorenz_n: (K.lorenz || []).length,
    top10: K.top10pct_supply_share, gini: K.gini, w: K.w_anchor,
    distance_null: (K.audit || {}).distance_null_gini_mean,
    verdict: (K.audit || {}).verdict,
  };
})();
