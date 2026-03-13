# Geo-Check

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen?logo=github)](https://bbl-dres.github.io/geo-check/)
[![JavaScript](https://img.shields.io/badge/javascript-ES_modules-F7DF1E?logo=javascript&logoColor=000)](js/)
[![No Backend](https://img.shields.io/badge/backend-none-blue)](#privacy)
[![License: Swiss Federal](https://img.shields.io/badge/org-Swiss_Federal_Admin-d8232a)](https://www.bbl.admin.ch/)
[![MapLibre](https://img.shields.io/badge/map-MapLibre_GL-396CB2?logo=maplibre&logoColor=fff)](https://maplibre.org/)
[![GWR API](https://img.shields.io/badge/data-swisstopo_GWR_API-1a365d)](https://api3.geo.admin.ch)

**Swiss building data quality tool** by [Bundesamt für Bauten und Logistik (BBL)](https://www.bbl.admin.ch/)

Verify your building records against the official [Gebäude- und Wohnungsregister (GWR)](https://www.housing-stat.ch/) — identify mismatches, download enriched results, fix your source data, and re-upload to improve quality iteratively.

**[Open Geo-Check](https://bbl-dres.github.io/geo-check/)** · [Prototype (v1)](https://bbl-dres.github.io/geo-check/prototype1) · [Specification](docs/SPECIFICATION.md)

![Geo-Check — Results view with map, summary panel, and data table](assets/Preview1.jpg)

---

## How It Works

```
Upload CSV/XLSX  ──>  Enrich vs. GWR  ──>  Review (Map + Table)  ──>  Download
      ^                                                                   │
      └──────────────────  Fix source data  <─────────────────────────────┘
```

1. **Upload** a CSV or Excel file with your building data (requires `internal_id` and `egid` columns)
2. **Enrich** — each EGID is looked up against the public GWR API; address, coordinates, building type, and more are compared and scored (0–100)
3. **Review** — explore results on an interactive map with color-coded markers and a sortable, filterable table
4. **Download** — export enriched results as CSV, Excel, or GeoJSON
5. **Fix & repeat** — correct mismatches in your source file and re-upload to verify improvements

## Key Features

- **Interactive map** — MapLibre GL with CARTO basemaps (Positron, Dark Matter, Voyager) and Swisstopo aerial imagery; location search via swisstopo SearchServer
- **Results table** — sortable, filterable, paginated; confidence presets (High / Medium / Low); clickable badges to filter by match result; column visibility toggle
- **Match scoring** — weighted comparison across street, house number, ZIP, city, canton, building type, and coordinates with confidence classification
- **GWR code resolution** — integer codes (building category, class, status, heating, etc.) resolved to multilingual labels (DE / FR / IT)
- **Export formats** — CSV (semicolon, UTF-8 BOM), Excel (results + summary sheets), GeoJSON
- **Multilingual** — DE, FR, IT, EN interface

## Privacy

All processing happens in the browser. No data is uploaded to any server.

- No backend, no database, no cookies, no analytics
- Only the EGID (a public building identifier) is sent to the GWR API
- Nothing persists between sessions — close the tab and data is gone

## Technology

| Concern | Technology |
|---------|-----------|
| Framework | Vanilla JS (ES modules) — no build step |
| CSV parsing | [Papa Parse](https://www.papaparse.com/) via CDN |
| Excel parsing & export | [SheetJS](https://sheetjs.com/) via CDN |
| Map | [MapLibre GL JS](https://maplibre.org/) |
| Basemaps | [CARTO](https://carto.com/) (free, no API key) |
| GWR data | [swisstopo API](https://api3.geo.admin.ch) (public, no API key) |
| Design | CSS custom properties (design tokens) |

## File Structure

```
geo-check/
├── index.html              # Single-page application
├── css/
│   ├── tokens.css          # Design tokens (colors, spacing, typography)
│   └── styles.css          # Component styles
├── js/
│   ├── main.js             # App state machine (upload → processing → results)
│   ├── upload.js           # File parsing, column detection, mapping UI
│   ├── processor.js        # GWR API calls, batching, match scoring
│   ├── map.js              # MapLibre GL map, markers, popups
│   ├── table.js            # Results table, sorting, filtering, pagination
│   ├── export.js           # CSV, XLSX, GeoJSON generation
│   ├── gwr-codes.js        # Code → label resolution
│   └── utils.js            # String similarity, helpers
├── data/
│   └── gwr-codes.json      # GWR code tables (DE/FR/IT)
├── assets/
│   ├── demo-buildings.csv   # Sample data for testing
│   ├── GWR Codes.xlsx       # Source for gwr-codes.json
│   └── swiss-logo-flag.svg  # Branding
└── docs/
    └── SPECIFICATION.md     # Full specification
```

No `node_modules`, no `package.json`, no build step. All dependencies loaded via CDN.

## Running Locally

Serve the project root with any static file server:

```bash
# Python
python -m http.server 8000

# Node.js (npx)
npx serve .

# VS Code
# Install "Live Server" extension, right-click index.html → Open with Live Server
```

Then open `http://localhost:8000` in your browser.

## Input Format

Upload a CSV or Excel file with these columns:

| Column | Required | Example |
|--------|----------|---------|
| `internal_id` | Yes | `SAP-4821` |
| `egid` | Yes | `1755615` |
| `street` | No | `Bahnhofstrasse` |
| `street_number` | No | `12` |
| `zip` | No | `8001` |
| `city` | No | `Zürich` |
| `region` | No | `ZH` |
| `building_type` | No | `1020` |
| `latitude` | No | `47.3769` |
| `longitude` | No | `8.5417` |
| `country` | No | `CH` |
| `comment` | No | `Check roof area` |

Column headers are matched case-insensitively with common aliases (e.g., `plz` → `zip`, `hausnummer` → `street_number`). A sample file is available at [assets/demo-buildings.csv](assets/demo-buildings.csv).

## API

Geo-Check uses two public swisstopo endpoints (no API key required):

| Endpoint | Purpose |
|----------|---------|
| [`MapServer/find`](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=1231641&returnGeometry=true&contains=false&sr=4326) | EGID → building data lookup |
| [`SearchServer`](https://api3.geo.admin.ch/rest/services/ech/SearchServer?searchText=Bern&type=locations&sr=4326&limit=5) | Location search for map navigation |

## License

This project is developed by the [Bundesamt für Bauten und Logistik (BBL)](https://www.bbl.admin.ch/) of the Swiss Federal Administration.
