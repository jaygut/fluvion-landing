// interactive.js - the live in-browser Water Value-at-Risk calculator + moisture graph.
// Powered by FLUVION_EMU (the surrogate running client-side). Real engine, no backend.

// ---------------------------------------------------------------- //
// Live Water Value-at-Risk calculator
// ---------------------------------------------------------------- //
function liveCalculator(sel) {
  const host = d3.select(sel);
  host.selectAll("*").remove();
  if (!window.FLUVION_EMU) { host.append("p").text("Calculator unavailable."); return; }
  const EMU = FLUVION_EMU.data;
  const state = { scenario: "central", discount: 0.08, parcels: EMU.parcels.map((p) => p.name) };

  const wrap = host.append("div").attr("class", "calc");
  // ---- controls ----
  const ctrl = wrap.append("div").attr("class", "calc-controls");
  // scenario
  let g = ctrl.append("div").attr("class", "calc-row");
  g.append("label").text("Drought scenario");
  const seg = g.append("div").attr("class", "seg");
  [["low", "Mild"], ["central", "Central"], ["high", "Severe"]].forEach(([k, lab]) => {
    seg.append("button").attr("class", "seg-btn" + (k === "central" ? " on" : "")).text(lab)
      .on("click", function () { state.scenario = k; seg.selectAll(".seg-btn").classed("on", false); d3.select(this).classed("on", true); update(); });
  });
  // discount slider
  g = ctrl.append("div").attr("class", "calc-row");
  g.append("label").html('Discount rate <span class="calc-val" id="dval">8%</span>');
  g.append("input").attr("type", "range").attr("min", 4).attr("max", 12).attr("step", 0.5).attr("value", 8)
    .on("input", function () { state.discount = +this.value / 100; d3.select("#dval").text(this.value + "%"); update(); });
  // parcels
  g = ctrl.append("div").attr("class", "calc-row");
  g.append("label").text("Forests conserved");
  const pc = g.append("div").attr("class", "parcels");
  EMU.parcels.forEach((p) => {
    const id = "pc_" + p.name.replace(/\W/g, "");
    const lbl = pc.append("label").attr("class", "pchk");
    lbl.append("input").attr("type", "checkbox").attr("checked", true)
      .on("change", function () {
        state.parcels = EMU.parcels.filter((q) => document.getElementById("pc_" + q.name.replace(/\W/g, "")).checked).map((q) => q.name);
        update();
      }).attr("id", id);
    lbl.append("span").text(p.name + " (" + Math.round(p.area_ha / 1000) + "k ha)");
  });

  // ---- outputs ----
  const out = wrap.append("div").attr("class", "calc-out");
  const big = out.append("div").attr("class", "calc-big");
  big.append("div").attr("class", "calc-num").attr("id", "perha");
  big.append("div").attr("class", "calc-lab").text("per hectare, 30-year avoided-loss value");
  const barWrap = out.append("div").attr("class", "calc-bar");
  const kpis = out.append("div").attr("class", "calc-kpis");
  ["VaR95", "ES95", "Interval"].forEach((k) => {
    const d = kpis.append("div").attr("class", "calc-kpi");
    d.append("div").attr("class", "ck-v").attr("id", "ck_" + k);
    d.append("div").attr("class", "ck-l").text(
      k === "VaR95" ? "yearly UK loss, high estimate" : k === "ES95" ? "average of the higher estimates" : "range (5th to 95th)");
  });
  out.append("div").attr("class", "calc-states").attr("id", "calc-states");
  out.append("div").attr("class", "calc-foot").html(
    'Runs in your browser, no server. The risk figures are the uncertainty in the average yearly loss, ' +
    'not a worst-case year. UK import share is provisional (Trase/SEI aggregate). Uncertainty floor ' +
    EMU.conformal.coverage_floor + '. Indicative, not prudential grade.');

  function update() {
    const q = FLUVION_EMU.query({ scenario: state.scenario, discount: state.discount, parcels: state.parcels, n: 9000 });
    d3.select("#perha").text("$" + Math.round(q.median_per_ha));
    d3.select("#ck_VaR95").text("$" + d3.format(".2s")(q.var95).replace("M", "M").replace("k", "k"));
    d3.select("#ck_ES95").text("$" + d3.format(".2s")(q.es95));
    d3.select("#ck_Interval").text("$" + Math.round(q.p5) + "-" + Math.round(q.p95));
    drawBar(q);
    drawStates();
  }
  function drawBar(q) {
    const land = (window.FLUVION_DATA.parcel_values && window.FLUVION_DATA.parcel_values.land_price_ref_usd_ha) || 295;
    const W = 460, H = 54, m = 30;
    barWrap.selectAll("*").remove();
    const svg = barWrap.append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%");
    const x = d3.scaleLinear().domain([0, Math.max(820, q.p95 * 1.05)]).range([m, W - m]);
    svg.append("line").attr("x1", x(q.p5)).attr("x2", x(q.p95)).attr("y1", 22).attr("y2", 22).attr("stroke", "#4fc3f7").attr("stroke-width", 6).attr("stroke-linecap", "round");
    svg.append("circle").attr("cx", x(q.median_per_ha)).attr("cy", 22).attr("r", 8).attr("fill", "#00d4aa");
    svg.append("line").attr("x1", x(land)).attr("x2", x(land)).attr("y1", 8).attr("y2", 40).attr("stroke", "#78909c").attr("stroke-dasharray", "3 3");
    svg.append("text").attr("x", x(land)).attr("y", 50).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#78909c").text("land $" + land);
    svg.append("text").attr("x", x(q.median_per_ha)).attr("y", 12).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#00d4aa").text("value");
  }
  function drawStates() {
    const rows = FLUVION_EMU.perState(state.scenario).slice(0, 6);
    const host2 = d3.select("#calc-states"); host2.selectAll("*").remove();
    host2.append("div").attr("class", "cs-title").text("Where the UK exposure sits");
    const max = d3.max(rows, (r) => r.uk_var95_usd) || 1;
    rows.forEach((r) => {
      const row = host2.append("div").attr("class", "cs-row");
      row.append("span").attr("class", "cs-name").text(r.state);
      row.append("span").attr("class", "cs-track").append("span").attr("class", "cs-fill")
        .style("width", (r.uk_var95_usd / max * 100) + "%");
      row.append("span").attr("class", "cs-val").text("$" + d3.format(".2s")(r.uk_var95_usd));
    });
  }
  update();
}

