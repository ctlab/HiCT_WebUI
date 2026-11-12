# Inline FASTA workspace

At base-readable zoom, linked FASTA is rendered on both axes between the annotation tracks and the ruler. The contact map remains visible. Drag a FASTA strip to pan its axis; scroll or double-click to zoom the map. Arrow keys pan the focused strip; plus/minus zoom. Zooming out removes the strip automatically.

All tracks retain the map's gap-free coordinates. Scaffold boundaries show the configured N separator on hover; they do not insert additional columns into the contact matrix. Separate-record FASTA exports and imported AGP gap policies are unchanged. Base tooltips report current assembly position, original FASTA position and orientation, contig, and scaffold. Contig/scaffold separators use the corresponding 2D border styling.

Sequence requests are bounded and debounced. A small cached margin allows immediate redraw during nearby pans. Cache identity includes assembly history and sequence revisions. Reverse, undo/redo, and debris changes invalidate displayed bases. The inline track does not impose the old separate sequence inspector's read-only restriction.

Track metadata is displayed in a viewport-bounded popup outside the track's clipping container. Move into the popup to inspect or scroll it; Escape dismisses it. PNG exports retain the rendered scene; SVG/PDF retain editable FASTA letters and annotation geometry alongside raster contact data. Hover popups are not part of the export.

The color-range editor provides precise numeric bounds and one two-handle slider. Nearly coincident handles are separated vertically. `Focus range` spreads the current thresholds across the slider. `Linear`/`Log` affect slider sensitivity only. Advanced slider limits and an explicitly requested whole-map scan are under `Slider limits & data`. Ordinary navigation and threshold changes use already loaded tile range data, without scanning the map.

## Reproduce browser checks

Install Python Playwright and its Chromium browser (or set `HICT_TEST_CHROMIUM` to an existing binary). Serve the production WebUI and a matching HiCT server on isolated ports. The acceptance fixture uses `q4_primary.hict.hdf5` with linked `q4.fa`, and `sequence-axis-annotations.bed` in the server data directory. The fixture has a boundary at assembly bp 37450 with records `q4s0` and `q4s1`; annotation rows are:

```text
q4s0\t37350\t37450\tleft_feature\t0\t+\t37360\t37440\t0,128,255
q4s1\t0\t100\tright_feature\t0\t-\t10\t90\t255,128,0
```

Replace the literal `\t` with tab characters when writing the BED file.

```bash
export HICT_TEST_URL=http://127.0.0.1:8084
export HICT_TEST_API=http://127.0.0.1:5191
export HICT_TEST_DATA=/path/to/fixture-data
export HICT_TEST_OUTPUT=/path/to/new-results
python3 scripts/check-inline-workspace-browser.py
python3 scripts/check-inline-sequence-edits.py
```

Run these sequentially against an isolated server: both tests open assemblies and the second exercises edits. They do not modify source map/FASTA files. The edit test independently reads the fixture FASTA and compares it with the letters actually drawn on the canvas, including reverse-complement and history restoration. `npm run build` also runs tooltip viewport-placement, sequence zoom, range, projection and existing API/export regression contracts.

These checks establish the exercised behavior, not a claim of exhaustive browser/device coverage or a publication performance comparison.
