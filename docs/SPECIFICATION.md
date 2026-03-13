# Geo-Check v2 — Specification

> **Status:** Draft · **Date:** 2026-03-13
> **Goal:** Replace the prototype with a zero-backend, zero-login building data quality tool that runs entirely in the browser.

---

## 1. Problem Statement

Organizations managing Swiss building portfolios need to verify that their internal records (from SAP, Excel exports, etc.) match the official Gebäude- und Wohnungsregister (GWR). The prototype solved this with a full-stack app (Supabase, Deno backend, auth, kanban, rule engine). User feedback and compliance requirements demand a radically simpler approach:

- **No backend** — all processing happens client-side. No data leaves the browser except for calls to the public GWR API.
- **No login** — no user accounts, no stored data. Upload, process, download, done.
- **No persistence** — nothing is saved between sessions. The browser tab is the session.

---

## 2. Core Workflow

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────────┐
│  Upload   │ ──▸ │  Process   │ ──▸ │  Review Map  │ ──▸ │   Download   │
│  CSV/XLSX │     │  vs. GWR   │     │  + Table     │     │  CSV/XLSX/   │
│           │     │            │     │              │     │  GeoJSON     │
└──────────┘     └───────────┘     └──────────────┘     └──────────────┘
```

**One direction. No side quests.**

---

## 3. Input Format

Users upload a **CSV** or **Excel (.xlsx)** file. The app accepts the following columns (header names are matched case-insensitively and with common aliases):

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| `internal_id` | yes | Organization's internal building identifier | `SAP-4821` |
| `egid` | yes | Federal building identifier (EGID) | `1755615` |
| `latitude` | no | WGS84 latitude | `47.3769` |
| `longitude` | no | WGS84 longitude | `8.5417` |
| `building_type` | no | Building category code or description | `1020` |
| `country` | no | Country code | `CH` |
| `region` | no | Canton abbreviation | `ZH` |
| `city` | no | City / locality name | `Zürich` |
| `zip` | no | Postal code | `8001` |
| `street` | no | Street name | `Bahnhofstrasse` |
| `street_number` | no | House number | `12` |
| `comment` | no | Free-text note (passed through, not processed) | `Check roof area` |

### Column Matching

The app will attempt to match uploaded column headers to the expected schema using:
1. Exact match (case-insensitive)
2. Common aliases (e.g., `egid` ↔ `EGID` ↔ `gwr_id` ↔ `federal_id`; `zip` ↔ `plz` ↔ `postal_code` ↔ `npa`; `street_number` ↔ `hausnummer` ↔ `house_number` ↔ `deinr`)
3. A mapping UI lets the user manually assign columns if auto-detection fails

Rows with an empty or non-numeric `egid` are flagged as "skipped" and included in the output with an error note, but not sent to the API.

---

## 4. Processing

### 4.1 GWR API Lookup

For each valid EGID, the app calls the **public swisstopo MapServer** endpoint:

```
GET https://api3.geo.admin.ch/rest/services/ech/MapServer/find
  ?layer=ch.bfs.gebaeude_wohnungs_register
  &searchField=egid
  &searchText={egid}
  &returnGeometry=true
  &contains=false
  &sr=4326
