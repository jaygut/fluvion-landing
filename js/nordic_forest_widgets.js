(function () {
  "use strict";
  const D = window.__NORDIC_PUBLIC__;
  const api = window.__NORDIC_WIDGETS = {
    ready: false, errors: [], wamYear: 2023, hydroYear: 2018,
    hydroMetric: "precipitation", conditionTab: "satellite", scaleLens: "asset"
  };
  if (!D) { api.errors.push("missing public contract"); return; }
  const $ = s => document.querySelector(s);
  const fmt = (v, digits = 0) => Number(v).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pct = (v, digits = 1) => `${fmt(v * 100, digits)}%`;
  const shortHash = h => h.replace("sha256:", "").slice(0, 12);

  function buttons(root, items, selected, onSelect, mode = "pressed") {
    root.innerHTML = "";
    items.forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      b.dataset.value = item.value;
      if (mode === "selected") { b.role = "tab"; b.setAttribute("aria-selected", item.value === selected); }
      else b.setAttribute("aria-pressed", item.value === selected);
      b.addEventListener("click", () => onSelect(item.value));
      root.appendChild(b);
    });
  }

  $("#hero-proof").textContent = `Public reference · ${fmt(D.asset.area_ha, 0)} ha · ${Object.keys(D.moisture.shares_by_year).length} tracked climate years · satellite + tower evidence · signed evidence object`;
  $("#snapshot-id").textContent = shortHash(D.generated_from.canonical_signature);
  $("#asset-area-head").textContent = fmt(D.asset.area_ha, 0);

  const layers = [
    ["01", "Location", "INCUMBENT CORE"], ["02", "Local hazards", "INCUMBENT CORE"],
    ["03", "Asset sensitivity", "INCUMBENT CORE"], ["04", "Financial translation", "INCUMBENT CORE"],
    ["+", "Atmospheric source dependency and evidence status", "FLUVION LAYER"]
  ];
  $("#layer-stack").innerHTML = layers.map((r, i) => `<div class="layer-row ${i === 4 ? "added" : ""}"><span class="layer-index">${r[0]}</span><span class="layer-label">${r[1]}</span><span class="layer-owner">${r[2]}</span></div>`).join("");

  const assetViews = {
    identity: [
      ["Asset", D.asset.name], ["Kind", D.asset.kind.replaceAll("_", " ")],
      ["Public status", "Research landscape with a public boundary"]
    ],
    geometry: [
      ["Evidence class", D.asset.geometry_evidence_class], ["Geodesic area", `${fmt(D.asset.area_ha, 2)} ha`],
      ["Official stated area", `${fmt(D.asset.official_stated_area_ha)} ha`],
      ["Geometry hash", D.asset.geometry_sha256], ["Source hash", D.asset.source_geometry_sha256]
    ],
    rights: [
      ["Evidence source", "Official public research-catchment GIS"],
      ["Evidence scope", "Reference identity and boundary"],
      ["Outside scope", D.asset.cannot_support.join("; ")]
    ]
  };
  function renderAsset(view) {
    buttons($("#asset-tabs"), [
      {value:"identity",label:"IDENTITY"},{value:"geometry",label:"GEOMETRY"},{value:"rights",label:"RIGHTS BASIS"}
    ], view, renderAsset, "selected");
    $("#asset-evidence").innerHTML = `<dl>${assetViews[view].map(([k,v]) => `<div class="evidence-kv"><dt>${k}</dt><dd class="${k.includes("hash") ? "hash" : ""}">${v}</dd></div>`).join("")}</dl>`;
  }
  renderAsset("identity");

  function renderForest(view) {
    buttons($("#forest-toggle"), [{value:"nmd",label:"NMD PRIMARY"},{value:"worldcover",label:"WORLDCOVER CHECK"}], view, renderForest);
    const rows = [
      ["Productive", D.forest.productive_ha], ["Nonproductive", D.forest.nonproductive_ha],
      ["Other mapped", D.forest.other_ha], ["Unclassified", D.forest.unknown_ha]
    ];
    $("#forest-bars").innerHTML = rows.map(([name,value]) => `<div class="forest-bar"><label>${name}</label><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, value / D.asset.area_ha * 100)}%"></div></div><span class="bar-value">${fmt(value, 2)} ha</span></div>`).join("");
    $("#forest-readout").textContent = view === "nmd"
      ? `Native NMD classes. Raster edge sensitivity is ${fmt(D.forest.edge_sensitivity_ha, 2)} ha. Unclassified area is reported explicitly as zero.`
      : `Independent forest-presence cross-check. The NMD and WorldCover mapping difference is ${pct(D.forest.disagreement_fraction)}. WorldCover corroborates forest presence; Swedish productivity classes come from NMD.`;
  }
  renderForest("nmd");

  function renderScale(view) {
    api.scaleLens = view;
    buttons($("#scale-toggle"), [{value:"asset",label:"ASSET"},{value:"support",label:"ATMOSPHERIC SUPPORT"}], view, renderScale);
    $("#support-ratio").innerHTML = view === "asset"
      ? `${fmt(D.asset.area_ha, 0)} ha<small>exact G1 public-reference geometry</small>`
      : `${fmt(D.asset.support_to_asset_area_ratio, 1)}×<small>regional atmospheric support shown at native scale</small>`;
    window.__NORDIC_STAGE?.setScale?.(view);
  }
  renderScale("asset");

  const colors = {oceanic:"#2bd4c4",other_terrestrial:"#f2a24e",sweden:"#3ad6a3",finland:"#78a7c5",baltics:"#ad8bd7",residual_outside_domain:"#536773"};
  const labels = {oceanic:"Oceanic",other_terrestrial:"Other terrestrial",sweden:"Sweden",finland:"Finland",baltics:"Baltics",residual_outside_domain:"Remaining balance"};
  function renderWam(year) {
    api.wamYear = Number(year);
    buttons($("#wam-years"), Object.keys(D.moisture.shares_by_year).map(y => ({value:y,label:y})), String(year), renderWam);
    const shares = D.moisture.shares_by_year[String(year)];
    const order = ["oceanic","other_terrestrial","sweden","finland","baltics","residual_outside_domain"];
    $("#wam-composition").innerHTML = `<div class="composition-bar" role="img" aria-label="Atmospheric source composition for ${year}">${order.map(k => `<div class="composition-segment ${k}" style="width:${shares[k]*100}%" title="${labels[k]} ${pct(shares[k])}"></div>`).join("")}</div><div class="composition-legend">${order.map(k => `<div class="composition-key"><span><i style="--key:${colors[k]}"></i>${labels[k]}</span><b>${pct(shares[k])}</b></div>`).join("")}</div>`;
    $("#wam-readout").textContent = `${pct(1 - shares.residual_outside_domain)} named source mix · ${pct(shares.residual_outside_domain)} remaining balance · research-stage confidence`;
    const qa = D.moisture.qa_by_year[String(year)];
    $("#wam-qa").textContent = `The moisture budget closes numerically across the tracked period. Closure error ${qa.closure_relative_error.toExponential(2)} · maximum daily residual ${qa.max_daily_relative_residual.toExponential(2)} · boundary-screen share ${pct(qa.outer_two_cell_flow_fraction,2)} · largest corrected-grid share ${pct(qa.max_corrected_grid_fraction)}. These figures describe numerical stability. Independent accuracy validation remains a future evidence step.`;
    window.__NORDIC_ATMO?.setYear?.(Number(year));
    window.__NORDIC_STAGE?.setFlowYear?.(Number(year));
  }
  $("#residual-definition").textContent = "The remaining balance records tagged precipitation beyond the named source classes. It includes domain and numerical losses, ending atmospheric storage, gains, and signed closure error.";
  renderWam(2023);

  const hydroRows = Object.fromEntries(D.hydroclimate.annual_series.map(r => [String(r.year), r]));
  function renderHydro() {
    buttons($("#hydro-metric"), [{value:"precipitation",label:"PRECIPITATION"},{value:"temperature",label:"TEMPERATURE"}], api.hydroMetric, v => { api.hydroMetric=v; renderHydro(); window.__NORDIC_STAGE?.setHydroMetric?.(v); });
    buttons($("#hydro-years"), [2018,2019,2023].map(y => ({value:String(y),label:String(y)})), String(api.hydroYear), v => { api.hydroYear=Number(v); renderHydro(); });
    const e = D.hydroclimate.selected[String(api.hydroYear)], row = hydroRows[String(api.hydroYear)];
    const cards = [
      ["Precipitation", `${fmt(e.precipitation_mm, 1)} mm`], ["Precip anomaly", `${e.precipitation_anomaly_mm > 0 ? "+" : ""}${fmt(e.precipitation_anomaly_mm, 1)} mm`],
      ["Percentile", `${fmt(e.precipitation_percentile)}th`], ["Temperature", `${fmt(e.temperature_mean_degC, 1)} °C`],
      ["Temp anomaly", `${e.temperature_anomaly_degC > 0 ? "+" : ""}${fmt(e.temperature_anomaly_degC, 1)} °C`], ["Max dry spell", `${fmt(row.dry_spell_days)} days`]
    ];
    $("#hydro-readout").innerHTML = cards.map(([k,v]) => `<div class="metric-card"><b>${v}</b><span>${k}</span></div>`).join("");
  }
  renderHydro();

  function renderCondition(tab) {
    api.conditionTab = tab;
    buttons($("#condition-tabs"), [{value:"satellite",label:"SATELLITE"},{value:"tower",label:"TOWER CONTEXT"}], tab, renderCondition);
    if (tab === "tower") {
      const t = D.condition.icos;
      $("#condition-view").innerHTML = `<div class="tower-strip"><strong>TOWER FOOTPRINT<br>${t.station}</strong><p>${t.spatial_basis}. ${t.temporal_basis}. Kept separate from asset-wide condition evidence and used only for contextual interpretation.</p></div>`;
      return;
    }
    const c = D.condition.comparisons;
    const row = (key) => {
      const v=c[key], left=50 + Math.max(-40,Math.min(40,v.event_minus_control*1000));
      return `<div class="condition-row"><span class="condition-label">${key.toUpperCase()}</span><div class="condition-axis" aria-label="${key} event minus control ${v.event_minus_control.toFixed(4)}"><i class="condition-delta ${v.sign_valid ? "" : "contradicts"}" style="left:${left}%"></i></div><span class="condition-value">${v.event_minus_control > 0 ? "+" : ""}${v.event_minus_control.toFixed(4)}</span></div>`;
    };
    const intervals = [2018,2019,2023].map(y => {
      const v=D.condition.years[String(y)];
      return `<b>${y}</b><span>NDMI ${v.ndmi.value.toFixed(3)} [${v.ndmi.interval.p05.toFixed(3)}, ${v.ndmi.interval.p95.toFixed(3)}]</span><span>NDVI ${v.ndvi.value.toFixed(3)} [${v.ndvi.interval.p05.toFixed(3)}, ${v.ndvi.interval.p95.toFixed(3)}]</span>`;
    }).join("");
    $("#condition-view").innerHTML = `<div class="condition-chart">${row("ndmi")}${row("ndvi")}</div><div class="audit-readout">${fmt(D.condition.effective_n_blocks)} spatial blocks · ${D.condition.years["2018"].n_scenes} scenes per year · seeded hierarchical scene and spatial-block bootstrap</div><div class="interval-table"><b>YEAR</b><b>NDMI VALUE [P05, P95]</b><b>NDVI VALUE [P05, P95]</b>${intervals}</div><div class="confounders">Interpretation accounts for scene dependence, BRDF and sun angle, phenology, management, and residual cloud effects. Causal response remains in evidence development.</div>`;
  }
  renderCondition("satellite");

  const modules = [
    ["asset","Asset","PUBLIC REFERENCE"],["exposure","Forest","MEDIUM CONFIDENCE"],["moisture","Atmosphere","RESEARCH STAGE"],
    ["hydroclimate","Climate","MEDIUM CONFIDENCE"],["condition","Condition","DESCRIPTIVE"]
  ];
  const provenance = {
    asset: `Official public research-catchment GIS · ${fmt(D.asset.area_ha,2)} ha · G1 research reference geometry · commercial deployment uses authorized owner-provided evidence.`,
    exposure: `NMD2018 native 10 m productivity classes · medium confidence · independent map difference ${pct(D.forest.disagreement_fraction)} · protected-area screening requires a verified public endpoint before inclusion.`,
    moisture: `${D.moisture.basis} · May to September · research-stage confidence · four-cell support retained at native atmospheric scale.`,
    hydroclimate: `SMHI PTHBV 4 km analysis · May to September · 1991 to 2020 baseline · modelled spatial analysis · station observations remain a separate evidence class.`,
    condition: `Sentinel-2 peak-canopy indicators · ${fmt(D.condition.effective_n_blocks)} spatial blocks · descriptive evidence · causal interpretation remains in evidence development.`
  };
  const gateDisplay = {
    "Gate 0": ["Foundation", "COMPLETE", ""],
    "Gate A": ["Public identity", "PUBLIC REFERENCE", ""],
    "Gate B": ["Forest exposure", "MAPPED + CHECKED", ""],
    "Gate C": ["Atmospheric mix", "RESEARCH STAGE", ""],
    "Gate D": ["Condition evidence", "DESCRIPTIVE", ""],
    "Gate E": ["Causal response", "NEXT EVIDENCE STAGE", "next"],
    "Gate P": ["Public release", "VERIFIED", ""]
  };
  const gateCards = D.gates.map(g => {
    const [label, status, cls] = gateDisplay[g.gate];
    return `<div class="gate" data-canonical-status="${g.status}"><b>${label}</b><span class="${cls}">${status}</span></div>`;
  }).join("");
  $("#risk-object").innerHTML = `<div class="object-head"><span class="object-title">FOREST ASSET RISK OBJECT · PUBLIC REFERENCE</span><button class="object-sig" type="button" title="${D.generated_from.canonical_signature}">${shortHash(D.generated_from.canonical_signature)}</button></div><div class="object-modules">${modules.map(m => `<button class="object-module" type="button" data-module="${m[0]}"><b>${m[1]}</b><span>${m[2]}</span></button>`).join("")}</div><div class="gate-grid">${gateCards}</div><div class="object-claims"><div class="object-claim" data-canonical-status="null"><b>VALUATION</b>ASSET EVIDENCE REQUIRED</div><div class="object-claim" data-canonical-status="${D.claim_contract.forecast_gate}"><b>FORECAST</b>LEAD-TIME STUDY PENDING</div><div class="object-claim" data-canonical-status="${D.claim_contract.forest_response}"><b>RESPONSE</b>CAUSAL STUDY NEXT</div></div>`;
  $("#risk-object").querySelectorAll("[data-module]").forEach(b => b.addEventListener("click", () => { $("#provenance-drawer").textContent = provenance[b.dataset.module]; }));
  $("#risk-object .object-sig").addEventListener("click", async () => { await navigator.clipboard?.writeText(D.generated_from.canonical_signature); $("#provenance-drawer").textContent = `Canonical signature ${D.generated_from.canonical_signature}`; });
  $("#provenance-drawer").textContent = "Select an evidence module to review its sources, method, and scope.";

  const products = [
    ["Soy Belt","Full moisture-to-crop-to-value chain, priced and backtested within its current evidence scope.","soy-belt.html","PRICED CORRIDOR"],
    ["Andes","Regional water-tower attribution with valuation held for later validation.","andes.html","REGIONAL ATTRIBUTION"],
    ["Nordic Forest","Asset geometry, forest exposure, atmospheric dependency, condition, and a signed object.","#story","ASSET EVIDENCE"]
  ];
  $("#product-grid").innerHTML = products.map(p => `<a class="product-card" href="${p[2]}"><b>${p[0]}</b><span>${p[1]}</span><em>${p[3]}</em></a>`).join("");

  const flow = ["Authorized asset boundary","Protected data intake","Atmospheric dependency analysis","Approved aggregates and evidence hash","Risk object or API"];
  $("#commercial-workflow").innerHTML = flow.map(x => `<div class="workflow-step">${x}</div>`).join("");
  $("#commercial-requirements").innerHTML = `<div class="commercial-column"><b>OWNER PROVIDES</b><ul><li>Authorized GeoJSON, GeoPackage, or GeoParquet</li><li>Asset ID and kind</li><li>G2 or G3 evidence class</li><li>Rights basis and attestor</li><li>Source label, version or date, and terms</li></ul></div><div class="commercial-column"><b>STAYS PRIVATE</b><ul><li>Raw coordinates</li><li>Bounding boxes and centroids</li><li>Tiles and pixels</li><li>Source path</li></ul></div>`;

  const partners = [
    ["Data-layer integration","For climate-risk and nature-risk vendors testing how atmospheric dependency fits an existing data product."],
    ["Confidential asset pilot","For forestry managers, banks, asset managers, insurers, and reinsurers."],
    ["Independent validation","For scientific partners ready to test, challenge, or co-publish the method."]
  ];
  $("#partner-grid").innerHTML = partners.map(p => `<div class="partner-card"><b>${p[0]}</b><span>${p[1]}</span></div>`).join("");
  api.reset = () => {
    renderAsset("identity"); renderForest("nmd"); renderScale("asset"); renderWam(2023);
    api.hydroYear=2018; api.hydroMetric="precipitation"; renderHydro(); renderCondition("satellite");
    document.querySelectorAll("details[open]").forEach(d => d.removeAttribute("open"));
    $("#provenance-drawer").textContent = "Select an evidence module to review its sources, method, and scope.";
  };
  api.ready = true;
})();
