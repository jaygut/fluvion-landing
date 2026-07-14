/* soy_context.js - compact public widget for the soy crop-value x vulnerability context layer.
   Reads only data/soy_context_public.js. It controls the map mode and displays the
   promotion verdict; it never recomputes or reprices the corridor. */
(function () {
  const DATA = window.FLUVION_SOY_CONTEXT;
  const state = (window.__SOY_CONTEXT = {
    ready: false,
    mode: "overlap",
    nCells: 0,
    promotion: "unknown",
    errors: [],
  });
  if (!DATA) {
    state.errors.push("missing FLUVION_SOY_CONTEXT");
    return;
  }
  const host = document.getElementById("soy-context");
  if (!host) {
    state.errors.push("missing #soy-context");
    return;
  }

  const modes = DATA.modes || [];
  const modeById = Object.fromEntries(modes.map((m) => [m.id, m]));
  const copy = {
    soy: {
      kicker: "Where the value sits",
      body: "Soy production is the exposure mask. It is fixed before the event window and never used as a same-year loss target.",
    },
    drought: {
      kicker: "Where dry years bite",
      body: "Standardized drought pressure marks cells with worse historical moisture stress, without changing the corridor price.",
    },
    heatsoil: {
      kicker: "Where heat meets thin buffers",
      body: "Heatwave pressure and soil constraints are folded into one physical-stress view for triage, not pricing.",
    },
    overlap: {
      kicker: "Where to look first",
      body: "The overlap combines crop value with drought, heat, and soil stress. It was benchmarked and not promoted to the risk object.",
    },
  };

  function fmtSigned(v) {
    const n = Number(v || 0);
    return (n > 0 ? "+" : "") + n.toFixed(3);
  }

  function render() {
    const m = modeById[state.mode] || modeById.overlap || modes[0] || { label: "Overlap" };
    const c = copy[state.mode] || copy.overlap;
    const b = DATA.benchmark || {};
    host.innerHTML = `
      <div class="soyctx-top">
        <div>
          <div class="soyctx-title">Context layer</div>
          <div class="soyctx-sub">${c.kicker}</div>
        </div>
        <div class="soyctx-verdict">not priced</div>
      </div>
      <div class="soyctx-modes" role="group" aria-label="Soy context map mode">
        ${modes.map((x) => `<button type="button" class="soyctx-btn${x.id === state.mode ? " on" : ""}" data-mode="${x.id}">${x.label}</button>`).join("")}
      </div>
      <div class="soyctx-read">
        <b>${m.label}</b>
        <span>${c.body}</span>
      </div>
      <div class="soyctx-grid">
        <div class="soyctx-cell"><span>Cells</span><b>${(DATA.summary.grid_cells || state.nCells).toLocaleString("en-US")}</b></div>
        <div class="soyctx-cell"><span>Benchmark</span><b>${b.n || 0}</b></div>
        <div class="soyctx-cell soyctx-cell--wide"><span>Promotion gate</span><b>${b.short_verdict || "not promoted"}</b></div>
      </div>
      <div class="soyctx-score">
        <span>Rank signal</span>
        <i style="--w:${Math.max(4, Math.min(96, 50 + 45 * Number(b.spearman_rho || 0))).toFixed(0)}%"></i>
        <b>rho ${fmtSigned(b.spearman_rho)}</b>
      </div>
      <div class="soyctx-foot">
        Price unchanged. Visual scores only. Source layers: crop production, drought indices, heatwave indices, and SoilGrids properties, harmonized by
        <a href="${DATA.source.worldtensor_url}" target="_blank" rel="noopener">WorldTensor</a>
        (<a href="${DATA.source.worldtensor_pipeline}" target="_blank" rel="noopener">pipeline</a>).
      </div>`;
    host.querySelectorAll(".soyctx-btn").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });
  }

  function setMode(mode) {
    if (!modeById[mode]) return;
    state.mode = mode;
    render();
    window.dispatchEvent(new CustomEvent("soycontext:mode", { detail: { mode } }));
  }

  state.nCells = Array.isArray(DATA.cells) ? DATA.cells.length : 0;
  state.promotion = DATA.promotion || "unknown";
  state.ready = true;
  render();
})();
