# GWR Building Search

Browser tool to search the Swiss **GWR** (Federal Register of Buildings and Dwellings — *Gebäude- und Wohnungsregister* / RegBL / REA) by EGID, address, municipality, postcode, BFS number, or canton. Built on the public [swisstopo GWR layer](https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register). Part of the [`geo-check`](../README.md) repo, and a sibling of [`oereb-search`](../oereb-search/) — same UI, different register.

## Live app

<https://bbl-dres.github.io/geo-check/gwr-search/>

## How it works

1. **Search** — enter any combination of EGID, street, municipality, PLZ, BFS number, or canton (search mask), or upload a CSV of EGIDs (batch mode).
2. **Look up** — each query hits the public swisstopo GWR layer; GWR features are points, so the geometry comes back inline (no second per-feature request).
3. **Review** — matches land in a results table; click a row for the full building profile, resolved codes, dwellings, and an embedded map.
4. **Download** *(batch)* — export every input row, including not-found/error, as CSV or GeoJSON.

## Features

- **Two modes** — an interactive **search mask** (default) and a **batch CSV** lookup
- **Search** — EGID, street name, street number, municipality, PLZ, BFS number, canton (combined via intersection)
- **Autocomplete** as you type (municipality, PLZ)
- **Full building profile** — the detail panel mirrors the official GWR detail page, grouped into sections (Gebäude / Heizung & Warmwasser / Eingang & Adresse / Wohnungen): identification, parcel, classification, life-cycle, structure, dimensions, heating & hot-water systems, and entrance/address
- **Dwellings table** — every dwelling (Wohnung) in the building, with floor, position, status, year, area, rooms and kitchen
- **Coordinates** — LV95 (E, N) and WGS84 (Lat, Lon), each comma-joined for one-click copy-paste
- **Resolved codes** — all coded GWR fields (category, class, status, period, floor, dwelling status, kitchen, heating/energy, …) shown as readable DE/FR/IT labels (raw code in the tooltip), via the BFS Merkmalskatalog tables in [`data/gwr-codes.json`](data/gwr-codes.json)
- **Embedded map** centred on the building, with a **background switcher** (colour / grey / aerial / OpenData-AV) and the official GWR building-status **legend**, plus an "open in swisstopo map" link with a marker at the building
- **Direct links** — the official GWR online entry ([housing-stat.ch](https://www.housing-stat.ch/de/home.html)), the ÖREB extract (via the building's EGRID), and the swisstopo map viewer
- **Multilingual UI** — DE / FR / IT

## Batch search (CSV)

Switch to the **Batch (CSV)** tab to look up many buildings at once:

1. **Upload** a CSV (drag-and-drop or picker). Only an **EGID** column is required — a column literally named `egid` is auto-detected, otherwise you pick which column holds the EGID.
2. Each EGID is looked up against the GWR layer (5 parallel requests, retries on transient errors, in-session dedup cache, cancellable).
3. The **found buildings appear in the same results table as the search mask** (EGID · Adresse · Gemeinde · Gebäudekategorie · Status) — click a row for the full detail panel with map and official links. It's the same view, just a different input method.
4. **Download** the complete results — every input row, including not-found/error — as **CSV** or **GeoJSON**. The CSV is **Excel-ready**: it opens straight into columns on a double-click (UTF-8 with a `sep=;` hint), so there's no import wizard and umlauts/accents stay intact.

**Column contract — no joins needed afterwards.** Every column you upload is preserved with an **`IN_`** prefix; every looked-up field is added with an **`OUT_`** prefix (`OUT_RESULT`, `OUT_ADRESSE`, `OUT_GEMEINDE`, `OUT_KATEGORIE`, `OUT_FLAECHE_M2`, …). Coded GWR fields are written twice — a readable label (`OUT_KATEGORIE`) and the raw integer (`OUT_KATEGORIE_CODE`). `OUT_RESULT` is one of `found` / `not_found` / `error`, so failed rows still carry your original data. The GeoJSON is **WGS84 (EPSG:4326)** Points with the same `IN_`/`OUT_` property bag; rows without geometry are emitted as features with `geometry: null`.

A ready-made [`examples/gwr-beispiel.csv`](examples/gwr-beispiel.csv) (linked in the upload view) demonstrates the format, including a not-found and a missing-EGID row.

## Differences from `oereb-search`

This app shares its structure with [`oereb-search`](../oereb-search/) but targets a different register:

| | oereb-search | gwr-search |
|---|---|---|
| Layer | `ch.swisstopo-vd.stand-oerebkataster` | `ch.bfs.gebaeude_wohnungs_register` |
| Key | EGRID (`CH`+12 chars) | EGID (positive integer) |
| Geometry | Polygon (area via shoelace) | Point (footprint is the `garea` attribute) |
| Coded fields | — | Building category/class/status/period/heating resolved via `gwr-codes.json` |

Because GWR features are points, `find` returns the geometry inline — there is no second per-feature request, and no polygon/area math (hence no `geometry.js`).

## Running locally

No build step. Serve the repo root with any static file server, then open `/gwr-search/`:

```bash
python -m http.server 8000   # → http://localhost:8000/gwr-search/
npx serve .
```

## Layout

```
gwr-search/
├── index.html
├── css/style.css
├── js/
│   ├── app.js               # Search mask: results, detail, mode toggle
│   ├── batch.js             # Batch CSV: upload, mapping, processing, preview, download
│   ├── csv.js               # CSV parse/serialize + GeoJSON assembly
│   ├── gwr-api.js           # Shared API, point geometry, LV95→WGS84 reprojection
│   ├── gwr-codes.js         # GWR integer-code → DE/FR/IT label resolution
│   └── i18n.js              # UI translations (DE / FR / IT)
├── data/
│   └── gwr-codes.json       # GWR code tables (from the sister gwr-check tool)
├── examples/
│   └── gwr-beispiel.csv     # Sample batch input (used by the demo links)
└── assets/
    └── swiss-logo-flag.svg
```

## Tech stack

Vanilla JavaScript (ES6 modules), no build step and no external JS libraries — just the public swisstopo REST API. The map is the embedded swisstopo map viewer.

## Data sources

| Source | Use |
|---|---|
| [swisstopo MapServer](https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register) | GWR layer (building geometry + attributes) |
| [swisstopo SearchServer](https://api3.geo.admin.ch/rest/services/ech/SearchServer) | Municipality / PLZ autocomplete |
| BFS Merkmalskatalog | GWR code → label tables (`data/gwr-codes.json`) — see [housing-stat.ch](https://www.housing-stat.ch/de/help/42.html) |

All swisstopo APIs are public and require no API key.

## License

[MIT](../LICENSE)
