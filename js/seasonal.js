/* seasonal.js - the "seasonal shape" scene (scene 4) on the landing. D3 only.
   Reads window.FLUVION_SEASONAL (data/seasonal_public.js = scrubbed OUTPUTS: the four seasonal
   transport w and Amazon->La Plata shares, the 3-model spread, and the annual reconciliation vs
   RECON). It PROJECTS committed values; it never recomputes a number. Two tracks that move
   oppositely across the seasons: transport (w) peaks in the wet season, the dependence share peaks
   in the dry. No dollars, no coefficients. Writes window.__SEASONAL for headless verification. */
(function () {
  "use strict";
  var S = window.FLUVION_SEASONAL, host = document.getElementById("seasonal");
  if (!S || !host || !window.d3) { if (host) host.style.display = "none"; return; }
  var d3 = window.d3, seasons = S.seasons, keys = seasons.map(function (s) { return s.key; });
  var css = getComputedStyle(document.documentElement);
  var GREEN = (css.getPropertyValue("--green") || "#3ad6a3").trim();
  var CORAL = (css.getPropertyValue("--coral") || "#e8694d").trim();
  var MUTED = (css.getPropertyValue("--muted") || "#8fa3ad").trim();
  var TEXT = (css.getPropertyValue("--text") || "#eaf2f2").trim();
  var HAIR = "rgba(255,255,255,.10)";

  var W = 660, H = 300, m = { t: 22, r: 56, b: 46, l: 50 };
  var iw = W - m.l - m.r, ih = H - m.t - m.b;
  var x = d3.scalePoint().domain(keys).range([0, iw]).padding(0.5);
  var yW = d3.scaleLinear().domain([0, 0.42]).range([ih, 0]);
  var yS = d3.scaleLinear().domain([0, 30]).range([ih, 0]);

  var svg = d3.select(host).append("svg")
    .attr("viewBox", "0 0 " + W + " " + H).attr("width", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet").attr("role", "img")
    .attr("aria-label", "Seasonal transport and dependence tracks for the Amazon to La Plata corridor");
  var g = svg.append("g").attr("transform", "translate(" + m.l + "," + m.t + ")");

  // dry-season highlight band (JJA)
  var jjaX = x("JJA");
  g.append("rect").attr("x", jjaX - x.step() * 0.32).attr("y", 0).attr("width", x.step() * 0.64)
    .attr("height", ih).attr("fill", CORAL).attr("opacity", 0.06);
  g.append("text").attr("x", jjaX).attr("y", -8).attr("text-anchor", "middle")
    .attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", MUTED)
    .attr("letter-spacing", "0.06em").text("DRY SEASON");

  // x axis
  keys.forEach(function (k) {
    g.append("text").attr("x", x(k)).attr("y", ih + 18).attr("text-anchor", "middle")
      .attr("font-family", "var(--mono)").attr("font-size", 11).attr("fill", MUTED).text(k);
  });
  g.append("line").attr("x1", 0).attr("x2", iw).attr("y1", ih).attr("y2", ih).attr("stroke", HAIR);

  // left axis (transport w) + right axis (dependence share)
  [0, 0.1, 0.2, 0.3, 0.4].forEach(function (t) {
    g.append("line").attr("x1", 0).attr("x2", iw).attr("y1", yW(t)).attr("y2", yW(t)).attr("stroke", HAIR).attr("stroke-dasharray", "2,4");
    g.append("text").attr("x", -8).attr("y", yW(t) + 3).attr("text-anchor", "end").attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", GREEN).text(t.toFixed(1));
  });
  [0, 10, 20, 30].forEach(function (t) {
    g.append("text").attr("x", iw + 8).attr("y", yS(t) + 3).attr("font-family", "var(--mono)").attr("font-size", 9).attr("fill", CORAL).text(t + "%");
  });
  g.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -38).attr("text-anchor", "middle").attr("font-family", "var(--mono)").attr("font-size", 9.5).attr("fill", GREEN).text("TRANSPORT w");
  g.append("text").attr("transform", "rotate(90)").attr("x", ih / 2).attr("y", -(iw + 48)).attr("text-anchor", "middle").attr("font-family", "var(--mono)").attr("font-size", 9.5).attr("fill", CORAL).text("DEPENDENCE share");

  // spread bands
  var areaW = d3.area().x(function (s) { return x(s.key); }).y0(function (s) { return yW(Math.max(0, s.w - s.w_sd)); }).y1(function (s) { return yW(s.w + s.w_sd); }).curve(d3.curveMonotoneX);
  var areaS = d3.area().x(function (s) { return x(s.key); }).y0(function (s) { return yS(s.share_min); }).y1(function (s) { return yS(s.share_max); }).curve(d3.curveMonotoneX);
  g.append("path").attr("d", areaW(seasons)).attr("fill", GREEN).attr("opacity", 0.12);
  g.append("path").attr("d", areaS(seasons)).attr("fill", CORAL).attr("opacity", 0.12);

  // lines
  var lineW = d3.line().x(function (s) { return x(s.key); }).y(function (s) { return yW(s.w); }).curve(d3.curveMonotoneX);
  var lineS = d3.line().x(function (s) { return x(s.key); }).y(function (s) { return yS(s.share); }).curve(d3.curveMonotoneX);
  g.append("path").attr("d", lineW(seasons)).attr("fill", "none").attr("stroke", GREEN).attr("stroke-width", 2.4);
  g.append("path").attr("d", lineS(seasons)).attr("fill", "none").attr("stroke", CORAL).attr("stroke-width", 2.4);

  // dots
  seasons.forEach(function (s) {
    g.append("circle").attr("cx", x(s.key)).attr("cy", yW(s.w)).attr("r", 3.4).attr("fill", GREEN).attr("data-w", s.key);
    g.append("circle").attr("cx", x(s.key)).attr("cy", yS(s.share)).attr("r", 3.4).attr("fill", CORAL).attr("data-s", s.key);
  });

  // moving marker + readout, driven by the season toggle
  var mark = g.append("line").attr("y1", 0).attr("y2", ih).attr("stroke", TEXT).attr("stroke-width", 1).attr("opacity", 0.5).attr("stroke-dasharray", "3,3").style("display", "none");
  var read = d3.select(host).append("div").attr("class", "seas-read");
  var toggle = d3.select(host).append("div").attr("class", "seas-toggle");
  toggle.append("span").attr("class", "seas-tlab").text("Move across the year");
  function show(k) {
    var s = seasons.find(function (z) { return z.key === k; });
    mark.attr("x1", x(k)).attr("x2", x(k)).style("display", null);
    read.html('<b>' + k + '</b> <span class="seas-tag">' + s.tag + '</span> &middot; transport w <b class="seas-g">' + s.w.toFixed(3) + '</b> &middot; dependence <b class="seas-c">' + s.share.toFixed(1) + '%</b>');
    toggle.selectAll("button").classed("on", function () { return this.getAttribute("data-k") === k; });
  }
  keys.forEach(function (k) {
    toggle.append("button").attr("class", "seas-btn").attr("data-k", k).attr("type", "button").text(k)
      .on("click", function () { show(k); });
  });
  show("JJA"); // open on the dry-season inversion point

  // reconciliation line (the "one number" it collapses back to)
  d3.select(host).append("div").attr("class", "seas-recon").html(
    'Annual reconstruction <b class="seas-g">' + S.annual.w.toFixed(3) + '</b> vs committed RECON <b>' + S.annual.recon_anchor + '</b> (' + S.annual.rel_error_pct + '%) &middot; ' +
    S.n_models + ' models agree &middot; ' + S.n_cells + ' cells &middot; wet-season transport ' + S.djf_over_jja + '× the dry &middot; 10-gate validation ' + S.verdict + ' (rank-stability τ ' + S.kendall_tau + ') &middot; hash ' + S.field_hash);

  d3.select(host).append("div").attr("class", "seas-caption").html(
    "One validated corridor &middot; descriptive &middot; firewalled from price &middot; not a forecast. Groups like Amazon Conservation map where the forest stands; this shows when the belt leans on it.");

  window.__SEASONAL = { ready: true, keys: keys, ws: seasons.map(function (s) { return s.w; }), shares: seasons.map(function (s) { return s.share; }), annual: S.annual.w };
})();
