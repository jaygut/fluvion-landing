// figures.js - all Fluvion D3 figure renderers (real data from window.FLUVION_DATA).
// Each export renders into a container selector. Shared by report + scrollytelling.

const TT = tooltip();
const UF = () => D.geo_uf;

// ---------------------------------------------------------------- //
// 1. Precipitationshed field (hero): source-box -> per-cell flow
// ---------------------------------------------------------------- //
function precipitationshed(sel, { dark = false } = {}) {
  const f = D.precipitationshed_field, W = 760, H = 720;
  const svg = svgIn(sel, W, H);
  const proj = corridorProjection(W, H, f.corridor);
  const path = d3.geoPath(proj);
  const lats = f.lats, lons = f.lons, Z = f.flow_m3yr;
  const dlat = Math.abs(lats[1] - lats[0]), dlon = Math.abs(lons[1] - lons[0]);
  // log color scale (flow spans orders of magnitude)
  const vmax = f.flow_max, vmin = vmax / 1e4;
  const color = d3.scaleSequentialLog([vmin, vmax], (t) =>
    d3.interpolateRgbBasis([dark ? "#0a0e1a" : "#0a1f2e", C.water, C.moisture])(t));
  // ocean/land backdrop
  svg.append("rect").attr("width", W).attr("height", H)
     .attr("fill", dark ? "#060912" : "#0a1622");
  // UF outlines for geographic context
  svg.append("g").selectAll("path").data(UF().features).join("path")
     .attr("d", path).attr("fill", "none")
     .attr("stroke", dark ? "#1c2740" : "#16324a").attr("stroke-width", 0.6);
  // flow cells
  const g = svg.append("g").attr("opacity", 0.92);
  for (let i = 0; i < lats.length; i++) {
    for (let j = 0; j < lons.length; j++) {
      const v = Z[i][j];
      if (v <= vmin) continue;
      const p = proj([lons[j], lats[i]]);
      const p2 = proj([lons[j] + dlon, lats[i] - dlat]);
      g.append("rect").attr("x", p[0]).attr("y", p[1])
       .attr("width", Math.abs(p2[0] - p[0]) + 0.5).attr("height", Math.abs(p2[1] - p[1]) + 0.5)
       .attr("fill", color(v));
    }
  }
  // source + sink boxes
  const boxPath = (b, stroke, label, lx) => {
    const poly = { type: "Polygon", coordinates: [[[b.lon_min, b.lat_min], [b.lon_max, b.lat_min],
      [b.lon_max, b.lat_max], [b.lon_min, b.lat_max], [b.lon_min, b.lat_min]]] };
    svg.append("path").attr("d", path(poly)).attr("fill", "none")
       .attr("stroke", stroke).attr("stroke-width", 2).attr("stroke-dasharray", "5 3");
    const c = proj([b.lon_min, b.lat_max]);
    svg.append("text").attr("x", c[0]).attr("y", c[1] - 6).attr("fill", stroke)
       .attr("font-size", 13).attr("font-weight", 600).text(label);
  };
  boxPath(f.source_box, C.moisture, "Source parcels (324,542 ha)");
  boxPath(f.sink_box, C.risk, "Soy / La Plata sink");
  // legend
  const lg = svg.append("g").attr("transform", `translate(${W - 150},${H - 90})`);
  lg.append("text").attr("fill", "#cfe").attr("font-size", 11).text("Moisture flow (m³/yr)");
  const grad = svg.append("defs").append("linearGradient").attr("id", "psgrad");
  d3.range(0, 1.01, 0.1).forEach((t) => grad.append("stop").attr("offset", `${t * 100}%`)
    .attr("stop-color", color(vmin * Math.pow(vmax / vmin, t))));
  lg.append("rect").attr("y", 8).attr("width", 130).attr("height", 10).attr("fill", "url(#psgrad)");
  lg.append("text").attr("y", 34).attr("fill", "#9ab").attr("font-size", 10).text("low → high");
}

// ---------------------------------------------------------------- //
// 2. Exposure dial - counters + donut
// ---------------------------------------------------------------- //
function exposure(sel) {
  const e = D.exposure, W = 880, H = 240;
  const svg = svgIn(sel, W, H);
  const items = [
    { v: e.gdp_at_risk_pct, suf: "%", lab: "UK GDP at risk from nature loss", col: C.risk },
    { v: e.overseas_share_pct, suf: "%", lab: "of it starts overseas", col: C.warn },
    { v: e.uk_bank_exposure_usd_bn, pre: "$", suf: "bn", lab: "UK bank lending to forest-risk agribusiness", col: C.water },
    { v: e.amazon_rainfall_value_usd_bn_yr, pre: "$", suf: "bn", lab: "Amazon rainfall value per year (Baker 2026)", col: C.moisture },
  ];
  const cw = W / items.length;
  items.forEach((it, i) => {
    const g = svg.append("g").attr("transform", `translate(${i * cw + cw / 2},70)`);
    const t = g.append("text").attr("text-anchor", "middle").attr("font-size", 38)
      .attr("font-weight", 800).attr("fill", it.col);
    t.transition().duration(1200).tween("n", function () {
      const ip = d3.interpolateNumber(0, it.v);
      return (k) => t.text((it.pre || "") + d3.format(it.v % 1 ? ".2f" : ".0f")(ip(k)) + it.suf);
    });
    g.append("text").attr("text-anchor", "middle").attr("y", 28).attr("font-size", 13)
     .attr("fill", "#5c6370").call(wrap, cw - 24, it.lab);
  });
  svg.append("text").attr("x", W / 2).attr("y", H - 14).attr("text-anchor", "middle")
     .attr("font-size", 11).attr("fill", "#9aa")
     .text("Sources: GFI 2024 · Forests & Finance 2024 · Baker et al. 2026");
}

// ---------------------------------------------------------------- //
// 3. Incumbent capability matrix
// ---------------------------------------------------------------- //
function incumbentMatrix(sel) {
  const m = D.incumbent_matrix, caps = m.capabilities, tools = m.tools;
  // right pad leaves room for the rotated header labels (e.g. "Provenance ledger")
  const W = 880, rowH = 30, top = 150, left = 200, cw = (W - left - 100) / caps.length;
  const H = top + tools.length * rowH + 20;
  const svg = svgIn(sel, W, H);
  const col = ["#ef5350", "#ffa726", "#66bb6a"]; // 0 lacks,1 partial,2 has
  caps.forEach((c, j) => {
    svg.append("text").attr("x", left + j * cw + cw / 2).attr("y", top - 8)
      .attr("transform", `rotate(-35,${left + j * cw + cw / 2},${top - 8})`)
      .attr("font-size", 10.5).attr("fill", "#444").attr("text-anchor", "start").text(c);
  });
  tools.forEach((t, i) => {
    const y = top + i * rowH, isF = t.name === "Fluvion";
    svg.append("text").attr("x", left - 10).attr("y", y + rowH / 2 + 4).attr("text-anchor", "end")
      .attr("font-size", 12).attr("font-weight", isF ? 700 : 400)
      .attr("fill", isF ? C.moisture : "#222").text(t.name);
    t.scores.forEach((s, j) => {
      svg.append("rect").attr("x", left + j * cw + 2).attr("y", y + 2)
        .attr("width", cw - 4).attr("height", rowH - 4).attr("rx", 3)
        .attr("fill", col[s]).attr("opacity", isF ? 1 : 0.82)
        .attr("stroke", isF ? "#1a1a2e" : "none").attr("stroke-width", isF ? 1.5 : 0)
        .on("mousemove", (ev) => TT.show(`<b>${t.name}</b><br>${caps[j]}: <b>${["lacks", "partial", "has"][s]}</b>`, ev))
        .on("mouseout", TT.hide);
    });
  });
}

