# Fluvion visualization (Track A, open)

Two linked web artifacts, built from **real engine outputs**. Nothing is invented.

- **`index.html`** is the cinematic landing page. A full-screen **deck.gl** map of the
  Amazon-to-soy-belt corridor, with animated flying-river arcs, a moisture heatmap, and a
  scroll-driven camera that flies between scenes (powered by **scrollama**). The narrative is
  plain and investor-facing.
- **`report.html`** is the long-form evidence report: 14 interactive **D3** figures, scroll-spy
  navigation, and a sortable provenance ledger.

Both load `data/bundle.js` (`window.FLUVION_DATA`), exported by
`src/fluvion/viz/export_viz_data.py` from `run_pipeline()`, the Gate 2/4 payloads, the IBGE and
CHIRPS products, and the RECON moisture-flow cube. All libraries (deck.gl, d3, scrollama) are
vendored in `vendor/`, so both pages work fully offline once the fonts are cached.

## View it

The landing page uses WebGL (deck.gl), which needs a normal GPU browser. Just open the files:

```
open viz/index.html        # the cinematic landing
open viz/report.html       # the full report
```

If a browser blocks local module or file access, serve the folder instead:

```
cd viz && python -m http.server 8000   # then http://localhost:8000/index.html
```

## Regenerate the data

```
PYTHONPATH=src python -m fluvion.viz.export_viz_data   # rewrites viz/data/*.json + bundle.js
```

## How this was verified

- **`report.html`**: rendered headless (Playwright + Chromium) and checked end to end. All 16
  figures draw, zero JavaScript errors, every number matches the gate reports.
- **`index.html` (deck.gl)**: software WebGL cannot render deck.gl, so the visuals are confirmed
  on a real GPU. Headless, we verify what can be verified: it loads with zero errors, deck and all
  six layers construct on the real data, scrollama fires, and the camera tweens through all seven
  scenes. The pixels need a GPU browser, which any reviewer opening the file has.

## Honest by design

Every figure traces to a real computation or a published source. Where the full story needs data
we do not have yet, we say so in the page rather than fake it:

| Element | How it is handled |
|---|---|
| Source of the rain (S1) | One model (RECON) for now. The live three-model ensemble is the next step, flagged on the page. |
| Maps | Brazilian state resolution, which is the level the backtest is validated at. |
| The source forests | Shown as their bounding box. The exact parcel polygons are pending. |

All numbers are indicative, not prudential grade. The $350 per hectare is a lower bound: water,
one crop, one place the rain lands. The real number is larger.

## `index_v2.html` (experimental: "Living Precipitationshed")

`index_v2.html` is an enhanced, experimental version of the cinematic landing. **`index.html` (v1)
remains the verified baseline and is untouched.** Both pages read the same `data/bundle.js`
(`window.FLUVION_DATA`); v2 invents no new numbers. The headline figures ($350/ha, VaR95 $1.42M,
w_soybelt 0.2034, 21.5% on the Zemp benchmark) are identical and data-bound in both.

v2 keeps deck.gl as the geographic and camera authority and adds a geo-locked **p5.js generative
atmosphere** (`js/atmosphere.js`) on top: seeded curl-noise flow over the mean NW→SE moisture
corridor, Lagrangian tracers released from the source box and rained out over the soy belt in
proportion to the engine's share weights, plus the precipitationshed isolines drawn from
`precipitationshed_field.json` with `d3.contours`. New files only: `index_v2.html`,
`js/cinematic_v2.js`, `js/atmosphere.js`, `css/cinematic_v2.css`, `vendor/p5.min.js` (p5 1.9.4,
pinned, offline).

The art is **decorative and labelled illustrative** (particle counts, speeds, turbulence); the
numbers stay data-bound. The scene-6 "grade" interaction is the strategic payload and obeys the same
honesty rule as the copy: the source emits at a **constant mean** and the grade moves only the
**variance and the drought tail**, never the average (more degradation never paints more *or* less
average rain). Temporal motion illustrates the mechanism; it is never a forecast, and the CSD /
resilience grade stays descriptive and lagging.

Determinism is a provenance virtue: a fixed seed (42, the engine's own Monte-Carlo seed) reproduces
the field. `prefers-reduced-motion` renders a single static frame plus a still intact-vs-degraded
comparison; with no WebGL, the v1 SVG fallback shows and the atmosphere still breathes above it.

Verified headless on a host with no GPU, so (exactly as for v1) deck.gl falls back to its no-WebGL
SVG path and the deck.gl WebMercator camera + the contour isolines still need a real GPU to confirm
visually. In that fallback path the page loads with zero pageerrors and zero console errors,
`__CINE.nScenes === 9`, `__ATMO.ready` with a live p5 canvas (the atmosphere is canvas2d, so it
breathes in the fallback too), scrollama advances all nine scenes, and the static projector returns
finite screen coordinates. The scene-6 result, mean held at 1.00x while the variance moves low→high,
is projector-independent HUD arithmetic, so it holds in either path; the pitched 3D camera and the
luminous shed isolines want a GPU pass before they are called done.