```

**No API key required.** This is a public Swiss federal API.

**Example response** (abbreviated, EGID 1231641):

```json
{
  "results": [{
    "featureId": "1231641_0",
    "geometry": { "x": 7.430877, "y": 46.958232, "spatialReference": { "wkid": 4326 } },
    "attributes": {
      "egid": "1231641",
      "egrid": "CH251146763508",
      "strname": ["Beaulieustrasse"],       // array (multilingual)
      "strnamk": ["Beaulieustr."],           // abbreviated form
      "deinr": "2",                          // house number (string)
      "strname_deinr": "Beaulieustrasse 2",  // combined label
      "dplz4": 3012,                         // postal code (integer)
      "dplzname": "Bern",                    // city name
      "ggdename": "Bern",                    // municipality
      "ggdenr": 351,                         // BFS municipality number
      "gdekt": "BE",                         // canton
      "gkat": 1020,                          // building category (integer code)
      "gklas": 1122,                         // building class (integer code)
      "gstat": 1004,                         // building status (integer code)
      "gbauj": null,                         // construction year (often null)
      "gbaup": 8012,                         // construction period code
      "garea": 174,                          // building area m² (integer)
      "gastw": 4,                            // number of floors
      "ganzwhg": 10,                         // number of dwellings
      "gkode": 2599407.817,                  // Swiss LV95 easting
      "gkodn": 1200797.593,                  // Swiss LV95 northing
      "label": "Beaulieustrasse 2"
    }
  }]
}
```

> Note: `strname` is an **array** (supports multilingual street names). `deinr` is a separate string field for the house number. `dplz4` is an integer. `gkat`/`gklas`/`gstat` are integer codes. `gbauj` (construction year) is often null — `gbaup` (construction period) is more reliable.

**Response fields used:**

| API field | Type | Mapped to | Description |
|-----------|------|-----------|-------------|
| `egid` | string | `gwr_egid` | Confirmed EGID |
| `egrid` | string | `gwr_egrid` | Real estate identifier (EGRID) |
| `strname[0]` | string (from array) | `gwr_street` | Street name (first/primary language) |
| `deinr` | string | `gwr_street_number` | House number |
| `dplz4` | integer | `gwr_zip` | Postal code |
| `dplzname` | string | `gwr_city` | City / locality name |
| `ggdename` | string | `gwr_municipality` | Municipality name |
| `ggdenr` | integer | `gwr_municipality_nr` | BFS municipality number |
| `gdekt` | string | `gwr_region` | Canton abbreviation |
| `gkat` | integer | `gwr_building_type` | Building category code |
| `gklas` | integer | `gwr_building_class` | Building class code |
| `gstat` | integer | `gwr_status` | Building status code |
| `gbauj` | integer/null | `gwr_year_built` | Construction year (often null) |
| `gbaup` | integer | `gwr_construction_period` | Construction period code |
| `garea` | integer | `gwr_area` | Building footprint area (m²) |
| `gastw` | integer | `gwr_floors` | Number of floors |
| `ganzwhg` | integer | `gwr_dwellings` | Number of dwellings |
| `geometry.y` | float | `gwr_latitude` | WGS84 latitude (when `sr=4326`) |
| `geometry.x` | float | `gwr_longitude` | WGS84 longitude (when `sr=4326`) |

If the EGID is not found in GWR, the row is marked with `gwr_match = "not_found"`.

### 4.2 Rate Limiting & Batching

- Requests are sent sequentially or in small batches (max 5 concurrent) with a configurable delay (default: 100ms between batches) to respect the public API.
- A progress bar shows `processed / total` with estimated time remaining.
- The user can cancel processing at any time; already-processed rows are kept.

### 4.3 Match Scoring

After retrieving GWR data, the app computes a **match score (0–100%)** per building by comparing input columns against GWR values. Only columns that exist in both input and GWR are scored.

#### Field Comparisons

| Field pair | Method | Weight |
|-----------|--------|--------|
| `street` vs `gwr_street` | Normalized string similarity (lowercase, trim, remove common abbreviations like Str./Strasse) | 20% |
| `street_number` vs `gwr_street_number` | Exact match (after trimming) | 10% |
| `zip` vs `gwr_zip` | Exact match | 15% |
| `city` vs `gwr_city` | Normalized string similarity | 15% |
| `region` vs `gwr_region` | Exact match (case-insensitive) | 10% |
| `building_type` vs `gwr_building_type` | Exact code match | 10% |
| `latitude/longitude` vs `gwr_latitude/gwr_longitude` | Distance-based (100% if <50m, linear decay to 0% at >500m) | 20% |

**Scoring rules:**
- If a field is empty in the input, it is excluded from the score (weight redistributed proportionally).
- If the EGID is not found, score = 0%.
- Result column: `match_score` (integer 0–100).
- Per-field match result columns: `match_street`, `match_zip`, etc. with values `exact`, `similar`, `mismatch`, or `empty`.

---

## 5. Output Columns

The processed file contains **all original input columns** plus the following appended columns:

| Column | Description |
|--------|-------------|
| `gwr_egid` | EGID as confirmed by GWR |
| `gwr_egrid` | Real estate identifier (EGRID) from GWR |
| `gwr_street` | Street name from GWR (`strname[0]`) |
| `gwr_street_number` | House number from GWR (`deinr`) |
| `gwr_zip` | Postal code from GWR (`dplz4`) |
| `gwr_city` | City from GWR (`dplzname`) |
| `gwr_municipality` | Municipality from GWR (`ggdename`) |
| `gwr_municipality_nr` | BFS municipality number (`ggdenr`) |
| `gwr_region` | Canton from GWR (`gdekt`) |
| `gwr_building_type` | Building category code from GWR (`gkat`) |
| `gwr_building_class` | Building class code from GWR (`gklas`) |
| `gwr_status` | Building status code from GWR (`gstat`) |
| `gwr_year_built` | Construction year from GWR (`gbauj`, may be empty) |
| `gwr_construction_period` | Construction period code from GWR (`gbaup`) |
| `gwr_area` | Building footprint area in m² from GWR (`garea`) |
| `gwr_floors` | Number of floors from GWR (`gastw`) |
| `gwr_dwellings` | Number of dwellings from GWR (`ganzwhg`) |
| `gwr_latitude` | WGS84 latitude from GWR |
| `gwr_longitude` | WGS84 longitude from GWR |
| `match_score` | Overall match percentage (0–100) |
| `match_street` | Street comparison result |
| `match_street_number` | Street number comparison result |
| `match_zip` | Zip comparison result |
| `match_city` | City comparison result |
| `match_region` | Region comparison result |
| `match_building_type` | Building type comparison result |
| `match_coordinates` | Coordinate distance comparison result |
| `gwr_match` | Overall status: `matched`, `not_found`, `skipped` |

---

## 6. User Interface

### 6.1 Layout

Single page, three states:

```
┌─────────────────────────────────────────────────┐
│  [Logo]  Geo-Check          [Language: DE/FR/IT] │
├─────────────────────────────────────────────────┤
│                                                  │
│          State 1: UPLOAD                         │
│          State 2: PROCESSING                     │
│          State 3: RESULTS                        │
│                                                  │
├─────────────────────────────────────────────────┤
│  Footer: API info · Version · GitHub link        │
└─────────────────────────────────────────────────┘
```

### 6.2 State 1 — Upload

- Large drop zone (drag & drop or click to browse)
- Accepts `.csv` and `.xlsx` files
- After file selection:
  - Preview table showing first 5 rows
  - Column mapping UI (auto-detected columns highlighted, manual override via dropdowns)
  - Row count and detected columns summary
  - **"Start Processing"** button (disabled until `egid` column is mapped)

### 6.3 State 2 — Processing

- Progress bar with: `Building 42 of 1,230 — 3.4%`
- Estimated time remaining
- Live counter: `matched: 38 · not found: 3 · skipped: 1`
- **"Cancel"** button (keeps already-processed rows)
- Transitions automatically to Results when done

### 6.4 State 3 — Results

Split view:

```
┌──────────────────────────────────────────────────┐
│  Summary bar: 1,230 buildings · 89% matched ·    │
│  avg score: 74% · 42 not found · 8 skipped       │
├────────────────────────┬─────────────────────────┤
│                        │                          │
│       Map              │     Table (scrollable)   │
│   (interactive)        │     sortable, filterable  │
│                        │                          │
├────────────────────────┴─────────────────────────┤
│  [Download CSV] [Download XLSX] [Download GeoJSON]│
│  [Start New Check]                                │
└──────────────────────────────────────────────────┘
```

#### Map

- Base map: CARTO Positron via MapLibre GL JS (no API key required)
- Buildings plotted at GWR coordinates (fallback to input coordinates if GWR not found)
- Color coding by match score:
  - **Green** (≥80%): good match
  - **Yellow** (50–79%): partial match
  - **Red** (<50%): poor match
  - **Grey**: not found / skipped
- Click a marker → highlight row in table, show popup with key fields
- Clustering for large datasets (>500 buildings)

#### Table

- Sortable by any column, filterable by match status and free-text search
- Click a row → highlight marker on map
- Color-coded `match_score` cell and confidence label (same thresholds as map)
- **Column visibility**: users can show/hide columns via a "Spalten" dropdown in the toolbar
- Pagination (100 rows per page) for large datasets

##### Default visible columns

| Column | Label | Description |
|--------|-------|-------------|
| `internal_id` | ID | User's internal building ID |
| `gwr_egid` | EGID | Federal building identifier |
| `gwr_street` | Strasse (GWR) | Street name from GWR |
| `gwr_street_number` | Nr | House number from GWR |
| `gwr_zip` | PLZ (GWR) | Postal code from GWR |
| `gwr_city` | Ort (GWR) | City from GWR |
| `match_score` | Score | Overall match percentage (0–100%) |
| `confidence` | Konfidenz | Confidence label: Hoch (≥80%), Mittel (50–79%), Tief (<50%) |
| `gwr_match` | Status | Overall status: matched / not_found / skipped |

##### Hidden by default (toggle via column dropdown)

**GWR detail attributes:**

| Column | Label | Description |
|--------|-------|-------------|
| `gwr_region` | Kt | Canton abbreviation |
| `gwr_building_type` | Typ (GWR) | Building category code |
| `gwr_egrid` | EGRID | Real estate identifier |
| `gwr_municipality` | Gemeinde | Municipality name |
| `gwr_municipality_nr` | BFS-Nr | BFS municipality number |
| `gwr_building_class` | Gebäudeklasse | Building class code |
| `gwr_status` | Gebäudestatus | Building status code |
| `gwr_year_built` | Baujahr | Construction year |
| `gwr_construction_period` | Bauperiode | Construction period code |
| `gwr_area` | Fläche (m²) | Building footprint area |
| `gwr_floors` | Geschosse | Number of floors |
| `gwr_dwellings` | Wohnungen | Number of dwellings |
| `gwr_latitude` | Breite (GWR) | WGS84 latitude |
| `gwr_longitude` | Länge (GWR) | WGS84 longitude |

**Per-field match results:**

| Column | Label | Values |
|--------|-------|--------|
| `match_street` | Match Strasse | exact / similar / mismatch / empty |
| `match_street_number` | Match Nr | exact / mismatch / empty |
| `match_zip` | Match PLZ | exact / mismatch / empty |
| `match_city` | Match Ort | exact / similar / mismatch / empty |
| `match_region` | Match Kt | exact / mismatch / empty |
| `match_building_type` | Match Typ | exact / mismatch / empty |
| `match_coordinates` | Match Koord. | exact / similar / mismatch / empty |

### 6.5 Responsive Behavior

- Desktop (>1024px): side-by-side map + table
- Tablet (768–1024px): stacked map on top, table below
- Mobile (<768px): tab toggle between map and table

---

## 7. Export Formats

### 7.1 CSV

- UTF-8 with BOM (for Excel compatibility)
- Semicolon delimiter (`;`) — standard in Swiss/German locale
- All input + output columns

### 7.2 Excel (.xlsx)

- Sheet 1 "Results": all input + output columns
- Conditional formatting on `match_score` column (green/yellow/red)
- Sheet 2 "Summary": key statistics (total, matched, not found, avg score, per-canton breakdown)
- Generated client-side with SheetJS

### 7.3 GeoJSON

- FeatureCollection with one Feature per building
- Geometry: Point (longitude, latitude) from GWR (fallback to input)
- Properties: all output columns
- Buildings without any coordinates are excluded (noted in export dialog)

---

## 8. Technology Stack

| Concern | Technology | Rationale |
|---------|-----------|-----------|
| Framework | Vanilla JS (ES6 modules) | No build step, no dependencies to audit, same as prototype |
| File parsing | [Papa Parse](https://www.papaparse.com/) (CSV) + [SheetJS](https://sheetjs.com/) (XLSX) | Battle-tested, client-side, MIT licensed |
| Map | [MapLibre GL JS](https://maplibre.org/) + CARTO Positron | Free, no API key, vector basemap |
| String matching | Custom (Levenshtein / Jaro-Winkler) | ~50 lines of code, no library needed |
| Excel export | SheetJS (write mode) | Already used in prototype |
| Styling | CSS custom properties (design tokens) | Carry over design system from prototype |
| Icons | [Lucide](https://lucide.dev/) | Lightweight, already in use |

### No Backend Required

All API calls go directly from the browser to `api3.geo.admin.ch`. This API:
- Is public (no API key)
- Supports CORS
- Returns JSON
- Has no documented rate limits (but we throttle to be respectful)

---

## 9. Privacy & Compliance

- **No data storage**: uploaded files are parsed into memory and discarded when the tab closes.
- **No cookies or tracking**: no analytics, no third-party scripts beyond map tiles.
- **No backend**: no server logs, no database, no infrastructure to secure.
- **API calls**: only the EGID (a public identifier) is sent to the GWR API. No personal data, no internal IDs, no addresses are transmitted.
- **CSP**: no CSP meta tag — external resources (CARTO basemap, CDN scripts, Google Fonts) loaded directly.
- **Offline-capable**: once loaded, the app works offline except for GWR API calls and map tiles. Could be packaged as a downloadable HTML file for air-gapped environments.

---

## 10. Non-Goals (Explicitly Out of Scope)

These features from the prototype are **intentionally removed**:

- ~~User authentication / login~~ — not needed
- ~~Database / persistence~~ — session only
- ~~Backend API / rule engine~~ — processing is client-side
- ~~Kanban board / task management~~ — not a workflow tool
- ~~Comments / events / audit log~~ — no collaboration
- ~~Detail panel with edit mode~~ — read-only results
- ~~Confidence scoring (5 dimensions)~~ — replaced by simple match score
- ~~Statistics dashboard~~ — summary bar is sufficient
- ~~Multi-user / roles~~ — single user, no auth
- ~~Image uploads~~ — not relevant
- ~~Supabase / Edge Functions~~ — no backend
- ~~Mapbox~~ — replaced by free MapLibre GL JS + CARTO Positron

---

## 11. File Structure (Planned)

```
geo-check/
├── index.html              # Single-page application
├── css/
│   ├── tokens.css          # Design tokens (colors, spacing, typography)
│   └── styles.css          # Component styles
├── js/
│   ├── main.js             # App state machine (upload → processing → results)
│   ├── upload.js            # File parsing, column detection, mapping UI
│   ├── processor.js         # GWR API calls, batching, match scoring
│   ├── map.js               # MapLibre GL map, markers, popups
│   ├── table.js             # Results table, sorting, filtering
│   ├── export.js            # CSV, XLSX, GeoJSON generation
│   └── utils.js             # String similarity, helpers
├── assets/
│   └── swiss-logo-flag.svg  # Branding
├── docs/
│   └── SPECIFICATION.md     # This file
└── README.md
```

No `node_modules`, no `package.json`, no build step. All dependencies loaded via CDN with SRI hashes.

---

## 12. Open Questions

1. **Map provider**: Swisstopo WMTS is free but only covers Switzerland. Do we need a fallback for buildings with coordinates outside CH? (Likely not — GWR is CH-only.)
2. **Batch size**: What's a practical limit? 10,000 buildings at ~100ms per request ≈ 17 minutes. Should we warn for files >5,000 rows?
3. **GWR code labels**: Should we resolve `gkat=1020` to "Einfamilienhaus" in the output, or keep raw codes? Recommendation: add a `gwr_building_type_label` column with the German label.
4. **Multi-language**: The prototype is German-only. Should v2 support FR/IT given the Swiss context? Low effort if we externalize strings from the start.
5. **Downloadable version**: Should we offer a single-file HTML download for offline/air-gapped use? The only barrier is CDN dependencies — we could inline them.