// ---------------------------------------------------------------- //
// 4. Backtest skill by year (bar chart)
// ---------------------------------------------------------------- //
function backtestSkill(sel) {
  const py = D.backtest.per_year, years = Object.keys(py);
  const W = 760, H = 360, m = { t: 30, r: 20, b: 40, l: 50 };
  const svg = svgIn(sel, W, H);
  const x = d3.scaleBand().domain(years).range([m.l, W - m.r]).padding(0.25);
  const y = d3.scaleLinear().domain([-0.5, 0.8]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(0,${y(0)})`).call(d3.axisBottom(x).tickSize(0))
     .selectAll("text").attr("y", 14).attr("font-size", 11);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6))
     .attr("font-size", 10);
  svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0.3)).attr("y2", y(0.3))
     .attr("stroke", C.success).attr("stroke-dasharray", "4 3").attr("opacity", 0.7);
  svg.append("text").attr("x", W - m.r).attr("y", m.t - 12).attr("text-anchor", "end")
     .attr("font-size", 10).attr("fill", C.success).text("Gate-2 threshold r = 0.3 (dashed)");
  const ENSO = { "2005": 1, "2010": 1, "2016": 1, "2022": 1, "2024": 1 };
  svg.append("g").selectAll("rect").data(years).join("rect")
    .attr("x", (d) => x(d)).attr("width", x.bandwidth())
    .attr("y", (d) => Math.min(y(0), y(py[d].pearson_r)))
    .attr("height", (d) => Math.abs(y(py[d].pearson_r) - y(0)))
    .attr("fill", (d) => py[d].pearson_r >= 0.3 ? C.moisture : (py[d].pearson_r < 0 ? C.danger : C.warn))
    .attr("opacity", (d) => ENSO[d] ? 1 : 0.55)
    .on("mousemove", (ev, d) => TT.show(`<b>${d}</b> ${ENSO[d] ? "(ENSO/drought)" : ""}<br>Pearson r=${fmt.r(py[d].pearson_r)}<br>Spearman ρ=${fmt.r(py[d].spearman_rho)}<br>n=${py[d].n} states`, ev))
    .on("mouseout", TT.hide);
  svg.append("text").attr("x", m.l).attr("y", m.t - 12).attr("font-size", 11).attr("fill", "#555")
     .text("Detrended cross-state rainfall→yield skill (bold = ENSO years)");
}

// ---------------------------------------------------------------- //
// 5. Backtest choropleth maps (2022 / 2024) + scatter
// ---------------------------------------------------------------- //
function backtestMaps(sel, year) {
  const rows = year === 2024 ? D.backtest.map_2024 : D.backtest.map_2022;
  const byUf = new Map(rows.map((r) => [r.uf, r]));
  const W = 760, H = 420, mapW = 250;
  const svg = svgIn(sel, W, H);
  const proj = geoProjection(mapW, H - 30, UF());
  const path = d3.geoPath(proj);
  const ext = d3.max(rows, (r) => Math.max(Math.abs(r.obs), Math.abs(r.pred * 8))) || 40;
  const cObs = d3.scaleDiverging([-ext, 0, ext], d3.interpolateRdYlGn);
  const drawMap = (ox, key, title, scale, mult = 1) => {
    const g = svg.append("g").attr("transform", `translate(${ox},20)`);
    g.append("text").attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333").text(title);
    g.append("g").attr("transform", "translate(0,8)").selectAll("path").data(UF().features).join("path")
      .attr("d", path)
      .attr("fill", (f) => { const r = byUf.get(+f.properties.codarea); return r ? scale(r[key] * mult) : "#eef1f4"; })
      .attr("stroke", "#9fb0bc").attr("stroke-width", 0.5)
      .on("mousemove", (ev, f) => { const r = byUf.get(+f.properties.codarea);
        if (r) TT.show(`<b>${r.state}</b><br>observed: ${fmt.r(r.obs / 100)} <br>predicted: ${fmt.r(r.pred / 100)}`, ev); })
      .on("mouseout", TT.hide);
  };
  drawMap(0, "obs", "Observed (IBGE, detrended)", cObs);
  drawMap(mapW + 10, "pred", "Engine-predicted (×8, sign)", cObs, 8);
  // scatter
  const sx0 = 2 * mapW + 40, sw = W - sx0 - 20, sh = H - 60;
  const g = svg.append("g").attr("transform", `translate(${sx0},20)`);
  g.append("text").attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333").text("Pred vs Observed");
  const xs = d3.scaleLinear().domain([-8, 8]).range([0, sw]);
  const ys = d3.scaleLinear().domain([-ext, ext]).range([sh, 16]);
  g.append("g").attr("transform", `translate(0,${ys(0)})`).call(d3.axisBottom(xs).ticks(4)).attr("font-size", 9);
  g.append("g").call(d3.axisLeft(ys).ticks(5)).attr("font-size", 9);
  g.selectAll("circle").data(rows).join("circle")
    .attr("cx", (r) => xs(r.pred)).attr("cy", (r) => ys(r.obs)).attr("r", 5)
    .attr("fill", (r) => [41, 42, 43, 50].includes(r.uf) ? C.risk : C.moisture).attr("opacity", 0.8)
    .on("mousemove", (ev, r) => TT.show(`<b>${r.state}</b><br>pred ${r.pred}% · obs ${r.obs}%`, ev))
    .on("mouseout", TT.hide);
}

// ---------------------------------------------------------------- //
// 6. Financial backtest (engine vs Battisti)
// ---------------------------------------------------------------- //
function financialBacktest(sel) {
  const f = D.backtest_financial, W = 720, H = 300, m = { t: 40, r: 20, b: 40, l: 60 };
  const svg = svgIn(sel, W, H);
  const data = [
    { k: "Engine (gross)", v: f.engine_gross_usd_bn, c: C.moisture },
    { k: "Engine (net)", v: f.engine_net_usd_bn, c: C.water },
    { k: "Battisti 2024", v: f.battisti_usd_bn, c: C.risk },
  ];
  const x = d3.scaleBand().domain(data.map((d) => d.k)).range([m.l, W - m.r]).padding(0.35);
  const y = d3.scaleLinear().domain([0, 18]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x)).attr("font-size", 11);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((d) => "$" + d + "bn")).attr("font-size", 10);
  svg.selectAll("rect").data(data).join("rect")
    .attr("x", (d) => x(d.k)).attr("width", x.bandwidth()).attr("y", y(0)).attr("height", 0)
    .attr("fill", (d) => d.c)
    .transition().duration(900).attr("y", (d) => y(d.v)).attr("height", (d) => y(0) - y(d.v));
  svg.selectAll("text.val").data(data).join("text").attr("class", "val")
    .attr("x", (d) => x(d.k) + x.bandwidth() / 2).attr("y", (d) => y(d.v) - 6)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333")
    .text((d) => "$" + d.v.toFixed(1) + "bn");
  svg.append("text").attr("x", W / 2).attr("y", H - 8).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#666")
    .text(`2021/22 drought soy loss · our estimate is ${f.ratio_to_benchmark.toFixed(2)}× the published figure, both soy only`);
}

// ---------------------------------------------------------------- //
// 7. Cascade (numeric stage chain)
// ---------------------------------------------------------------- //
function cascade(sel) {
  const st = D.cascade.stages, W = 820, H = 220, cw = W / st.length;
  const svg = svgIn(sel, W, H);
  st.forEach((s, i) => {
    const cx = i * cw + cw / 2;
    if (i < st.length - 1) svg.append("path").attr("d", `M${i * cw + cw - 18},${H / 2} l28,0`)
      .attr("stroke", C.water).attr("stroke-width", 2).attr("marker-end", "url(#arr)");
    const g = svg.append("g").attr("transform", `translate(${cx},40)`);
    g.append("circle").attr("r", 26).attr("fill", "none").attr("stroke", CONF[s.confidence]).attr("stroke-width", 3);
    g.append("text").attr("text-anchor", "middle").attr("dy", 5).attr("font-size", 14).attr("font-weight", 700).attr("fill", "#1a1a2e").text(s.stage);
    g.append("text").attr("text-anchor", "middle").attr("y", 56).attr("font-size", 19).attr("font-weight", 700).attr("fill", C.water).text(s.value);
    g.append("text").attr("text-anchor", "middle").attr("y", 74).attr("font-size", 9.5).attr("fill", "#555").call(wrap, cw - 16, s.unit);
    g.append("text").attr("text-anchor", "middle").attr("y", 110).attr("font-size", 8.5).attr("fill", "#888").call(wrap, cw - 10, s.detail);
  });
  const defs = svg.append("defs").append("marker").attr("id", "arr").attr("viewBox", "0 0 10 10")
    .attr("refX", 8).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto");
  defs.append("path").attr("d", "M0,0 L10,5 L0,10").attr("fill", C.water);
}

// ---------------------------------------------------------------- //
// 8. Monte Carlo loss histogram
// ---------------------------------------------------------------- //
function monteCarlo(sel) {
  const mc = D.monte_carlo, W = 720, H = 320, m = { t: 30, r: 20, b: 45, l: 55 };
  const svg = svgIn(sel, W, H);
  const edges = mc.bin_edges_usd, counts = mc.counts;
  const x = d3.scaleLinear().domain([edges[0], edges[edges.length - 1]]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(counts)]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((d) => "$" + d3.format(".2s")(d))).attr("font-size", 9);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5)).attr("font-size", 9);
  svg.selectAll("rect").data(counts).join("rect")
    .attr("x", (d, i) => x(edges[i])).attr("width", (d, i) => Math.max(1, x(edges[i + 1]) - x(edges[i]) - 1))
    .attr("y", (d) => y(d)).attr("height", (d) => y(0) - y(d)).attr("fill", C.water).attr("opacity", 0.7);
  // VaR95 sits just left of ES95; anchor the labels outward so they never collide.
  [["VaR95", mc.var95, C.risk, "end", -5], ["ES95", mc.es95, C.riskDeep, "start", 5]].forEach(([lab, v, col, anchor, dx]) => {
    svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", col).attr("stroke-width", 2).attr("stroke-dasharray", "5 3");
    svg.append("text").attr("x", x(v) + dx).attr("y", m.t - 4).attr("text-anchor", anchor).attr("font-size", 10).attr("fill", col).text(`${lab} ${fmt.usdc(v)}`);
  });
  svg.append("text").attr("x", W / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#666")
    .text("A year of UK exposure · the spread is what we are unsure of, not a worst case");
}

// ---------------------------------------------------------------- //
// 9. Parcel value bars
// ---------------------------------------------------------------- //
function parcelValue(sel) {
  const p = D.parcel_values, W = 720, H = 320, m = { t: 40, r: 30, b: 50, l: 60 };
  const svg = svgIn(sel, W, H);
  const data = [
    { k: "Low f_loss", v: p.perha.low }, { k: "Central", v: p.perha.central }, { k: "High f_loss", v: p.perha.high },
  ];
  const x = d3.scaleBand().domain(data.map((d) => d.k)).range([m.l, W - m.r]).padding(0.4);
  const y = d3.scaleLinear().domain([0, 450]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x)).attr("font-size", 11);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((d) => "$" + d)).attr("font-size", 10);
  // reference lines
  [["Land price $" + p.land_price_ref_usd_ha + "/ha (INCRA 2025)", p.land_price_ref_usd_ha, C.firewall]].forEach(([lab, v, col]) => {
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", col).attr("stroke-dasharray", "5 3");
    svg.append("text").attr("x", W - m.r).attr("y", y(v) - 4).attr("text-anchor", "end").attr("font-size", 10).attr("fill", col).text(lab);
  });
  svg.selectAll("rect").data(data).join("rect").attr("x", (d) => x(d.k)).attr("width", x.bandwidth())
    .attr("y", y(0)).attr("height", 0).attr("fill", (d) => d.k === "Central" ? C.moisture : C.water)
    .transition().duration(900).attr("y", (d) => y(d.v)).attr("height", (d) => y(0) - y(d.v));
  svg.selectAll("text.v").data(data).join("text").attr("class", "v").attr("x", (d) => x(d.k) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.v) - 6).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 700).attr("fill", "#333").text((d) => "$" + d.v.toFixed(0));
  // P5-P95 whisker on central
  const cx = x("Central") + x.bandwidth() / 2;
  svg.append("line").attr("x1", cx).attr("x2", cx).attr("y1", y(p.perha_p5)).attr("y2", y(p.perha_p95)).attr("stroke", "#1a1a2e").attr("stroke-width", 1.5);
  [p.perha_p5, p.perha_p95].forEach((v) => svg.append("line").attr("x1", cx - 6).attr("x2", cx + 6).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", "#1a1a2e").attr("stroke-width", 1.5));
  svg.append("text").attr("x", W / 2).attr("y", H - 8).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#666")
    .text(`30-yr NPV avoided-loss $/ha (P5-P95 $${p.perha_p5.toFixed(0)} to ${p.perha_p95.toFixed(0)} on central). Annual-equiv $${p.engine_annual_equiv_usd_ha_yr}/ha/yr, about half Baker et al. 2026's $${p.baker_annual_usd_ha_yr} +/- ${p.baker_annual_usd_ha_yr_sd}/ha/yr Amazon-forest rainfall-generation value`);
}

// ---------------------------------------------------------------- //
// 10. Uncertainty surface (f_loss x w heatmap)
// ---------------------------------------------------------------- //
function uncertaintySurface(sel) {
  const u = D.uncertainty_surface, W = 640, H = 460, m = { t: 30, r: 90, b: 50, l: 60 };
  const svg = svgIn(sel, W, H);
  const fx = u.f_loss, wy = u.w_soybelt, Z = u.perha;
  const x = d3.scaleLinear().domain([fx[0], fx[fx.length - 1]]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([wy[0], wy[wy.length - 1]]).range([H - m.b, m.t]);
  const zmax = d3.max(Z, (r) => d3.max(r));
  const color = d3.scaleSequential([0, zmax], (t) => d3.interpolateRgbBasis(["#fafafa", C.water, C.moisture, C.riskDeep])(t));
  const cw = (x(fx[1]) - x(fx[0])), ch = (y(wy[0]) - y(wy[1]));
  for (let i = 0; i < wy.length; i++) for (let j = 0; j < fx.length; j++) {
    svg.append("rect").attr("x", x(fx[j])).attr("y", y(wy[i]) - ch).attr("width", cw + 0.5).attr("height", ch + 0.5)
      .attr("fill", color(Z[i][j]))
      .on("mousemove", (ev) => TT.show(`f_loss=${fx[j].toFixed(2)}, w=${wy[i].toFixed(3)}<br><b>$${Z[i][j].toFixed(0)}/ha</b>`, ev)).on("mouseout", TT.hide);
  }
  // RECON w band
  svg.append("rect").attr("x", m.l).attr("width", W - m.r - m.l)
    .attr("y", y(u.w_recon + u.w_sd)).attr("height", y(u.w_recon - u.w_sd) - y(u.w_recon + u.w_sd))
    .attr("fill", "#fff").attr("opacity", 0.18).attr("stroke", "#fff").attr("stroke-dasharray", "3 2");
  svg.append("text").attr("x", W - m.r - 4).attr("y", y(u.w_recon) - 4).attr("text-anchor", "end").attr("font-size", 10).attr("fill", "#fff").text("RECON w=0.20 ±σ");
  // f scenario lines
  Object.entries(u.f_scenarios).forEach(([k, v]) => {
    svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#fff").attr("stroke-dasharray", "2 3").attr("opacity", 0.6);
    svg.append("text").attr("x", x(v)).attr("y", m.t - 2).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#fff").text(k);
  });
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6)).attr("font-size", 9);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6)).attr("font-size", 9);
  svg.append("text").attr("x", (W) / 2).attr("y", H - 8).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#555").text("f_loss (moisture-service loss)");
  svg.append("text").attr("transform", `rotate(-90)`).attr("x", -H / 2).attr("y", 16).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#555").text("w_soybelt (precipitationshed weight)");
}

