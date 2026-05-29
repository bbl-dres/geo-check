# Geo-Check

![Social Media Preview](assets/social-preview.jpg)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?logo=github)](https://bbl-dres.github.io/geo-check/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![MapLibre GL JS](https://img.shields.io/badge/MapLibre_GL_JS-v4.7-396CB2?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![Swiss Federal Admin](https://img.shields.io/badge/org-Swiss_Federal_Admin-d8232a)](https://www.bbl.admin.ch/)

A collection of browser-based tools for working with Swiss building and parcel data — built around the official [Gebäude- und Wohnungsregister (GWR)](https://www.housing-stat.ch/), the [ÖREB cadastre](https://www.cadastre.ch/en/oereb.html), and swisstopo APIs. The repo holds **three independent apps**, each in its own folder with its own README.

## Apps

### GWR Validator (main app)

Verify your building records against the official GWR. Upload CSV/Excel, enrich each record against the public GWR API, review on map + table, export. All processing in the browser — no data leaves your device.
- Live app: https://bbl-dres.github.io/geo-check/gwr-check/
- Source code: [`gwr-check/`](gwr-check/)

<p align="center">
  <img src="assets/preview-gwr-check-1.jpg" width="90%"/>
</p>

---

### ÖREB Parcel Search

Search the Swiss ÖREB cadastre by municipality, EGRID, parcel number, PLZ, or canton. Autocomplete, area calculation, and direct links to official ÖREB extracts. Uses the [swisstopo ÖREB layer](https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.swisstopo-vd.stand-oerebkataster). Bundled with a companion Python script for raw XML extracts. Multilingual: DE / FR / IT.
- Live app: https://bbl-dres.github.io/geo-check/oereb-search/
- Source code: [`oereb-search/`](oereb-search/)

<p align="center">
  <img src="assets/preview-oereb-1.jpg" width="45%" style="vertical-align: top;"/>
  <img src="assets/preview-oereb-2.jpg" width="45%" style="vertical-align: top;"/>
</p>

---

### Data-Quality Prototype (depracated)

> [!CAUTION]
> This app is depracated, database is no longer online.

Project-management-style mockup for building-data quality workflows: multi-source validation (GEOREF / SAP RE-FX / GWR), confidence scoring across 5 dimensions, kanban with inline correction tracking, role-based auth (Supabase), and a Deno + Hono rule engine.
- Live app: https://bbl-dres.github.io/geo-check/prototype-quality/
- Source code: [`prototype-quality/`](prototype-quality/)

<p align="center">
  <img src="prototype-quality/assets/preview1.jpg" width="90%"/>
</p>

## Running locally

No build step (the prototype's backend needs Deno — see its README). From the repo root:

```bash
# Python
python -m http.server 8000

# Node
npx http-server

# PHP
php -S localhost:8000
```

Then open <http://localhost:8000/>. The root redirects to the main app; each app lives at its own path (e.g. `/oereb-search/`).

## Deployment

**GitHub Pages:** push to `main` deploys automatically. Old bookmarks for `/app-oereb/` and `/prototype-pm/` keep working via redirect stubs.

## License

[MIT](LICENSE) — developed by the [Bundesamt für Bauten und Logistik (BBL)](https://www.bbl.admin.ch/) of the Swiss Federal Administration.