// ---------------------------------------------------------------- //
// Portfolio stress test (Feature B)
// ---------------------------------------------------------------- //
function portfolioStress(sel) {
  const host = d3.select(sel);
  host.selectAll("*").remove();
  if (!window.FLUVION_EMU) { host.append("p").text("Stress test unavailable."); return; }
  const pdata = (window.FLUVION_DATA && window.FLUVION_DATA.portfolio_presets);
  const presets = (pdata && pdata.presets) || [
    { name: "Mid-size fund", exposure_usd: 100e6, scenario: "central" },
    { name: "Large bank book", exposure_usd: 500e6, scenario: "central" },
    { name: "Full UK soy book", exposure_usd: 2275e6, scenario: "central" },
  ];
  const fmtExp = (m) => m >= 1000 ? "$" + (m / 1000).toFixed(2) + "bn" : "$" + Math.round(m) + "M";
  const state = { exposure: presets[1].exposure_usd, scenario: presets[1].scenario };

  const wrap = host.append("div").attr("class", "stress");

  // Controls
  const ctrl = wrap.append("div").attr("class", "stress-controls");
  let g = ctrl.append("div").attr("class", "calc-row");
  g.append("label").html('Soy exposure <span class="calc-val" id="exp-val">$500M</span>');
  g.append("input").attr("type", "range").attr("min", 10).attr("max", 2275).attr("step", 5).attr("value", 500)
    .on("input", function () {
      state.exposure = +this.value * 1e6;
      d3.select("#exp-val").text(fmtExp(+this.value));
      update();
    });
  g = ctrl.append("div").attr("class", "calc-row");
  g.append("label").text("Drought scenario");
  const seg = g.append("div").attr("class", "seg");
  [["low", "Mild"], ["central", "Central"], ["high", "Severe"]].forEach(([k, lab]) => {
    seg.append("button").attr("class", "seg-btn" + (k === "central" ? " on" : "")).text(lab)
      .on("click", function () {
        state.scenario = k;
        seg.selectAll(".seg-btn").classed("on", false);
        d3.select(this).classed("on", true);
        update();
      });
  });
  // Preset buttons
  g = ctrl.append("div").attr("class", "calc-row");
  g.append("label").text("Quick presets");
  const pg = g.append("div").attr("class", "preset-row");
  presets.forEach((p) => {
    pg.append("button").attr("class", "preset-btn").text(p.name)
      .on("click", function () {
        state.exposure = p.exposure_usd;
        state.scenario = p.scenario;
        d3.select("#exp-val").text(fmtExp(p.exposure_usd / 1e6));
        const slider = host.select("input[type=range]").node();
        slider.value = Math.round(p.exposure_usd / 1e6);
        seg.selectAll(".seg-btn").classed("on", false);
        seg.selectAll(".seg-btn").each(function () {
          if (this.textContent === (p.scenario === "low" ? "Mild" : p.scenario === "high" ? "Severe" : "Central"))
            d3.select(this).classed("on", true);
        });
        update();
      });
  });

  // Output
  const out = wrap.append("div").attr("class", "stress-out");
  const bigRow = out.append("div").attr("class", "stress-big-row");
  bigRow.append("div").attr("class", "stress-big").append("div").attr("class", "calc-num").attr("id", "stress-var");
  bigRow.append("div").attr("class", "stress-big").append("div").attr("class", "calc-num").attr("id", "stress-es");
  bigRow.append("div").attr("class", "stress-big").append("div").attr("class", "calc-num").attr("id", "stress-pct");
  out.append("div").attr("class", "stress-labels");
  out.append("div").attr("class", "stress-chart").attr("id", "stress-chart");
  out.append("div").attr("class", "calc-foot").text(
    "Runs in your browser. The loss scales linearly with exposure. Indicative, not prudential grade."
  );

  // Labels under big numbers
  function setLabels() {
    const labels = out.select(".stress-labels");
    labels.selectAll("*").remove();
    labels.append("div").attr("class", "stress-lab").text("VaR95 (annual loss)");
    labels.append("div").attr("class", "stress-lab").text("Expected Shortfall 95");
    labels.append("div").attr("class", "stress-lab").text("loss as % of exposure");
  }
  setLabels();

  function update() {
    const q = FLUVION_EMU.query({ scenario: state.scenario, discount: 0.08, parcels: FLUVION_EMU.data.parcels.map(p => p.name), n: 9000 });
    // Honest linear scaling: the engine's VaR is for the UK-attributable soy book value
    // (reference_exposure_usd = s_uk x P_soy x price). Scale to the user's exposure by
    // the ratio. At the reference exposure this returns the engine VaR exactly. No fudge.
    const ref = FLUVION_EMU.data.reference_exposure_usd;
    const var95 = q.var95 * (state.exposure / ref);
    const es95 = q.es95 * (state.exposure / ref);
    const pct = (var95 / state.exposure) * 100;
    d3.select("#stress-var").text("$" + d3.format(".3s")(var95).replace("M", "M").replace("k", "k"));
    d3.select("#stress-es").text("$" + d3.format(".3s")(es95).replace("M", "M").replace("k", "k"));
    d3.select("#stress-pct").text(pct.toFixed(1) + "%");
    drawChart(var95, es95);
  }

  function drawChart(var95, es95) {
    const W = 420, H = 120, m = { t: 10, r: 20, b: 30, l: 50 };
    const chartHost = d3.select("#stress-chart");
    chartHost.selectAll("*").remove();
    const svg = chartHost.append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%");
    const maxV = Math.max(var95, es95) * 1.2;
    const x = d3.scaleBand().domain(["VaR95", "ES95"]).range([m.l, W - m.r]).padding(0.4);
    const y = d3.scaleLinear().domain([0, maxV]).range([H - m.b, m.t]);
    svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x)).attr("font-size", 10);
    svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d => "$" + d3.format(".2s")(d))).attr("font-size", 9);
    const data = [{ k: "VaR95", v: var95 }, { k: "ES95", v: es95 }];
    svg.selectAll("rect").data(data).join("rect")
      .attr("x", d => x(d.k)).attr("width", x.bandwidth())
      .attr("y", y(0)).attr("height", 0)
      .attr("fill", d => d.k === "VaR95" ? C.risk : C.riskDeep)
      .transition().duration(600).attr("y", d => y(d.v)).attr("height", d => y(0) - y(d.v));
    svg.selectAll("text.sv").data(data).join("text").attr("class", "sv")
      .attr("x", d => x(d.k) + x.bandwidth() / 2).attr("y", d => y(d.v) - 5)
      .attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700).attr("fill", "#333")
      .text(d => "$" + d3.format(".2s")(d.v));
  }

  update();
}