// ---------------------------------------------------------------- //
// 11. Sobol bars
// ---------------------------------------------------------------- //
function sobol(sel) {
  const s = D.sobol.indices, W = 700, H = 320, m = { t: 20, r: 60, b: 30, l: 120 };
  const svg = svgIn(sel, W, H);
  const x = d3.scaleLinear().domain([0, d3.max(s, (d) => d.ST)]).range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(s.map((d) => d.param)).range([m.t, H - m.b]).padding(0.25);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y)).attr("font-size", 10);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5)).attr("font-size", 9);
  svg.selectAll("rect.st").data(s).join("rect").attr("class", "st").attr("x", m.l).attr("y", (d) => y(d.param))
    .attr("height", y.bandwidth()).attr("width", (d) => x(d.ST) - m.l).attr("fill", C.water).attr("opacity", 0.35);
  svg.selectAll("rect.s1").data(s).join("rect").attr("class", "s1").attr("x", m.l).attr("y", (d) => y(d.param) + y.bandwidth() * 0.2)
    .attr("height", y.bandwidth() * 0.6).attr("width", (d) => x(d.S1) - m.l)
    .attr("fill", (d) => d.param === "w_soybelt" ? C.moisture : C.water)
    .on("mousemove", (ev, d) => TT.show(`<b>${d.param}</b><br>S1=${d.S1.toFixed(3)} · ST=${d.ST.toFixed(3)}`, ev)).on("mouseout", TT.hide);
  svg.append("text").attr("x", W - m.r).attr("y", m.t + 6).attr("text-anchor", "end").attr("font-size", 10).attr("fill", "#888").text("bar=S1 first-order · faint=ST total");
}

// ---------------------------------------------------------------- //
// 12. Confidence ladder
// ---------------------------------------------------------------- //
function confidenceLadder(sel) {
  const st = D.confidence_ladder.stages, W = 760, rowH = 56, H = st.length * rowH + 20;
  const svg = svgIn(sel, W, H);
  st.forEach((s, i) => {
    const y = i * rowH + 12;
    svg.append("rect").attr("x", 10).attr("y", y).attr("width", 8).attr("height", rowH - 16).attr("fill", CONF[s.confidence]);
    svg.append("text").attr("x", 28).attr("y", y + 14).attr("font-size", 13).attr("font-weight", 600).attr("fill", "#1a1a2e").text(s.stage);
    svg.append("text").attr("x", 28).attr("y", y + 32).attr("font-size", 11).attr("fill", "#666").call(wrap, W - 120, s.caveat);
    svg.append("text").attr("x", W - 14).attr("y", y + 14).attr("text-anchor", "end").attr("font-size", 11).attr("font-weight", 700).attr("fill", CONF[s.confidence]).text(s.confidence.toUpperCase());
  });
}

