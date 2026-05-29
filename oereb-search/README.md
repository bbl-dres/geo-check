# ÖREB Parcel Search

Browser tool to search the Swiss **ÖREB cadastre** by municipality, EGRID, parcel number, postcode, or canton. Built on the public [swisstopo ÖREB layer](https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.swisstopo-vd.stand-oerebkataster). Part of the [`geo-check`](../README.md) repo.

## Live app

https://bbl-dres.github.io/geo-check/oereb-search/

(Old bookmarks to `/app-oereb/` redirect here.)

## Features

- **Two modes** — an interactive **search mask** (default) and a **batch CSV** lookup
- **Search** — municipality, EGRID, parcel number, PLZ, canton
- **Autocomplete** as you type
- **Area calculation** for selected parcels
- **Direct links** to official ÖREB extracts (PDF) for each parcel's canton
- **Multilingual UI** — DE / FR / IT

## Batch search (CSV)

Switch to the **Batch (CSV)** tab to look up many parcels at once:

1. **Upload** a CSV (drag-and-drop or picker). Only an **EGRID** column is required — a column literally named `egrid` is auto-detected, otherwise you pick which column holds the EGRID.
2. Each EGRID is looked up against the ÖREB layer (5 parallel requests, retries on transient errors, in-session dedup cache, cancellable).
3. The **found parcels appear in the same results table as the search mask** (EGRID · Gemeinde · Nr · Grundstücksart · Status) — click a row for the full detail panel with map, area and official extract links. It's the same view, just a different input method.
4. **Download** the complete results — every input row, including not-found/error — as **CSV** or **GeoJSON**. The CSV is **Excel-ready**: it opens straight into columns on a double-click (UTF-8 with a `sep=;` hint), so there's no import wizard and umlauts/accents stay intact.

**Column contract — no joins needed afterwards.** Every column you upload is preserved with an **`IN_`** prefix; every looked-up field is added with an **`OUT_`** prefix (`OUT_RESULT`, `OUT_GEMEINDE`, `OUT_FLAECHE_M2`, `OUT_OEREB_STATUS`, the official extract links, …). `OUT_RESULT` is one of `found` / `not_found` / `error`, so failed rows still carry your original data. The GeoJSON is **WGS84 (EPSG:4326)** with the same `IN_`/`OUT_` property bag; rows without geometry are emitted as features with `geometry: null`.

A ready-made [`examples/oereb-beispiel.csv`](examples/oereb-beispiel.csv) (linked in the upload view) demonstrates the format, including a not-found and a missing-EGRID row.

## Running locally

No build step. Serve the repo root with any static file server, then open `/oereb-search/`:

```bash
python -m http.server 8000   # → http://localhost:8000/oereb-search/
npx serve .
```

## Layout

```
oereb-search/
├── index.html
├── css/style.css
├── js/
│   ├── app.js               # Search mask: results, detail, mode toggle
│   ├── batch.js             # Batch CSV: upload, mapping, processing, preview, download
│   ├── csv.js               # CSV parse/serialize + GeoJSON assembly
│   ├── oereb-api.js         # Shared API, area math, LV95→WGS84 reprojection
│   └── i18n.js              # Translations (DE / FR / IT)
├── examples/
│   └── oereb-beispiel.csv   # Sample batch input (used by the demo links)
├── scripts/
│   └── oereb.py             # Companion CLI: download XML ÖREB extracts per canton
└── assets/
    └── swiss-logo-flag.svg
```

## Companion script — `scripts/oereb.py`

A standalone Python utility for downloading raw XML ÖREB extracts directly from each canton's web service (independent of the browser app). Maps each canton to its official endpoint — see [www.cadastre.ch/de/oereb-webservice](https://www.cadastre.ch/de/oereb-webservice) for the source list.

```bash
pip install requests
python scripts/oereb.py
```

## Data source

| Source | Use |
|---|---|
| [swisstopo MapServer](https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.swisstopo-vd.stand-oerebkataster) | ÖREB layer (parcel geometry + metadata) |
| [Cantonal ÖREB web services](https://www.cadastre.ch/de/oereb-webservice) | Per-canton XML extracts (used by `scripts/oereb.py`) |

All swisstopo APIs are public and require no API key.

## License

[MIT](../LICENSE)