// ---------------------------------------------------------------- //
// Moisture teleconnection graph (source -> soy states)
// ---------------------------------------------------------------- //
function moistureGraph(sel) {
  const host = d3.select(sel); host.selectAll("*").remove();
  if (!window.FLUVION_EMU) return;
  const g = FLUVION_EMU.data.graph, W = 760, H = 520;
  const svg = d3.select(sel).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .style("width", "100%").style("height", "auto").style("display", "block");
  // --- geographic basemap: real Brazil state outlines under the network ---
  const proj = d3.geoMercator().fitExtent([[18, 14], [W - 18, H - 14]], UF());
  const path = d3.geoPath(proj);
  svg.append("g").selectAll("path").data(UF().features).join("path")
    .attr("d", path).attr("fill", "#eaf1f4").attr("stroke", "#d2dde2").attr("stroke-width", 0.7);
  const P = (lon, lat) => proj([lon, lat]);
  const states = g.nodes.filter((n) => n.type === "sink_state");
  const src = g.nodes.find((n) => n.type === "source_parcel");
  const mmax = d3.max(g.edges, (e) => e.moisture_share);
  const ov = FLUVION_EMU.perState("central");
  const exp = {}; ov.forEach((r) => (exp[r.uf] = r.uk_var95_usd));
  const emax = d3.max(Object.values(exp)) || 1;
  // --- flying-river arcs: source -> each soy state, bowed, width = moisture share ---
  g.edges.forEach((e) => {
    const st = states.find((s) => s.uf === e.uf); if (!st) return;
    const [sx, sy] = P(src.lon, src.lat), [tx, ty] = P(st.lon, st.lat);
    const mx = (sx + tx) / 2, my = (sy + ty) / 2 - 34;  // bow the arc upward
    svg.append("path").attr("d", `M${sx},${sy} Q${mx},${my} ${tx},${ty}`).attr("fill", "none")
      .attr("stroke", "#00d4aa").attr("stroke-opacity", 0.2 + 0.6 * (e.moisture_share / mmax))
      .attr("stroke-width", 1 + 6 * (e.moisture_share / mmax)).attr("stroke-linecap", "round");
  });
  // --- soy-state nodes: radius = UK exposure ---
  const TT = tooltip();
  svg.append("g").selectAll("circle").data(states).join("circle")
    .attr("cx", (d) => P(d.lon, d.lat)[0]).attr("cy", (d) => P(d.lon, d.lat)[1])
    .attr("r", (d) => 4 + 14 * Math.sqrt((exp[d.uf] || 0) / emax))
    .attr("fill", "#ff8a65").attr("opacity", 0.88).attr("stroke", "#fff").attr("stroke-width", 0.9)
    .on("mousemove", (ev, d) => TT.show(`<b>${d.name}</b><br>${(d.moisture_share * 100).toFixed(1)}% of source rain<br>UK VaR $${d3.format(".2s")(exp[d.uf] || 0)}`, ev))
    .on("mouseout", TT.hide);
  svg.selectAll("text.st").data(states).join("text").attr("class", "st")
    .attr("x", (d) => P(d.lon, d.lat)[0]).attr("y", (d) => P(d.lon, d.lat)[1] - 12).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("font-weight", 600).attr("fill", "#37474f")
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 2.6).attr("stroke-linejoin", "round")
    .text((d) => d.name);
  // --- source parcel ---
  const [sx, sy] = P(src.lon, src.lat);
  svg.append("circle").attr("cx", sx).attr("cy", sy).attr("r", 11).attr("fill", "#00d4aa").attr("stroke", "#fff").attr("stroke-width", 1.6);
  svg.append("text").attr("x", sx).attr("y", sy - 16).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700)
    .attr("fill", "#00897b").attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 3.2).attr("stroke-linejoin", "round")
    .text("Amazonas source");
  // --- compact legend (top-right overlay) ---
  const lg = svg.append("g").attr("transform", `translate(${W - 188},22)`);
  lg.append("rect").attr("x", -12).attr("y", -14).attr("width", 188).attr("height", 70).attr("rx", 8)
    .attr("fill", "#ffffff").attr("opacity", 0.82).attr("stroke", "#e3e9ec");
  lg.append("line").attr("x1", 0).attr("x2", 30).attr("y1", 2).attr("y2", 2).attr("stroke", "#00d4aa").attr("stroke-width", 5).attr("stroke-linecap", "round");
  lg.append("text").attr("x", 38).attr("y", 6).attr("font-size", 10.5).attr("fill", "#455").text("thicker = more moisture");
  lg.append("circle").attr("cx", 15).attr("cy", 30).attr("r", 9).attr("fill", "#ff8a65").attr("opacity", 0.88);
  lg.append("text").attr("x", 38).attr("y", 34).attr("font-size", 10.5).attr("fill", "#455").text("bigger = more UK exposure");
}