// ---------------------------------------------------------------- //
// 13. Scenario landscape: VaR bars + production-share choropleth
// ---------------------------------------------------------------- //
function scenarioLandscape(sel) {
  const s = D.scenario_landscape, W = 760, H = 380;
  const svg = svgIn(sel, W, H);
  // VaR bars (left)
  const order = ["low", "central", "high"], m = { t: 30, l: 55, b: 40 }, bw = 260;
  const x = d3.scaleBand().domain(order).range([m.l, bw]).padding(0.35);
  const y = d3.scaleLinear().domain([0, d3.max(order, (k) => s.scenario_var[k].VaR95) * 1.1]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x)).attr("font-size", 11);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((d) => fmt.usdc(d))).attr("font-size", 9);
  svg.selectAll("rect.v").data(order).join("rect").attr("class", "v").attr("x", (k) => x(k)).attr("width", x.bandwidth())
    .attr("y", (k) => y(s.scenario_var[k].VaR95)).attr("height", (k) => y(0) - y(s.scenario_var[k].VaR95))
    .attr("fill", (k) => k === "central" ? C.risk : C.water);
  svg.append("text").attr("x", m.l).attr("y", 16).attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333").text("VaR95 by scenario");
  // production-share choropleth (right)
  const byUf = new Map(s.production_share.map((r) => [r.uf, r.share_pct]));
  const col = d3.scaleSequential([0, d3.max(s.production_share, (r) => r.share_pct)], d3.interpolateYlOrBr);
  const cpath = d3.geoPath(geoProjection(W - bw - 60, H - 60, UF()));
  svg.append("g").attr("transform", `translate(${bw + 30},0)`).selectAll("path").data(UF().features).join("path")
    .attr("d", cpath)
    .attr("fill", (f) => byUf.has(+f.properties.codarea) ? col(byUf.get(+f.properties.codarea)) : "#eee")
    .attr("stroke", "#fff").attr("stroke-width", 0.4)
    .on("mousemove", (ev, f) => { const v = byUf.get(+f.properties.codarea); if (v != null) TT.show(`soy production share: <b>${v}%</b>`, ev); }).on("mouseout", TT.hide);
  svg.append("text").attr("x", bw + 40).attr("y", 16).attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333").text("Where exposure concentrates (soy share)");
}

// ---------------------------------------------------------------- //
// 14. Provenance ledger (sortable table)
// ---------------------------------------------------------------- //
function provenanceLedger(sel) {
  const host = d3.select(sel); host.selectAll("*").remove();
  // Part A: confidence staircase (answers "how sure are we, step by step?" at a glance).
  const ladder = (D.confidence_ladder && D.confidence_ladder.stages) || [];
  const stair = host.append("div").attr("class", "prov-stair");
  stair.append("div").attr("class", "stair-title").text("How sure are we, step by step?");
  const lvl = { high: 100, medium: 62, low: 32 };
  ladder.forEach((s) => {
    const row = stair.append("div").attr("class", "stair-row");
    row.append("span").attr("class", "stair-name").text(s.stage);
    const track = row.append("span").attr("class", "stair-track");
    track.append("span").attr("class", "stair-fill conf-" + s.confidence)
      .style("width", (lvl[s.confidence] || 50) + "%").text(s.confidence);
    row.append("span").attr("class", "stair-caveat").text(s.caveat);
  });
  // Part B: parameter cards (collapsed to name + value + dot; click to expand source + note).
  const rows = D.provenance_ledger.rows.slice();
  const ctrl = host.append("div").attr("class", "prov-ctrl");
  ctrl.append("span").text("Every number, by confidence: ");
  ["all", "high", "medium-high", "medium", "low"].forEach((c) =>
    ctrl.append("button").attr("class", "prov-btn").text(c).on("click", () => draw(c)));
  const grid = host.append("div").attr("class", "param-grid");
  function draw(filter) {
    const data = filter === "all" ? rows : rows.filter((r) => r.confidence === filter);
    grid.selectAll("*").remove();
    data.forEach((r) => {
      const card = grid.append("div").attr("class", "param-card");
      const hd = card.append("div").attr("class", "pc-head");
      hd.append("span").attr("class", "pc-dot conf-" + r.confidence);
      hd.append("span").attr("class", "pc-name").text(r.quantity);
      card.append("div").attr("class", "pc-val")
        .text((typeof r.value === "number" ? d3.format(",.4g")(r.value) : r.value) + (r.unit ? " " + r.unit : ""));
      const det = card.append("div").attr("class", "pc-detail").style("display", "none");
      det.append("div").attr("class", "pc-src").text(r.source);
      det.append("div").attr("class", "pc-note").text(r.note);
      hd.on("click", function () {
        const open = det.style("display") === "none";
        det.style("display", open ? "block" : "none");
        card.classed("open", open);
      });
    });
  }
  draw("all");
}

// ---------------------------------------------------------------- //
// gate ladder + funder tracks (simple DOM)
// ---------------------------------------------------------------- //
function gateLadder(sel) {
  const host = d3.select(sel); host.selectAll("*").remove();
  D.gate_ladder.gates.forEach((g) => {
    const d = host.append("div").attr("class", "gate-row");
    d.append("span").attr("class", `gate-badge gate-${g.status.toLowerCase()}`).text(g.status);
    d.append("span").attr("class", "gate-name").text(g.gate);
    d.append("span").attr("class", "gate-ev").text(g.evidence);
  });
}

// ---- text wrap helper ----
function wrap(text, width, str) {
  text.each(function () {
    const t = d3.select(this), words = (str || t.text()).split(/\s+/).reverse();
    let word, line = [], lineNo = 0, y = +t.attr("y") || 0, x = +t.attr("x") || 0, dy = 0;
    let tspan = t.text(null).append("tspan").attr("x", x).attr("y", y);
    while ((word = words.pop())) {
      line.push(word); tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width && line.length > 1) {
        line.pop(); tspan.text(line.join(" "));
        line = [word];
        tspan = t.append("tspan").attr("x", x).attr("y", y).attr("dy", ++lineNo * 1.1 + "em").text(word);
      }
    }
  });
}

// ---------------------------------------------------------------- //
// 15. Global corridors map (Feature F)
// ---------------------------------------------------------------- //
function globalCorridors(sel) {
  // A clean table reads better than a low-signal world map (one arc, overlapping labels).
  // The first corridor is validated; the rest are literature-sourced estimates, marked.
  const data = (D.global_corridors) || { corridors: [] };
  const host = d3.select(sel); host.selectAll("*").remove();
  const tbl = host.append("table").attr("class", "corr-table");
  const head = tbl.append("thead").append("tr");
  ["Corridor", "Crop or system", "Who it serves", "Evidence", "Status"].forEach((h) =>
    head.append("th").text(h));
  const body = tbl.append("tbody");
  data.corridors.forEach((c) => {
    const tr = body.append("tr").classed("corr-proven", c.validated);
    tr.append("td").attr("class", "corr-name").attr("title", c.sink_label || "").text(c.name);
    tr.append("td").text(c.crop);
    tr.append("td").text(c.stakeholder || "");
    tr.append("td").attr("class", "corr-cite").text(c.citation || "");
    tr.append("td").html(c.validated
      ? '<span class="corr-badge corr-on">validated</span> <span class="corr-val">$' + c.perha_central + '/ha</span>'
      : '<span class="corr-badge corr-off">research target</span>');
  });
  host.append("p").attr("class", "corr-foot").text(
    "One corridor is validated against 22 years of observed droughts, at $350/ha. The other five "
    + "are research targets from the moisture-recycling literature, each pairing a named teleconnection "
    + "with a traded commodity or a sovereign water system and active deforestation. Their per-hectare "
    + "value is earned by running the same five-stage chain, not asserted.");
}

// ---------------------------------------------------------------- //
// 16. Side-by-side comparison: Fluvion vs incumbents (Feature E)
// ---------------------------------------------------------------- //
function comparisonMode(sel) {
  const data = (D.comparison) || { rows: [] };
  const rows = data.rows;
  const W = 720, H = 280, m = { t: 40, r: 20, b: 50, l: 180 };
  const svg = svgIn(sel, W, H);
  const x = d3.scaleLinear().domain([0, 100]).range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(rows.map(r => r.tool)).range([m.t, H - m.b]).padding(0.25);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y)).attr("font-size", 11);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => d + "%")).attr("font-size", 10);
  svg.append("text").attr("x", W / 2).attr("y", H - 8).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#666")
    .text("Coverage of the moisture-risk cascade (%)");
  rows.forEach((r) => {
    const isF = r.tool === "Fluvion";
    svg.append("rect").attr("x", m.l).attr("y", y(r.tool))
      .attr("width", x(r.coverage_pct) - m.l).attr("height", y.bandwidth())
      .attr("fill", isF ? C.moisture : C.water).attr("opacity", isF ? 1 : 0.5)
      .attr("rx", 3);
    // place the value inside the bar when it runs to the right edge (Fluvion=100%)
    const lx = x(r.coverage_pct), inside = lx > W - m.r - 34;
    svg.append("text").attr("x", inside ? lx - 6 : lx + 6).attr("y", y(r.tool) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", inside ? "end" : "start")
      .attr("font-size", 11).attr("font-weight", isF ? 700 : 400).attr("fill", inside ? "#fff" : "#333")
      .text(r.coverage_pct + "%");
  });
}

