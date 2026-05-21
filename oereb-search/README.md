# ÖREB Parcel Search

Browser tool to search the Swiss **ÖREB cadastre** by municipality, EGRID, parcel number, postcode, or canton. Built on the public [swisstopo ÖREB layer](https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.swisstopo-vd.stand-oerebkataster). Part of the [`geo-check`](../README.md) repo.

## Live app

https://bbl-dres.github.io/geo-check/oereb-search/

(Old bookmarks to `/app-oereb/` redirect here.)

## Features

- **Search** — municipality, EGRID, parcel number, PLZ, canton
- **Autocomplete** as you type
- **Area calculation** for selected parcels
- **Direct links** to official ÖREB extracts (PDF) for each parcel's canton
- **Multilingual UI** — DE / FR / IT

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
│   ├── app.js               # Search, results, detail, area calculation
│   └── i18n.js              # Translations (DE / FR / IT)
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
