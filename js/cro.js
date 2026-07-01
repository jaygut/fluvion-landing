/* cro.js - renders the read-only public Corridor Risk Object tear-sheet in scene 5.
   Reads window.FLUVION_CRO (data/cro_public.js), a SCRUBBED, outputs-only snapshot of a real
   engine run: no coefficients, no model, no per-parcel identity. The scenario toggle SWITCHES
   between precomputed engine scenarios; it does not compute anything client-side. Writes
   window.__CRO for headless verification. */
(function () {
  "use strict";
  var C = window.FLUVION_CRO, el = document.getElementById("cro");
  if (!C || !el) { if (el) el.style.display = "none"; return; }

  var perha = function (v) { return "$" + Math.round(v).toLocaleString("en-US"); };
  var usdM = function (v) { return "$" + (v / 1e6).toFixed(2) + "M"; };
  var a = C.asset, sc = C.scenarios, bt = C.backtest, v = C.var, m = C.moisture;
  var lo = a.per_ha_usd.p5, mid = a.per_ha_usd.p50, hi = a.per_ha_usd.p95, land = a.land_price_usd_ha;
  var pos = function (x) { return Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100)); };

  var badges = C.claim_badges.map(function (b) {
    return '<span class="cro-badge">' + b.replace(/_/g, " ") + "</span>";
  }).join("");
  var prov = C.provenance.map(function (p) {
    return '<span class="cro-chip" title="' + p.role + (p.confidence ? " · " + p.confidence : "") + '">' +
      p.name.replace(/ \(.*/, "") + "</span>";
  }).join("");

  el.innerHTML =
    '<div class="cro-top"><div class="cro-title">Corridor Risk Object <span class="cro-id">' + C.corridor + '</span></div>' +
      '<div class="cro-badges">' + badges + '</div></div>' +
    '<div class="cro-meta">engine v' + C.engine_version + ' &middot; seed ' + C.seed + ' &middot; n=' + C.n.toLocaleString("en-US") +
      ' &middot; ' + C.source.area_ha.toLocaleString("en-US") + ' ha &middot; snapshot ' + C.snapshot + '</div>' +
    '<div class="cro-hero"><div class="cro-hero-num"><b id="cro-num">' + perha(mid) + '</b><span class="cro-unit">/ha</span></div>' +
      '<div class="cro-hero-cap" id="cro-cap">asset value as a rain machine, central case (f_loss 0.50)</div>' +
      '<div class="cro-hero-sub">' + a.basis + '</div></div>' +
    '<div class="cro-bar"><i class="cro-fill"></i>' +
      '<i class="cro-tick cro-tick--land" style="left:' + pos(land) + '%" title="regional land price ' + perha(land) + '/ha"></i>' +
      '<i class="cro-tick cro-tick--mid" id="cro-mark" style="left:' + pos(mid) + '%"></i></div>' +
    '<div class="cro-bar-leg">central-case range &middot; P5 ' + perha(lo) + ' &middot; median <b>' + perha(mid) + '</b> &middot; P95 ' + perha(hi) +
      '<span class="cro-land">land ' + perha(land) + '/ha &middot; ' + a.land_source + '</span></div>' +
    '<div class="cro-scn"><span class="cro-scn-lab">Stress the source</span>' +
      ["low", "central", "high"].map(function (k) {
        return '<button class="cro-btn' + (k === "central" ? " on" : "") + '" data-s="' + k + '" type="button">' + sc[k].label + "</button>";
      }).join("") +
      '<span class="cro-scn-note">f_loss is a named stress, not a probability</span></div>' +
    '<div class="cro-grid">' +
      '<div class="cro-cell"><div class="cro-k">Moisture attribution</div><div class="cro-val">' + m.amazon_laplata_pct + '%<span>Amazon to La Plata</span></div>' +
        '<div class="cro-cap2">inside Zemp 2014 (12 to 35%) &middot; confidence ' + m.confidence + '</div></div>' +
      '<div class="cro-cell"><div class="cro-k">Historical backtest</div><div class="cro-val">r=' + bt.held_out_pearson_r + '<span>held-out ' + bt.held_out_year + '</span></div>' +
        '<div class="cro-cap2">' + bt.n_years + ' harvest-years &middot; sign+rank reproduced &middot; pooled r ' + bt.pooled_pearson_r + ' (' + bt.pooled_ci95[0] + '-' + bt.pooled_ci95[1] + ')</div></div>' +
      '<div class="cro-cell cro-cell--muted"><div class="cro-k">UK loss at risk &middot; VaR95</div><div class="cro-val">' + usdM(v.var95_usd) + '<span class="cro-flag">placeholder</span></div>' +
        '<div class="cro-cap2">' + v.caveat + '</div></div>' +
      '<div class="cro-cell"><div class="cro-k">Lead-time forecast</div><div class="cro-val">Gate F<span>' + C.gate_f.status.replace(/_/g, " ") + '</span></div>' +
        '<div class="cro-cap2">no forecast claim until the skill is published</div></div>' +
    '</div>' +
    '<div class="cro-prov"><span class="cro-prov-lab">Built on</span>' + prov + '</div>' +
    '<div class="cro-foot">A read-only snapshot of a live engine output. The full ledger, model, and per-parcel detail are in the evidence pack.</div>';

  var num = document.getElementById("cro-num"), cap = document.getElementById("cro-cap"), mark = document.getElementById("cro-mark");
  el.querySelectorAll(".cro-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var s = sc[btn.getAttribute("data-s")];
      el.querySelectorAll(".cro-btn").forEach(function (x) { x.classList.remove("on"); });
      btn.classList.add("on");
      num.textContent = perha(s.per_ha_usd_p50);
      cap.textContent = "asset value as a rain machine, " + s.label.toLowerCase() + " case (f_loss " + s.f_loss.toFixed(2) + ")";
      mark.style.left = pos(s.per_ha_usd_p50) + "%";
    });
  });
  window.__CRO = { ready: true, corridor: C.corridor, median: mid, scenarios: ["low", "central", "high"] };
})();