// ---------------------------------------------------------------- //
// 17. Scenario timeline (Feature A)
// ---------------------------------------------------------------- //
function scenarioTimeline(sel) {
  const data = (D.scenario_timeline) || { years: [], scenarios: {} };
  const years = data.years;
  const W = 760, H = 320, m = { t: 30, r: 80, b: 45, l: 60 };
  const svg = svgIn(sel, W, H);
  const x = d3.scaleLinear().domain([years[0], years[years.length - 1]]).range([m.l, W - m.r]);
  const allVals = [].concat(...Object.values(data.scenarios).map(s => s.values));
  const y = d3.scaleLinear().domain([0, d3.max(allVals) * 1.1]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat(d3.format("d"))).attr("font-size", 10);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d => "$" + d3.format(".2s")(d))).attr("font-size", 9);
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -H / 2).attr("y", 16)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#555").text("Avoided-loss value ($/ha)");
  const colors = { low: C.water, central: C.moisture, high: C.risk };
  Object.entries(data.scenarios).forEach(([key, s]) => {
    const line = d3.line().x((d, i) => x(years[i])).y(d => y(d));
    svg.append("path").attr("d", line(s.values)).attr("fill", "none")
      .attr("stroke", colors[key] || C.water).attr("stroke-width", 2.5);
    // label at end
    const lastVal = s.values[s.values.length - 1];
    svg.append("text").attr("x", x(years[years.length - 1]) + 6).attr("y", y(lastVal) + 4)
      .attr("font-size", 10).attr("font-weight", 600).attr("fill", colors[key] || C.water).text(s.label);
  });
  // scrubber interaction
  const focus = svg.append("g").style("display", "none");
  focus.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#78909c").attr("stroke-width", 1).attr("stroke-dasharray", "3 3");
  focus.append("text").attr("y", m.t - 4).attr("font-size", 10).attr("text-anchor", "middle").attr("fill", "#333");
  const overlay = svg.append("rect").attr("x", m.l).attr("width", W - m.r - m.l).attr("height", H - m.t - m.b)
    .attr("fill", "none").style("pointer-events", "all");
  overlay.on("mousemove", function (ev) {
    const [mx] = d3.pointer(ev, this);
    const yr = Math.round(x.invert(mx));
    const idx = years.indexOf(yr);
    if (idx < 0) return;
    focus.style("display", null);
    focus.select("line").attr("x1", x(yr)).attr("x2", x(yr));
    const tips = Object.entries(data.scenarios).map(([k, s]) => `${s.label}: $${Math.round(s.values[idx])}/ha`);
    focus.select("text").attr("x", x(yr)).text(yr + " · " + tips.join("  "));
  }).on("mouseout", () => focus.style("display", "none"));
}

