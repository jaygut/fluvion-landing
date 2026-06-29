// emulator.js - the Fluvion serving surrogate, running client-side in the browser.
// Loads the exported weights from window.FLUVION_DATA.emulator and answers Water Value-at-Risk
// queries with a Monte Carlo over the parameter priors. No backend. Matches the Python
// surrogate exactly on identical inputs (verified headless).
(function () {
  const EMU = window.FLUVION_DATA && window.FLUVION_DATA.emulator;
  if (!EMU) return;
  const S = EMU.surrogate;

  // ---- surrogate forward: 5 params -> [per_ha, uk_loss] ----
  function forward(x) {
    const xs = x.map((v, i) => (v - S.x_mean[i]) / S.x_scale[i]);
    const H = S.W1[0].length;            // hidden units
    const h = new Array(H);
    for (let j = 0; j < H; j++) {
      let a = S.b1[j];
      for (let i = 0; i < x.length; i++) a += xs[i] * S.W1[i][j];
      h[j] = a > 0 ? a : 0;              // relu
    }
    const out = new Array(S.W2[0].length);
    for (let k = 0; k < out.length; k++) {
      let a = S.b2[k];
      for (let j = 0; j < H; j++) a += h[j] * S.W2[j][k];
      out[k] = Math.exp(a * S.y_scale[k] + S.y_mean[k]) - 1;
    }
    return out;                          // [per_ha, uk_loss]
  }

  // ---- RNG helpers ----
  let _s = 12345;
  function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
  function gauss(m, sd) {                // Box-Muller
    let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function lognorm(mean, sd) {
    const varr = sd * sd, mu = Math.log(mean * mean / Math.sqrt(varr + mean * mean));
    const sig = Math.sqrt(Math.log(1 + varr / (mean * mean)));
    return Math.exp(gauss(mu, sig));
  }
  function quantile(sorted, q) {
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  // ---- Monte Carlo query (runs the real engine's sampling, in JS) ----
  function query(opts) {
    opts = opts || {};
    const sc = opts.scenario || "central";
    const n = opts.n || 12000;
    const pr = EMU.priors, fc = (opts.fLoss != null) ? opts.fLoss : EMU.scenario_f[sc];
    const discFixed = opts.discount;
    const perha = new Float64Array(n), uk = new Float64Array(n);
    _s = 12345;
    for (let i = 0; i < n; i++) {
      const w = Math.max(0.01, lognorm(pr.w_soybelt.mean, pr.w_soybelt.sd));
      const f = Math.min(0.99, Math.max(0.01, fc + (rnd() * 2 - 1) * pr.f_loss_sd));
      const eps = Math.max(0.01, gauss(pr.epsilon_yield.mean, pr.epsilon_yield.sd));
      const price = Math.max(1, gauss(pr.price_soy_usd_t.mean, pr.price_soy_usd_t.sd));
      const disc = (discFixed != null) ? discFixed : (pr.discount_r.lo + rnd() * (pr.discount_r.hi - pr.discount_r.lo));
      const o = forward([w, f, eps, price, disc]);
      perha[i] = o[0]; uk[i] = o[1];
    }
    const ph = Array.from(perha).sort((a, b) => a - b);
    const ul = Array.from(uk).sort((a, b) => a - b);
    const af = areaFraction(opts.parcels);
    // Headline VaR/ES come from the calibrated scenario presets, which reproduce the
    // physics engine exactly (high ES95 = $2.10M, not a noisy $2.2M MC draw) and are
    // discount-independent annual losses, scaled by the conserved-area fraction. The
    // Monte Carlo drives only the per-hectare distribution (median / P5 / P95) - the
    // parameter spread that does respond to the discount slider. Fall back to the
    // calibrated MC tail if presets are unavailable.
    const preset = (EMU.presets && EMU.presets[sc]) || {};
    let var95, es95;
    if (preset.VaR95 != null && preset.ES95 != null) {
      var95 = preset.VaR95 * af; es95 = preset.ES95 * af;
    } else {
      const cal = (EMU.calibration && EMU.calibration[sc]) || { var: 1, es: 1 };
      var95 = quantile(ul, 0.95) * af * cal.var;
      let es = 0, c = 0; const thr = quantile(ul, 0.95);
      for (let i = 0; i < ul.length; i++) if (ul[i] >= thr) { es += ul[i]; c++; }
      es95 = (c ? es / c : 0) * af * cal.es;
    }
    return {
      scenario: sc, median_per_ha: quantile(ph, 0.5), p5: quantile(ph, 0.05), p95: quantile(ph, 0.95),
      var95: var95, es95: es95, area_frac: af,
      coverage_floor: EMU.conformal.coverage_floor,
    };
  }

  function areaFraction(parcels) {
    const all = EMU.parcels, total = all.reduce((s, p) => s + p.area_ha, 0);
    if (!parcels || parcels.length === 0) return 1;
    const sel = all.filter((p) => parcels.includes(p.name)).reduce((s, p) => s + p.area_ha, 0);
    return sel > 0 ? sel / total : 1;
  }

  function perState(scenario) { return EMU.overlay.scenarios[scenario] || []; }

  window.FLUVION_EMU = { forward, query, perState, areaFraction, data: EMU };
})();
