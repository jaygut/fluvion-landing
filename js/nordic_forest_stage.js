(function () {
  "use strict";
  const D = window.__NORDIC_PUBLIC__;
  const root = d3.select("#nordic-stage");
  const api = window.__NORDIC_STAGE = {
    ready: false, errors: [], currentScene: "hook", mode: "svg", scaleLens: "asset",
    hydroMetric: "precipitation", flowYear: 2023, flowTracks: [], transitioning: false,
    release: window.__NORDIC_RELEASE__ || "unversioned"
  };
  window.__CINE = { ready: false, scene: "hook", emphasis: { emit: .35, turbulence: .2 } };
  if (!D || !D.cartographic_context) { api.errors.push("missing public contract or cartographic context"); return; }

  const svg = root.append("svg").attr("role", "img")
    .attr("aria-label", "North Atlantic and Baltic atmospheric dependency map converging on the Krycklan public reference asset");
  const mapLayer = svg.append("g").attr("class", "nf-map-layer");
  const chartLayer = svg.append("g").attr("class", "nf-chart-layer");
  const projection = d3.geoConicConformal().parallels([55, 68]).rotate([-15, 0]).center([0, 62]);
  const path = d3.geoPath(projection);
  const asset = D.geography.features.find(f => f.properties.support === "asset");
  const support = D.geography.features.find(f => f.properties.support === "wam_physics");
  const assetClipPath = svg.append("defs").append("clipPath")
    .attr("id", "nf-asset-clip")
    .attr("clipPathUnits", "userSpaceOnUse")
    .append("path")
    .datum(asset);
  const context = D.cartographic_context;
  const contextCountries = context.features.filter(f => f.properties.layer === "country");
  const contextLakes = context.features.filter(f => f.properties.layer === "lake");
  const contextRivers = context.features.filter(f => f.properties.layer === "river");
  const contextExtent = { type: "FeatureCollection", features: contextCountries };
  const assetCenter = d3.geoCentroid(asset);
  const selectedYears = new Set([2018, 2019, 2023]);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scenes = ["hook","blindspot","asset","forest","scale","moisture","hydro","condition","object","platform","commercial","ask"];
  const SCENE_STATES = Object.fromEntries(scenes.map((id,index) => [id, {
    id, camera: id === "moisture" ? [9,62] : [18.5,63.5],
    zoom: ["asset","forest"].includes(id) ? "asset" : (id === "scale" ? "lens" : "north-atlantic"),
    activeLayers: id === "hydro" ? ["timeline"] : ["countries","hydrology","asset","support","flows"],
    inactiveOpacity: ["condition","object","commercial"].includes(id) ? .24 : 1,
    colorEmphasis: id === "hydro" ? "event" : (id === "moisture" ? "moisture" : "evidence"),
    labelSet: id, particleBudget: id === "moisture" ? 280 : (["hook","blindspot"].includes(id) ? 120 : 0),
    cardPlacement: document.querySelector(`.step[data-scene="${id}"]`)?.classList.contains("right") ? "right" : "left",
    transitionMs: reducedMotion ? 0 : 620, index
  }]));
  api.sceneStates = SCENE_STATES;
  let width = innerWidth, height = innerHeight, cameraToken = 0;

  const COLORS = {
    oceanic: "#2bd4c4", other_terrestrial: "#f2a24e", sweden: "#3ad6a3",
    finland: "#78a7c5", baltics: "#ad8bd7"
  };
  const tracks = [
    { key:"oceanic", label:"NORTH ATLANTIC", from:[-14.0,58.5], control:[1.0,66.6], shareOfClass:.54 },
    { key:"oceanic", label:"NORWEGIAN SEA", from:[1.5,69.0], control:[10.2,70.3], shareOfClass:.46 },
    { key:"other_terrestrial", label:"WESTERN EUROPE", from:[2.7,51.7], control:[9.2,58.8], shareOfClass:.55 },
    { key:"other_terrestrial", label:"CENTRAL EUROPE", from:[17.2,51.8], control:[19.0,57.4], shareOfClass:.45 },
    { key:"sweden", label:"SWEDEN", from:[13.1,59.2], control:[15.1,62.0], shareOfClass:1 },
    { key:"finland", label:"FINLAND", from:[27.4,63.2], control:[24.4,65.4], shareOfClass:1 },
    { key:"baltics", label:"BALTICS", from:[24.3,57.4], control:[22.4,60.6], shareOfClass:1 }
  ].map((d, i) => ({ ...d, id:`${d.key}-${i}`, target:assetCenter, color:COLORS[d.key] }));
  api.flowTracks = tracks;

  mapLayer.append("path").datum(d3.geoGraticule().step([5,5])()).attr("class", "nf-graticule").attr("data-geo", "graticule");
  mapLayer.selectAll(".nf-country").data(contextCountries).join("path")
    .attr("class", d => `nf-country ${d.properties.id === "SE" ? "is-sweden" : ""}`).attr("data-geo", "country");
  mapLayer.selectAll(".nf-lake").data(contextLakes).join("path").attr("class", "nf-lake").attr("data-geo", "lake");
  mapLayer.selectAll(".nf-river").data(contextRivers).join("path").attr("class", "nf-river").attr("data-geo", "river");
  const raster = mapLayer.append("image").attr("class", "nf-raster").attr("href", D.forest.preview.url)
    .attr("preserveAspectRatio", "none").attr("clip-path", "url(#nf-asset-clip)");
  mapLayer.append("path").datum(support).attr("class", "nf-support").attr("data-geo", "support");
  mapLayer.append("path").datum(asset).attr("class", "nf-asset-halo").attr("data-geo", "asset-halo");
  mapLayer.append("path").datum(asset).attr("class", "nf-asset").attr("data-geo", "asset");

  const flowLayer = mapLayer.append("g").attr("class", "nf-flow-layer");
  flowLayer.selectAll(".nf-flow-under").data(tracks).join("path").attr("class", "nf-flow-under");
  flowLayer.selectAll(".nf-flow").data(tracks).join("path").attr("class", d => `nf-flow ${d.key}`)
    .style("stroke", d => d.color);
  const particleLayer = mapLayer.append("g").attr("class", "nf-live-particle-layer");
  api.particleHost = particleLayer.node();
  const sourceLayer = mapLayer.append("g").attr("class", "nf-source-layer");
  const sourceNodes = sourceLayer.selectAll(".nf-source-node").data(tracks).join("g").attr("class", d => `nf-source-node ${d.key}`);
  sourceNodes.append("circle").attr("class", "nf-source-halo");
  sourceNodes.append("circle").attr("class", "nf-source-dot").style("fill", d => d.color);
  sourceNodes.append("text").attr("class", "nf-source-label").attr("x", 12).attr("y", 3).text(d => d.label);

  const labels = [
    {name:"NORTH ATLANTIC", coord:[-12.5,54.2], kind:"water"},
    {name:"NORWEGIAN SEA", coord:[0.2,66.1], kind:"water"},
    {name:"BALTIC SEA", coord:[20.4,58.8], kind:"water"},
    {name:"UNITED KINGDOM", coord:[-3.2,55.2]}, {name:"NORWAY", coord:[8.2,63.5]},
    {name:"SWEDEN", coord:[16.4,61.6]}, {name:"FINLAND", coord:[27.0,65.7]},
    {name:"DENMARK", coord:[10.0,55.8]}, {name:"GERMANY", coord:[10.0,51.0]},
    {name:"POLAND", coord:[19.0,52.0]}, {name:"BALTIC STATES", coord:[25.8,56.2]}
  ];
  const labelLayer = mapLayer.append("g").attr("class", "nf-label-layer");
  labelLayer.selectAll("text").data(labels).join("text")
    .attr("class", d => `nf-geo-label ${d.kind === "water" ? "water" : "land"}`).text(d => d.name);

  const marker = mapLayer.append("g").attr("class", "nf-asset-marker");
  marker.append("circle").attr("class", "nf-node-pulse").attr("r", 20);
  marker.append("circle").attr("class", "nf-node-ring").attr("r", 13);
  marker.append("circle").attr("class", "nf-node-dot").attr("r", 3);
  marker.append("text").attr("class", "nf-map-note").attr("x", 20).attr("y", -4).text("KRYCKLAN");
  marker.append("text").attr("class", "nf-map-subnote").attr("x", 20).attr("y", 10).text("PUBLIC REFERENCE ASSET");
  const unresolved = mapLayer.append("g").attr("class", "nf-unresolved-note");
  unresolved.append("rect").attr("rx", 5).attr("ry", 5);
  unresolved.append("text");

  function cardPlacement() {
    const step = document.querySelector(`.step[data-scene="${api.currentScene}"]`);
    if (step?.classList.contains("right")) return "right";
    if (step?.classList.contains("center")) return "center";
    return "left";
  }
  function fit(feature) {
    const placement = cardPlacement();
    const zoomed = ["asset","forest"].includes(api.currentScene) || api.currentScene === "scale";
    const top = Math.max(72, height * .105);
    const bottom = Math.min(height - 50, height * .905);
    let extent;
    if (width <= 760 || placement === "center") {
      extent = [[width * .08, top], [width * .92, bottom]];
    } else {
      const card = document.querySelector(`.step[data-scene="${api.currentScene}"] .card`)?.getBoundingClientRect();
      const gutter = 44;
      if (placement === "left") {
        const x0 = Math.max(width * (zoomed ? .44 : .30), (card?.right || 0) + gutter);
        extent = [[x0, top], [width * .97, bottom]];
      } else {
        const x1 = Math.min(width * (zoomed ? .56 : .70), (card?.left || width) - gutter);
        extent = [[width * .03, top], [x1, bottom]];
      }
    }
    projection.fitExtent(extent, feature);
  }
  function projectBezier(track, u) {
    const a = projection(track.from), c = projection(track.control), b = projection(track.target);
    if (!a || !b || !c) return null;
    const v = 1 - u;
    return [v*v*a[0] + 2*v*u*c[0] + u*u*b[0], v*v*a[1] + 2*v*u*c[1] + u*u*b[1]];
  }
  function flowPath(track) {
    const a = projection(track.from), c = projection(track.control), b = projection(track.target);
    return a && b && c ? `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}` : "";
  }
  api.projectFlow = (track, u) => projectBezier(track, u);
  api.project = coord => projection(coord);

  function renderMapGeometry() {
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    assetClipPath.attr("d", path);
    mapLayer.selectAll("path[data-geo]").attr("d", path);
    const center = projection(assetCenter);
    marker.attr("transform", `translate(${center[0]},${center[1]})`);
    flowLayer.selectAll(".nf-flow-under,.nf-flow").attr("d", flowPath);
    sourceNodes.attr("transform", d => { const q=projection(d.from); return `translate(${q[0]},${q[1]})`; });
    labelLayer.selectAll("text").attr("x", d => projection(d.coord)?.[0] ?? -100).attr("y", d => projection(d.coord)?.[1] ?? -100);
    const shares = D.moisture.shares_by_year[String(api.flowYear)];
    flowLayer.selectAll(".nf-flow").style("stroke-width", d => Math.max(1.2, 2 + shares[d.key] * d.shareOfClass * 28));
    sourceNodes.selectAll(".nf-source-dot").attr("r", d => 2.5 + Math.sqrt(shares[d.key] * d.shareOfClass) * 18);
    sourceNodes.selectAll(".nf-source-halo").attr("r", d => 7 + Math.sqrt(shares[d.key] * d.shareOfClass) * 24);
    const b = D.forest.preview.bounds_wgs84;
    const nw = projection([b[0], b[3]]), se = projection([b[2], b[1]]);
    raster.attr("x", nw[0]).attr("y", nw[1]).attr("width", Math.max(1,se[0]-nw[0])).attr("height", Math.max(1,se[1]-nw[1]));
    mapLayer.select(".nf-support").style("opacity", api.currentScene === "scale" || api.currentScene === "moisture" ? 1 : .2);
    const showFlows = ["hook","blindspot","moisture"].includes(api.currentScene);
    const showBalanceNote = api.currentScene === "moisture";
    flowLayer.style("opacity", showFlows ? 1 : 0);
    sourceLayer.style("opacity", showFlows ? 1 : 0);
    labelLayer.style("opacity", ["asset","forest","scale","hydro","condition","object","commercial"].includes(api.currentScene) ? .18 : .8);
    marker.style("opacity", ["object","commercial","condition"].includes(api.currentScene) ? .3 : 1);
    const resolved = 1 - shares.residual_outside_domain;
    const balanceText = `${(resolved*100).toFixed(1)}% NAMED SOURCE MIX · FULL BALANCE REPORTED`;
    const balanceLabel = unresolved.select("text").attr("x", 11).attr("y", 20).text(balanceText);
    const balanceWidth = Math.ceil((balanceLabel.node()?.getComputedTextLength?.() || 238) + 24);
    const balanceX0 = width * (cardPlacement()==="right" ? .055 : .69);
    const balanceX = Math.max(14, Math.min(balanceX0, width - balanceWidth - 14));
    unresolved.attr("transform", `translate(${balanceX},${height*.14})`)
      .style("opacity", showBalanceNote ? 1 : 0);
    unresolved.select("rect").attr("width", balanceWidth).attr("height", 31);
    api.camera = { scale: projection.scale(), translate: projection.translate().slice(), scene: api.currentScene };
  }

  function drawMap(animate = false) {
    const focus = (["asset","forest"].includes(api.currentScene) || (api.currentScene === "scale" && api.scaleLens === "asset")) ? asset
      : (api.currentScene === "scale" ? support : contextExtent);
    const fromScale = projection.scale(), fromTranslate = projection.translate().slice();
    fit(focus);
    const toScale = projection.scale(), toTranslate = projection.translate().slice();
    const token = ++cameraToken;
    const movement = Math.abs(toScale-fromScale) + Math.hypot(toTranslate[0]-fromTranslate[0],toTranslate[1]-fromTranslate[1]);
    if (!animate || reducedMotion || movement < .25) {
      api.transitioning = false;
      document.body.classList.remove("nf-camera-moving");
      renderMapGeometry();
      return;
    }
    api.transitioning = true;
    document.body.classList.add("nf-camera-moving");
    projection.scale(fromScale).translate(fromTranslate);
    const started = performance.now(), duration = SCENE_STATES[api.currentScene]?.transitionMs || 620;
    const tick = now => {
      if (token !== cameraToken) return;
      const t = Math.min(1,(now-started)/duration), eased = t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
      projection.scale(fromScale+(toScale-fromScale)*eased).translate([
        fromTranslate[0]+(toTranslate[0]-fromTranslate[0])*eased,
        fromTranslate[1]+(toTranslate[1]-fromTranslate[1])*eased
      ]);
      renderMapGeometry();
      if (t < 1) requestAnimationFrame(tick);
      else {
        api.transitioning = false;
        document.body.classList.remove("nf-camera-moving");
        renderMapGeometry();
      }
    };
    requestAnimationFrame(tick);
  }

  function drawHydro() {
    chartLayer.selectAll("*").remove();
    const rows = D.hydroclimate.annual_series;
    const value = api.hydroMetric === "temperature" ? d => d.temperature_degC : d => d.precipitation_mm;
    const x = d3.scaleLinear().domain(d3.extent(rows,d=>d.year)).range([width*.08,width*.92]);
    const y = d3.scaleLinear().domain(d3.extent(rows,value)).nice().range([height*.77,height*.24]);
    chartLayer.append("path").datum(rows).attr("class","nf-chart-line").attr("d",d3.line().x(d=>x(d.year)).y(d=>y(value(d))));
    chartLayer.selectAll("circle").data(rows.filter(d=>selectedYears.has(d.year))).join("circle")
      .attr("class",d=>`nf-chart-dot ${d.year===2018?"event":""}`).attr("cx",d=>x(d.year)).attr("cy",d=>y(value(d))).attr("r",d=>d.year===2018?7:5);
    chartLayer.append("g").attr("class","nf-axis").attr("transform",`translate(0,${height*.77})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));
    chartLayer.append("g").attr("class","nf-axis").attr("transform",`translate(${width*.08},0)`).call(d3.axisLeft(y).ticks(5));
    chartLayer.append("text").attr("class","nf-map-note").attr("x",width*.08).attr("y",height*.19).text(api.hydroMetric === "temperature" ? "MAY TO SEPTEMBER MEAN TEMPERATURE · °C" : "MAY TO SEPTEMBER PRECIPITATION · MM");
  }

  function setScene(scene) {
    if (!scenes.includes(scene)) return;
    api.currentScene = scene;
    document.body.dataset.scene = scene;
    window.__CINE.scene = scene;
    window.__CINE.emphasis = { emit: scene === "moisture" ? .9 : (["hook","blindspot"].includes(scene) ? .38 : 0), turbulence: scene === "moisture" ? .42 : .18 };
    drawMap(true);
    if (scene === "hydro") drawHydro();
    const index = scenes.indexOf(scene);
    document.querySelector("#prog").style.width = `${(index/(scenes.length-1))*100}%`;
    document.querySelector("#hint").style.opacity = index === 0 ? "1" : "0";
    const legend = document.querySelector("#legend");
    if (["hook","blindspot","moisture"].includes(scene)) {
      legend.innerHTML = '<b>Named source classes</b><span><i class="oceanic"></i>Oceanic</span><span><i class="terrestrial"></i>Terrestrial</span><span><i class="local"></i>Nordic land</span><small>Class-level pathways show the named source mix</small>';
      legend.classList.add("show");
    } else { legend.classList.remove("show"); }
  }
  api.setScale = view => { api.scaleLens=view; if(api.currentScene === "scale") drawMap(true); };
  api.setHydroMetric = metric => { api.hydroMetric=metric; if(api.currentScene === "hydro") drawHydro(); };
  api.setFlowYear = year => { api.flowYear=Number(year); renderMapGeometry(); };
  api.setScene = setScene;

  function resize() { width=innerWidth; height=innerHeight; cameraToken++; drawMap(false); if(api.currentScene === "hydro") drawHydro(); }
  addEventListener("resize", resize, {passive:true});
  drawMap(false);
  const demoMode = new URLSearchParams(location.search).get("demo") === "1";
  let presenterTarget = null;
  if (demoMode) document.documentElement.classList.add("presenter-mode");
  const activateStep = element => {
    if (!element) return;
    document.querySelectorAll(".step").forEach(s => s.classList.toggle("active",s===element));
    if (api.currentScene !== element.dataset.scene || document.body.dataset.scene !== element.dataset.scene) setScene(element.dataset.scene);
  };
  if (window.scrollama) {
    const scroller = scrollama();
    scroller.setup({step:".step",offset:.52}).onStepEnter(r => {
      const entered = r.element.dataset.scene;
      if (demoMode && presenterTarget && entered !== presenterTarget) return;
      activateStep(r.element);
      if (entered === presenterTarget) presenterTarget = null;
    });
    addEventListener("resize",()=>scroller.resize(),{passive:true});
  } else api.errors.push("scrollama unavailable");
  if (/[?&]deck(?:&|$)/.test(location.search)) api.mode = "svg-deck-compatible";
  const hashScene = location.hash.replace(/^#(?:scene=)?/,"");
  if (scenes.includes(hashScene) && !demoMode) requestAnimationFrame(() => document.querySelector(`[data-scene="${hashScene}"]`)?.scrollIntoView());
  if (demoMode) {
    const route=["hook","blindspot","scale","moisture","condition","object","commercial","ask"];
    let pos=Math.max(0,route.indexOf(hashScene));
    const controls=document.createElement("nav"); controls.className="demo-controls"; controls.setAttribute("aria-label","Presenter controls");
    controls.innerHTML='<button type="button" data-act="prev" aria-label="Previous scene">←</button><span></span><button type="button" data-act="next" aria-label="Next scene">→</button><button type="button" data-act="reset">RESET</button>';
    document.body.appendChild(controls);
    const show=()=>{ const id=route[pos], element=document.querySelector(`[data-scene="${id}"]`); controls.querySelector("span").textContent=`${pos+1}/${route.length} · ${id.toUpperCase()}`; history.replaceState(null,"",`?demo=1#${id}`); presenterTarget=id; element?.scrollIntoView({behavior:"auto",block:"start"}); activateStep(element); presenterTarget=null; };
    const move=n=>{pos=Math.max(0,Math.min(route.length-1,pos+n));show();};
    controls.addEventListener("click",e=>{ const a=e.target.dataset.act;if(a==="prev")move(-1);if(a==="next")move(1);if(a==="reset"){pos=0;window.__NORDIC_WIDGETS?.reset?.();show();} });
    addEventListener("keydown",e=>{ if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)||e.repeat)return;const navKeys=["ArrowRight","ArrowDown","ArrowLeft","ArrowUp","Home","End"];if(!navKeys.includes(e.key))return;e.preventDefault();if(e.key==="ArrowRight"||e.key==="ArrowDown")move(1);if(e.key==="ArrowLeft"||e.key==="ArrowUp")move(-1);if(e.key==="Home"){pos=0;show();}if(e.key==="End"){pos=route.length-1;show();} });
    show();
  }
  if (!demoMode) setScene("hook");
  api.ready = true;
  window.__CINE.ready = true;
})();