// ---------------------------------------------------------------- //
// 18. Forest-condition monitor (Tier 2, DESCRIPTIVE - beside the price, not inside it)
// ---------------------------------------------------------------- //
function forestCondition(sel) {
  const fc = D.forest_condition;
  const box = d3.select(sel);
  if (!fc || !Array.isArray(fc.et_anomaly) || !fc.et_anomaly.length) {
    box.html('<p style="color:#888;font-size:13px;padding:1rem 0">Forest-condition monitor data pending (run the EI loaders + export).</p>');
    return;
  }
  const tnum = (d) => { const [y, m] = d.split("-").map(Number); return y + (m - 1) / 12; };
  // shipped stress layer(s): evaporation only. Greenness (raw MODIS EVI) is deferred on
  // sign-validity (sun-sensor green-up artifact, Morton et al. 2014), so it is NOT plotted.
  const layers = [
    { key: "et_anomaly", label: "Evaporation (TerraClimate aet)", stress: "down = stressed", col: C.water },
  ].filter((L) => Array.isArray(fc[L.key]) && fc[L.key].length);
  const loss = Array.isArray(fc.forest_loss) ? fc.forest_loss : [];
  // P1: ET cross-validation overlay (per-year ASO ensemble across independent paradigms)
  const cv = (fc.et_crossval && fc.et_crossval.ensemble_aso &&
              Object.keys(fc.et_crossval.ensemble_aso).length) ? fc.et_crossval : null;
  const asoX = (yr) => yr + 8.5 / 12;                 // ASO (Aug-Oct) centre ~ mid-September

  const W = 820, H = 430, m = { t: 38, r: 92, b: 28, l: 52 };
  const topH = loss.length ? 250 : 360, gap = 46;
  const svg = svgIn(sel, W, H);

  // x domain across all present anomaly layers (and the ASO ensemble years)
  const allPts = layers.flatMap((L) => fc[L.key].map((d) => tnum(d.date)));
  if (cv) Object.keys(cv.ensemble_aso).forEach((yr) => allPts.push(asoX(+yr)));
  const x = d3.scaleLinear().domain([d3.min(allPts), d3.max(allPts)]).range([m.l, W - m.r]);
  const allA = layers.flatMap((L) => fc[L.key].map((d) => d.anom));
  if (cv) Object.values(cv.ensemble_aso).forEach((e) => allA.push(e.mean - e.spread, e.mean + e.spread));
  if (cv) Object.values(cv.aso_by_year).forEach((o) => Object.values(o).forEach((v) => allA.push(v)));
  const ymax = Math.max(0.2, d3.max(allA.map(Math.abs)) * 1.05);
  const y = d3.scaleLinear().domain([-ymax, ymax]).range([topH, m.t]);

  // axes + zero baseline
  svg.append("g").attr("transform", `translate(0,${topH})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d"))).attr("font-size", 9);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("+.0%"))).attr("font-size", 9);
  svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#bbb").attr("stroke-width", 1);
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -(topH + m.t) / 2).attr("y", 14).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#555").text("Anomaly vs climatology");

  // a line per layer (the monthly TerraClimate evaporation anomaly)
  const line = d3.line().x((d) => x(tnum(d.date))).y((d) => y(d.anom));
  layers.forEach((L, i) => {
    const data = fc[L.key];
    svg.append("path").attr("d", line(data)).attr("fill", "none").attr("stroke", L.col).attr("stroke-width", 1.6).attr("opacity", cv ? 0.5 : 0.9);
    // legend (right gutter)
    const ly = m.t + i * 30;
    svg.append("line").attr("x1", W - m.r + 8).attr("x2", W - m.r + 24).attr("y1", ly).attr("y2", ly).attr("stroke", L.col).attr("stroke-width", 2.5);
    svg.append("text").attr("x", W - m.r + 27).attr("y", ly + 3).attr("font-size", 8.5).attr("fill", "#333").text(L.label);
    svg.append("text").attr("x", W - m.r + 27).attr("y", ly + 13).attr("font-size", 7.5).attr("fill", "#999").text(L.stress);
  });

  // --- P1 cross-validation: ASO ensemble mean line + inter-product spread band + per-paradigm lines ---
  if (cv) {
    const palette = [C.water, "#2e7d32", "#b0853a"];   // water-balance, remote-sensing, reanalysis
    const prodCol = {}; cv.products.forEach((p, k) => (prodCol[p] = palette[k % palette.length]));
    const years = Object.keys(cv.ensemble_aso).map(Number).sort((a, b) => a - b);
    // shaded inter-product spread band (ensemble mean +/- spread)
    const band = d3.area().x((d) => x(asoX(d)))
      .y0((d) => y(cv.ensemble_aso[d].mean - cv.ensemble_aso[d].spread))
      .y1((d) => y(cv.ensemble_aso[d].mean + cv.ensemble_aso[d].spread));
    svg.append("path").attr("d", band(years)).attr("fill", "#90a4ae").attr("opacity", 0.22);
    // faint per-paradigm ASO lines (classed so the legend can isolate one leg on click)
    cv.products.forEach((p, k) => {
      const pts = years.filter((yr) => cv.aso_by_year[yr] && p in cv.aso_by_year[yr])
        .map((yr) => ({ yr, v: cv.aso_by_year[yr][p] }));
      svg.append("path").attr("class", "cv-para cv-para-" + k).attr("d", d3.line().x((d) => x(asoX(d.yr))).y((d) => y(d.v))(pts))
        .attr("fill", "none").attr("stroke", prodCol[p]).attr("stroke-width", 1).attr("opacity", 0.5).attr("stroke-dasharray", "3 2");
    });
    // bold ensemble mean ASO line + dots
    svg.append("path").attr("d", d3.line().x((d) => x(asoX(d))).y((d) => y(cv.ensemble_aso[d].mean))(years))
      .attr("fill", "none").attr("stroke", "#37474f").attr("stroke-width", 2.1).attr("opacity", 0.95);
    svg.selectAll("circle.ens").data(years).enter().append("circle").attr("class", "ens")
      .attr("cx", (d) => x(asoX(d))).attr("cy", (d) => y(cv.ensemble_aso[d].mean)).attr("r", 2.5).attr("fill", "#37474f");
    // verdict note (descriptive, no forecast language; honest about sign vs correlation)
    const vlabel = { robust: "corroborated (sign + correlation)", partly_corroborated: "partly corroborated", weak: "weakly corroborated", divergent: "NOT corroborated (divergent)" }[cv.verdict] || cv.verdict;
    svg.append("text").attr("x", m.l).attr("y", 14).attr("font-size", 9.5).attr("fill", "#37474f").attr("font-weight", 600)
      .text(`Dry-season (ASO) evaporation ${vlabel} by ${cv.products.length} ET paradigms: sign agrees in 2023 and 2024, correlation clears only the mean rule`);
    svg.append("text").attr("x", m.l).attr("y", 25).attr("font-size", 8).attr("fill", "#90a4ae")
      .text("dark line = ensemble mean; band = inter-product spread; dashed = each paradigm (ASO anomaly per year)");
    // ensemble legend (right gutter): each entry isolates that paradigm's line on click, so a
    // reviewer can pull out the weakest (satellite) leg; "ASO ensemble:" resets all.
    const isolate = (k) => svg.selectAll(".cv-para")
      .attr("opacity", function () { return k == null ? 0.5 : (d3.select(this).classed("cv-para-" + k) ? 0.95 : 0.1); });
    let ly0 = m.t + layers.length * 30 + 16;
    svg.append("text").attr("x", W - m.r + 8).attr("y", ly0).attr("font-size", 8).attr("fill", "#37474f")
      .style("cursor", "pointer").text("ASO ensemble:").on("click", () => isolate(null));
    cv.products.forEach((p, k) => {
      const yy = ly0 + 11 + k * 11;
      const g = svg.append("g").style("cursor", "pointer").on("click", () => isolate(k));
      g.append("line").attr("x1", W - m.r + 8).attr("x2", W - m.r + 20).attr("y1", yy - 3).attr("y2", yy - 3).attr("stroke", prodCol[p]).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 2");
      g.append("text").attr("x", W - m.r + 23).attr("y", yy).attr("font-size", 7).attr("fill", "#666").text(p.split(" (")[0]);
    });
    svg.append("text").attr("x", W - m.r + 8).attr("y", ly0 + 11 + cv.products.length * 11 + 5).attr("font-size", 6.5).attr("fill", "#aaa").text("click to isolate a leg");
  }

  // mark the major drought years (context, not a forecast)
  [2005, 2010, 2015, 2023].forEach((yr) => {
    if (yr < x.domain()[0] || yr > x.domain()[1]) return;
    svg.append("line").attr("x1", x(yr)).attr("x2", x(yr)).attr("y1", m.t).attr("y2", topH).attr("stroke", "#cfd8dc").attr("stroke-dasharray", "2 3");
    svg.append("text").attr("x", x(yr)).attr("y", m.t - 3).attr("text-anchor", "middle").attr("font-size", 8).attr("fill", "#aaa").text(yr);
  });

  // bottom panel: cumulative deforestation context (annual; never an anomaly)
  if (loss.length) {
    const b0 = topH + gap, b1 = H - m.b;
    const lx = d3.scaleLinear().domain(d3.extent(loss, (d) => d.year)).range([m.l, W - m.r]);
    const ly = d3.scaleLinear().domain([0, d3.max(loss, (d) => d.cum_loss_ha) * 1.05]).range([b1, b0]);
    svg.append("g").attr("transform", `translate(0,${b1})`).call(d3.axisBottom(lx).ticks(8).tickFormat(d3.format("d"))).attr("font-size", 9);
    svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(ly).ticks(3).tickFormat((d) => d3.format(".2s")(d) + "ha")).attr("font-size", 8);
    const area = d3.area().x((d) => lx(d.year)).y0(b1).y1((d) => ly(d.cum_loss_ha));
    svg.append("path").attr("d", area(loss)).attr("fill", C.firewall).attr("opacity", 0.25);
    svg.append("path").attr("d", d3.line().x((d) => lx(d.year)).y((d) => ly(d.cum_loss_ha))(loss)).attr("fill", "none").attr("stroke", C.firewall).attr("stroke-width", 1.6);
    svg.append("text").attr("x", m.l).attr("y", b0 - 6).attr("font-size", 9).attr("fill", "#607d8b").text("Cumulative forest loss in the source box (Hansen GFC) - context, not an anomaly");
  }

  // greenness-deferred annotation (raw MODIS EVI fails the drought sign check here, Morton 2014)
  svg.append("text").attr("x", W - m.r).attr("y", m.t + layers.length * 30 + 4).attr("text-anchor", "end")
    .attr("font-size", 8).attr("fill", "#b0a050").text("Greenness (MODIS EVI): deferred, see note");

  // honesty footer
  svg.append("text").attr("x", m.l).attr("y", H - 4).attr("font-size", 8.5).attr("fill", "#999")
    .text(`Climatology ${fc.climatology ? fc.climatology.aet : ""}. Describes condition, does not forecast. Greenness (raw EVI) and CSD/resilience layers deferred.`);
}

// ---------------------------------------------------------------- //
// 19. ET cross-validation self-audit (Tier 2, DESCRIPTIVE - beside the price)
//     Three honest views of the same independent-paradigm cross-check. All read
//     D.forest_condition.et_crossval and upgrade automatically from 2 to 3 paradigms.
// ---------------------------------------------------------------- //
function _cv() { return D.forest_condition && D.forest_condition.et_crossval; }
function _short(lbl) { return String(lbl).split(" (")[0]; }
function _cvEmpty(sel, msg) {
  d3.select(sel).html(`<p style="color:#888;font-size:13px;padding:1rem 0">${msg}</p>`);
}

// 19a. The agreement gap: month-to-month vs dry-season (the pre-registration flex)
function etCrossvalScatter(sel) {
  const cv = _cv();
  if (!cv || !cv.scatter || !Object.keys(cv.scatter).length) return _cvEmpty(sel, "ET cross-validation scatter pending (run the loaders + export).");
  const pairKey = Object.keys(cv.scatter)[0];
  const sc = cv.scatter[pairKey];
  const shortA = _short(sc.axis_labels[0]), shortB = _short(sc.axis_labels[1]);
  const mr = (cv.monthly_corr && cv.monthly_corr[pairKey] || {}).pearson;
  const ar = (cv.aso_corr && cv.aso_corr[pairKey] || {}).pearson;
  const W = 820, H = 400, pad = 50, gap = 74, top = 84, ph = 232;
  const pw = (W - 2 * pad - gap) / 2;
  const svg = svgIn(sel, W, H);
  svg.append("text").attr("x", pad).attr("y", 22).attr("font-size", 13).attr("font-weight", 600).attr("fill", "#333")
    .text("Two instruments, two time-scales: where they agree, and where they do not");
  svg.append("text").attr("x", pad).attr("y", 39).attr("font-size", 10).attr("fill", "#777")
    .text(`${shortA} vs ${shortB}. Month to month they barely track; in the dry season (Aug to Oct), where the drought signal lives, they line up.`);
  svg.append("text").attr("x", pad).attr("y", 52).attr("font-size", 10).attr("fill", "#777")
    .text("We pre-committed to the dry-season window, and report the weaker month-to-month number anyway.");
  function panel(x0, title, pts, rval, isAso) {
    let xs, ys;
    if (isAso) {
      const mx = Math.max(0.1, d3.max(pts, (p) => Math.abs(p[0])) * 1.12, d3.max(pts, (p) => Math.abs(p[1])) * 1.12);
      xs = d3.scaleLinear().domain([-mx, mx]).range([x0, x0 + pw]);
      ys = d3.scaleLinear().domain([-mx, mx]).range([top + ph, top]);
    } else {
      xs = d3.scaleLinear().domain([-2.4, 2.4]).range([x0, x0 + pw]);
      ys = d3.scaleLinear().domain([-2.4, 2.4]).range([top + ph, top]);
    }
    svg.append("text").attr("x", x0 + pw / 2).attr("y", top - 10).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 600).attr("fill", "#555").text(title);
    svg.append("line").attr("x1", x0).attr("x2", x0 + pw).attr("y1", ys(0)).attr("y2", ys(0)).attr("stroke", "#e0e0e0");
    svg.append("line").attr("x1", xs(0)).attr("x2", xs(0)).attr("y1", top).attr("y2", top + ph).attr("stroke", "#e0e0e0");
    const d0 = xs.domain()[0], d1 = xs.domain()[1];
    svg.append("line").attr("x1", xs(d0)).attr("y1", ys(d0)).attr("x2", xs(d1)).attr("y2", ys(d1)).attr("stroke", "#c5cae9").attr("stroke-dasharray", "3 3");
    svg.append("text").attr("x", x0 + pw).attr("y", ys(0) - 4).attr("text-anchor", "end").attr("font-size", 8).attr("fill", "#aaa").text(shortA + " →");
    svg.append("text").attr("transform", `translate(${xs(0) - 5},${top + 12}) rotate(-90)`).attr("text-anchor", "end").attr("font-size", 8).attr("fill", "#aaa").text(shortB + " →");
    pts.forEach((p) => {
      const dro = isAso && (p[2] === 2023 || p[2] === 2024);
      svg.append("circle").attr("cx", xs(p[0])).attr("cy", ys(p[1]))
        .attr("r", isAso ? (dro ? 4.5 : 3) : 1.7)
        .attr("fill", dro ? C.riskDeep : (isAso ? C.water : "#90a4ae"))
        .attr("opacity", isAso ? 0.92 : 0.32)
        .attr("stroke", dro ? "#fff" : "none").attr("stroke-width", dro ? 0.9 : 0);
      if (dro) svg.append("text").attr("x", xs(p[0]) + 7).attr("y", ys(p[1]) + 3).attr("font-size", 8.5).attr("font-weight", 600).attr("fill", C.riskDeep).text(p[2]);
    });
    svg.append("text").attr("x", x0 + 6).attr("y", top + 14).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#444").text("r = " + (rval == null ? "n/a" : d3.format(".2f")(rval)));
    svg.append("text").attr("x", x0 + 6).attr("y", top + 27).attr("font-size", 8).attr("fill", "#999").text("n = " + pts.length);
  }
  panel(pad, "Every month (standardized)", sc.monthly, mr, false);
  panel(pad + pw + gap, "Dry season only, per year", sc.aso, ar, true);
  svg.append("text").attr("x", pad).attr("y", H - 6).attr("font-size", 8.5).attr("fill", "#999")
    .text("Standardized anomalies; the dashed diagonal is perfect agreement. An agreement statistic over a small sample, not a probability. Beside the price, descriptive.");
}

// 19b. The robustness check, decomposed: PASS on sign, NARROW MISS on correlation
function etRobustGauge(sel) {
  const cv = _cv();
  if (!cv || !cv.robustness_rules) return _cvEmpty(sel, "Robustness decomposition pending.");
  const rr = cv.robustness_rules, sc = cv.sign_corroboration || {};
  const by = rr.by_rule || {}, clr = rr.clears_0p50 || {}, f2 = d3.format(".2f");
  const vlabel = { robust: "corroborated (sign + correlation)", partly_corroborated: "partly corroborated",
                   weak: "weakly corroborated", divergent: "not corroborated" }[cv.verdict] || cv.verdict;
  const chipCol = cv.verdict === "robust" ? C.success : (cv.verdict === "divergent" ? C.danger : C.warn);
  const W = 820, H = 270, pad = 50;
  const svg = svgIn(sel, W, H);
  svg.append("text").attr("x", pad).attr("y", 22).attr("font-size", 13).attr("font-weight", 600).attr("fill", "#333")
    .text("Sign agreement holds. The correlation clears 0.50 only on the mean.");
  svg.append("text").attr("x", pad).attr("y", 39).attr("font-size", 10).attr("fill", "#777")
    .text("We fixed the rule and the 0.50 line before we saw the answer, and we report the correlation under every rule.");
  // Row 1: sign agreement (the strong, leakage-free result)
  const signPass = !!sc.all_negative_2023_2024;
  const y1 = 74;
  svg.append("circle").attr("cx", pad + 11).attr("cy", y1).attr("r", 10).attr("fill", signPass ? C.success : C.danger);
  svg.append("text").attr("x", pad + 11).attr("y", y1 + 4).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 700).attr("fill", "#fff").text(signPass ? "✓" : "✗");
  svg.append("text").attr("x", pad + 31).attr("y", y1 - 2).attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333").text("Direction agrees in both 2023 and 2024, all three paradigms");
  svg.append("text").attr("x", pad + 31).attr("y", y1 + 13).attr("font-size", 9.5).attr("fill", "#777").text(signPass ? "PASS  the strong, leakage-free result: the independent satellite agrees too" : "did not hold");
  // Row 2: the correlation under each pre-stated rule, on the same 0..1 line
  const y2 = 150;
  svg.append("text").attr("x", pad + 31).attr("y", y2 - 33).attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333").text("Correlation under each pre-stated rule");
  const lx0 = pad + 31, lx1 = W - pad - 120, nx = d3.scaleLinear().domain([0, 1]).range([lx0, lx1]);
  svg.append("line").attr("x1", lx0).attr("x2", lx1).attr("y1", y2).attr("y2", y2).attr("stroke", "#cfd8dc").attr("stroke-width", 3);
  svg.append("line").attr("x1", nx(0.5)).attr("x2", nx(0.5)).attr("y1", y2 - 16).attr("y2", y2 + 16).attr("stroke", "#455a64").attr("stroke-width", 2);
  svg.append("text").attr("x", nx(0.5)).attr("y", y2 - 20).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-weight", 600).attr("fill", "#455a64").text("robust line 0.50, fixed in advance");
  // one dot per rule, colored by whether it clears 0.50
  [["mean", by.mean], ["median", by.median], ["all_pairs_min", by.all_pairs_min], ["holdout_ex_2023_2024", by.holdout_ex_2023_2024]].forEach(([k, v]) => {
    if (v == null) return;
    svg.append("circle").attr("cx", nx(v)).attr("cy", y2).attr("r", 5).attr("fill", clr[k] ? C.success : C.warn).attr("stroke", "#fff").attr("stroke-width", 1.3);
  });
  // label only the mean (the one that clears) so the failing cluster stays readable
  if (by.mean != null) svg.append("text").attr("x", nx(by.mean)).attr("y", y2 - 10).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-weight", 700).attr("fill", C.success).text("mean " + f2(by.mean));
  svg.append("text").attr("x", lx1 + 10).attr("y", y2 + 4).attr("font-size", 9.5).attr("font-weight", 700).attr("fill", C.warn).text("MEAN ONLY");
  svg.append("text").attr("x", lx0).attr("y", y2 + 46).attr("font-size", 8.5).attr("fill", "#90a4ae")
    .text(`Mean ${f2(by.mean)} clears; median ${f2(by.median)}, weakest pair ${f2(by.all_pairs_min)}, holdout excluding 2023/24 ${f2(by.holdout_ex_2023_2024)} do not. The mean is carried by the two co-forced model legs, so: partly corroborated, not robust.`);
  // verdict chip
  svg.append("rect").attr("x", W - pad - 178).attr("y", 8).attr("width", 178).attr("height", 22).attr("rx", 11).attr("fill", "#eceff1").attr("stroke", chipCol);
  svg.append("text").attr("x", W - pad - 89).attr("y", 23).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 700).attr("fill", "#455a64").text("verdict: " + vlabel);
}

// 19c. The western-box fingerprint + the 2021/22 history bridge
function etDroughtFingerprint(sel) {
  const cv = _cv();
  if (!cv || !cv.ensemble_aso) return _cvEmpty(sel, "Drought fingerprint pending.");
  const dyears = (cv.drought_agreement && cv.drought_agreement.years) || [2005, 2010, 2015, 2016, 2023, 2024];
  const pre = cv.pre_2023_decline || {};
  const years = [...new Set([...Object.keys(pre).map(Number), ...dyears])].sort((a, b) => a - b);
  const val = (y) => (cv.ensemble_aso[y] || {}).mean;
  const spr = (y) => (cv.ensemble_aso[y] || {}).spread || 0;
  const W = 820, H = 320, m = { t: 64, r: 30, b: 38, l: 54 };
  const svg = svgIn(sel, W, H);
  svg.append("text").attr("x", m.l).attr("y", 22).attr("font-size", 13).attr("font-weight", 600).attr("fill", "#333").text("A western-box fingerprint: it tracks the droughts that reach it");
  svg.append("text").attr("x", m.l).attr("y", 40).attr("font-size", 10).attr("fill", "#777").text("The 2015-16 El Nino stressed the eastern and southern Amazon and barely moved this western box; the 2023-24 basin-wide drought stressed it hard.");
  const x = d3.scaleBand().domain(years.map(String)).range([m.l, W - m.r]).padding(0.38);
  const allv = years.map(val).filter((v) => v != null);
  const ymin = Math.min(-0.05, d3.min(allv) * 1.18), ymax = Math.max(0.06, d3.max(allv) + 0.03);
  const y = d3.scaleLinear().domain([ymin, ymax]).range([H - m.b, m.t]);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("+.0%"))).attr("font-size", 9);
  svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#bbb");
  years.forEach((yr) => {
    const v = val(yr); if (v == null) return;
    const isPre = String(yr) in pre, deep = v <= -0.12;
    const col = isPre ? "#b0bec5" : (deep ? C.riskDeep : (v < 0 ? C.risk : C.firewall));
    const bx = x(String(yr)), bw = x.bandwidth();
    svg.append("rect").attr("x", bx).attr("y", Math.min(y(0), y(v))).attr("width", bw).attr("height", Math.abs(y(v) - y(0))).attr("fill", col).attr("opacity", isPre ? 0.5 : 0.92).attr("rx", 2);
    const s = spr(yr);
    if (s > 0) svg.append("line").attr("x1", bx + bw / 2).attr("x2", bx + bw / 2).attr("y1", y(v - s)).attr("y2", y(v + s)).attr("stroke", "#37474f").attr("stroke-width", 1).attr("opacity", 0.7);
    svg.append("text").attr("x", bx + bw / 2).attr("y", v < 0 ? y(v) + 13 : y(v) - 5).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-weight", 600).attr("fill", v < 0 && !isPre ? "#fff" : "#666").text(d3.format("+.0%")(v));
    svg.append("text").attr("x", bx + bw / 2).attr("y", H - m.b + 14).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", isPre ? "#90a4ae" : "#555").attr("font-weight", isPre ? 400 : 600).text(yr);
  });
  if (Object.keys(pre).length) {
    svg.append("text").attr("x", m.l).attr("y", H - 4).attr("font-size", 8.5).attr("fill", "#90a4ae")
      .text("Lighter bars (2021 to 2022): the box was already drifting down in the years of the priced 2021/22 history backtest. A co-occurrence shown beside the price, not a forecast of it.");
  }
}

// ---------------------------------------------------------------- //
// 20. Corridor Risk Object (CRO) - the machine-readable artifact.
//     Pure projection of bundle JSON: CRO, claim registry, Gate F, and baseline receipt.
// ---------------------------------------------------------------- //
function croPanel(sel) {
  const cro = D.corridor_risk_object || {};
  const reg = D.claim_registry || {};
  const gf = D.gate_f || {};
  const base = D.baseline_comparison || {};
  const out = cro.outputs || {};
  const cross = cro.cross_checks || {};
  const p = out.asset_per_ha_usd_p5_p50_p95 || [];
  const scenarios = cro.scenarios || {};
  const gates = cro.validation_gates || [];
  const allowed = (reg.claims || []).filter((c) => c.permission === "allowed" || c.permission === "allowed_with_caveat");
  const forbidden = (reg.claims || []).filter((c) => c.permission === "forbidden" || c.permission === "gated");
  const sig = (cro.signature || "sha256:missing").replace("sha256:", "");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const money = (v) => v == null ? "n/a" : fmt.usd(v);
  const moneyShort = (v) => v == null ? "n/a" : fmt.usdc(v);
  const modeLabel = (s) => esc(String(s || "").replace(/_/g, " "));
  const margin = (name) => ((base.margins || {})[name]);
  const statusClass = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const statusText = cro.status && cro.status.complete ? "complete" : "incomplete";
  const reportLabel = (c) => {
    const safe = {
      true_forecast_not_allowed: "Lead-time predictive loss estimate.",
      early_warning_not_allowed: "Forward alert or signal label.",
      price_forest_condition_not_allowed: "Pricing forest-condition anomalies into value.",
      portfolio_ready_exposure_not_allowed: "Portfolio-ready UK exposure.",
      prudential_grade_not_allowed: "Prudential or regulatory-capital framing.",
    };
    return safe[c.id] || c.statement;
  };

  const gateRows = gates.map((g) =>
    `<div class="cro-gate-row cro-status-${statusClass(g.status)}">` +
      `<span>${esc(g.gate)}</span><b>${esc(g.status)}</b>` +
    "</div>").join("");
  const allowRows = allowed.map((c) => `<li><b>${modeLabel(c.mode)}</b>: ${esc(c.statement)}</li>`).join("");
  const forbidRows = forbidden.map((c) => `<li><b>${modeLabel(c.mode)}</b>: ${esc(reportLabel(c))}</li>`).join("");
  const metricCards = [
    ["Value", money(p[1]) + "/ha", `P5-P95 ${money(p[0])} to ${money(p[2])}`],
    ["Scenario range", `${money((scenarios.low || {}).per_ha_usd_p50)} to ${money((scenarios.high || {}).per_ha_usd_p50)}`, "low to high f_loss stress"],
    ["Epistemic VaR/ES", `${moneyShort(out.VaR95)} / ${moneyShort(out.ES95)}`, "UK book, s_uk-gated"],
    ["Signature", sig.slice(0, 16) + "...", statusText + ", sha256 content hash"],
  ].map((r) => `<div class="cro-metric"><span>${r[0]}</span><b>${r[1]}</b><em>${r[2]}</em></div>`).join("");

  const root = d3.select(sel).html(
    `<div class="cro-live">
      <div class="cro-header">
        <div>
          <span class="cro-eyebrow">fluvion.cro/1 · ${esc(cro.corridor_name || "corridor")}</span>
          <h4>One result, two consumers, one receipt.</h4>
          <p>The report, the calculator, and the agent payload read the same committed JSON. The browser projects the object below. It does not recompute the engine.</p>
        </div>
        <div class="cro-chip">Gate F ${esc(gf.status || "UNKNOWN")} · forecast_claim_allowed=${gf.forecast_claim_allowed === true}</div>
      </div>
      <div class="cro-metrics">${metricCards}</div>
      <div class="cro-panels">
        <div class="cro-card">
          <h5>Validation gates</h5>
          <div class="cro-gates">${gateRows}</div>
          <p class="cro-note">Gate F is intentionally fail-closed: no lead-time claim ships until the test is run and passes.</p>
        </div>
        <div class="cro-card">
          <h5>Machine-readable claim gate</h5>
          <div class="claim-cols">
            <div><b>May say</b><ul>${allowRows}</ul></div>
            <div><b>May not say yet</b><ul>${forbidRows}</ul></div>
          </div>
        </div>
      </div>
      <div class="cro-panels cro-panels-bottom">
        <div class="cro-card">
          <h5>Like-for-like checks</h5>
          <table class="cro-table"><tbody>
            <tr><td>NPV value</td><td>${money(p[1])}/ha vs land ${money(cross.land_price_usd_ha)}/ha</td></tr>
            <tr><td>Annual flow</td><td>${money(cross.engine_annual_equiv_usd_ha_yr)}/ha/yr vs Baker ${money(cross.baker_annual_usd_ha_yr)}/ha/yr</td></tr>
            <tr><td>Basis</td><td>${esc(cross.like_for_like_note || "NPV vs NPV, annual vs annual")}</td></tr>
          </tbody></table>
        </div>
        <div class="cro-card">
          <h5>Baseline receipt</h5>
          <div class="baseline-mini"></div>
          <p class="cro-note">Pooled n=${esc(base.n || "n/a")}. The model beats persistence clearly, beats climatology only modestly in MSE, and remains a sign/rank engine rather than a magnitude engine.</p>
        </div>
      </div>
    </div>`
  );

  const bars = [
    ["r over null", margin("pearson_r_over_zero_skill"), C.moisture],
    ["sign over coin", margin("sign_match_over_coin_flip"), C.water],
    ["MSE vs climatology", margin("mse_skill_vs_climatology"), C.warn],
    ["MSE vs persistence", margin("mse_skill_vs_persistence"), C.success],
  ].filter((d) => d[1] != null && Number.isFinite(+d[1]));
  const W = 520, H = 150, m = { l: 132, r: 28, t: 14, b: 24 };
  const svg = root.select(".baseline-mini").append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%").style("height", "auto");
  if (bars.length) {
    const x = d3.scaleLinear().domain([0, Math.max(0.5, d3.max(bars, (d) => +d[1]) * 1.1)]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(bars.map((d) => d[0])).range([m.t, H - m.b]).padding(0.32);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 4).attr("y2", H - m.b + 4).attr("stroke", "#ccd6d9");
    bars.forEach((d) => {
      svg.append("text").attr("x", m.l - 8).attr("y", y(d[0]) + y.bandwidth() / 2 + 4)
        .attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", "#556").text(d[0]);
      svg.append("rect").attr("x", x(0)).attr("y", y(d[0])).attr("width", Math.max(1, x(+d[1]) - x(0)))
        .attr("height", y.bandwidth()).attr("rx", 4).attr("fill", d[2]).attr("opacity", 0.88);
      svg.append("text").attr("x", x(+d[1]) + 6).attr("y", y(d[0]) + y.bandwidth() / 2 + 4)
        .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", "#334")
        .text(d[0].startsWith("MSE") ? d3.format("+.1%")(d[1]) : d3.format("+.3f")(d[1]));
    });
    svg.append("text").attr("x", m.l).attr("y", H - 5).attr("font-size", 9.5).attr("fill", "#7a8590")
      .text("All bars are improvements over stated baselines. Rainfall is concurrent, not a lead-time prediction.");
  } else {
    svg.append("text").attr("x", 12).attr("y", 32).attr("font-size", 12).attr("fill", "#b0853a")
      .text("Baseline comparison missing from the bundle.");
  }
}

// 21. Signal-maturity matrix - the honest staging of each condition signal (descriptive)
function signalMaturity(sel) {
  const cv = _cv();
  const fc = D.forest_condition || {};
  const evapVerdict = cv ? cv.verdict.replace(/_/g, " ") : "shipped";
  const rows = [
    ["Evaporation (ET anomaly)", "shipped", "3 ET paradigms (water-balance, satellite, reanalysis)",
     `cross-checked: ${evapVerdict}. Promotion to robust needs the independent satellite pair and a leakage-free holdout to clear 0.50.`],
    ["Deforestation (forest loss)", "shipped (context)", "single source (Hansen GFC)",
     "a context line, never a stress anomaly; not coupled to the price."],
    ["Greenness (vegetation index)", "deferred", "raw MODIS EVI fails the sign check",
     "the dry-season green-up artifact (Morton 2014) moves it the wrong way; promotion needs a geometry-corrected VI (MAIAC EVI / NIRv) that signs correctly under drought."],
    ["Resilience (critical slowing down)", "deferred", "not characterized",
     "promotion needs a measured false-alarm rate (surrogate null test, detrend and window sensitivity) before it can ship."],
    ["Early warning (season-ahead)", "research (Tier 3, gated)", "not earned",
     "the words forecast and early warning are reserved until a published hindcast beats the simple baselines at a stated lead time."],
  ];
  const statusColor = (s) => s.startsWith("shipped") ? "#2e7d32" : (s.startsWith("deferred") ? "#b0853a" : "#90a4ae");
  let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.4">' +
    '<thead><tr style="text-align:left;color:#555;border-bottom:1.5px solid #ddd">' +
    '<th style="padding:6px 8px">Signal</th><th style="padding:6px 8px">Status</th>' +
    '<th style="padding:6px 8px">Independence cross-check</th><th style="padding:6px 8px">Gate to promote</th></tr></thead><tbody>';
  rows.forEach((r) => {
    html += '<tr style="border-bottom:1px solid #eee;vertical-align:top">' +
      `<td style="padding:6px 8px;font-weight:600;color:#333">${r[0]}</td>` +
      `<td style="padding:6px 8px;font-weight:600;color:${statusColor(r[1])}">${r[1]}</td>` +
      `<td style="padding:6px 8px;color:#555">${r[2]}</td>` +
      `<td style="padding:6px 8px;color:#777">${r[3]}</td></tr>`;
  });
  html += "</tbody></table>";
  d3.select(sel).html(html);
}
