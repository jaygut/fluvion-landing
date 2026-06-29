// report.js - investor report controller: render figures + scroll-spy nav.

// KPI fills (real numbers)
const pv = D.parcel_values, mc = D.monte_carlo;
document.getElementById("kpi-perha").textContent = "$" + Math.round(pv.perha.central) + "/ha";
document.getElementById("kpi-var").textContent = fmt.usdc(mc.var95);
document.getElementById("ver").textContent = "engine v" + D._meta.engine_version + " · seed " + D._meta.seed;
document.getElementById("gen").textContent = D._meta.generated_at;

// Figure registry: [container, renderFn]
const FIGS = [
  ["#fig-calc .canvas", () => liveCalculator("#fig-calc .canvas")],
  ["#fig-stress .canvas", () => portfolioStress("#fig-stress .canvas")],
  ["#fig-exposure .canvas", () => exposure("#fig-exposure .canvas")],
  ["#fig-incumbent .canvas", () => incumbentMatrix("#fig-incumbent .canvas")],
  ["#fig-precip .canvas", () => precipitationshed("#fig-precip .canvas")],
  ["#fig-graph .canvas", () => moistureGraph("#fig-graph .canvas")],
  ["#fig-cascade .canvas", () => cascade("#fig-cascade .canvas")],
  ["#fig-mc .canvas", () => monteCarlo("#fig-mc .canvas")],
  ["#fig-skill .canvas", () => backtestSkill("#fig-skill .canvas")],
  ["#fig-bt2022 .canvas", () => backtestMaps("#fig-bt2022 .canvas", 2022)],
  ["#fig-finance .canvas", () => financialBacktest("#fig-finance .canvas")],
  ["#fig-parcel .canvas", () => parcelValue("#fig-parcel .canvas")],
  ["#fig-sobol .canvas", () => sobol("#fig-sobol .canvas")],
  ["#fig-surface .canvas", () => uncertaintySurface("#fig-surface .canvas")],
  ["#fig-scenario .canvas", () => scenarioLandscape("#fig-scenario .canvas")],
  ["#fig-global .canvas", () => globalCorridors("#fig-global .canvas")],
  ["#fig-comparison .canvas", () => comparisonMode("#fig-comparison .canvas")],
  ["#fig-timeline .canvas", () => scenarioTimeline("#fig-timeline .canvas")],
  ["#fig-condition .canvas", () => forestCondition("#fig-condition .canvas")],
  ["#fig-cv-scatter .canvas", () => etCrossvalScatter("#fig-cv-scatter .canvas")],
  ["#fig-cv-gauge .canvas", () => etRobustGauge("#fig-cv-gauge .canvas")],
  ["#fig-cv-fingerprint .canvas", () => etDroughtFingerprint("#fig-cv-fingerprint .canvas")],
  ["#fig-signal-maturity .canvas", () => signalMaturity("#fig-signal-maturity .canvas")],
  ["#fig-cro .canvas", () => croPanel("#fig-cro .canvas")],
  ["#fig-ladder .canvas", () => confidenceLadder("#fig-ladder .canvas")],
  ["#fig-gates .canvas", () => gateLadder("#fig-gates .canvas")],
  ["#fig-prov .canvas", () => provenanceLedger("#fig-prov .canvas")],
];
// lazy render on reveal
FIGS.forEach(([sel, fn]) => {
  const node = document.querySelector(sel);
  if (node) onReveal(node, fn);
});

// scroll-spy nav
const links = [...document.querySelectorAll("#nav a")];
const spy = new IntersectionObserver((ents) => {
  ents.forEach((e) => {
    if (e.isIntersecting) {
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }
  });
}, { rootMargin: "-30% 0px -60% 0px" });
document.querySelectorAll("main section").forEach((s) => spy.observe(s));
