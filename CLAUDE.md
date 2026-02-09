# CLAUDE.md - Geo-Check Codebase Guide

## Project Overview

**Geo-Check** is a Swiss federal building data quality tool (BBL). It validates building records by comparing GEOREF, SAP RE-FX, and GWR data sources, computing confidence scores, and tracking corrections.

**Language:** German UI, Swiss locale (`de-CH`). **License:** MIT.

## Architecture

Three layers:

1. **Frontend SPA** (`index.html` + `js/`) — Vanilla ES6 modules, no build step. Talks to Supabase directly for auth/data.
2. **Supabase** — PostgreSQL with RLS, Auth, Storage (`building-images` bucket), Realtime, Edge Functions.
3. **Backend API** (`backend/`) — Deno + Hono rule engine. Runs validation rules against buildings and writes results to Supabase.

### Key Directories

```
js/                     # Frontend ES6 modules (12 files)
  main.js               # App init, tab switching, orchestration
  state.js              # Centralized state, filters, escapeHtml()
  map.js                # Mapbox GL JS integration
  detail-panel.js       # Building detail sidebar (edit mode, data comparison)
  data-table.js         # Paginated table view
  kanban.js             # Drag-drop kanban board
  statistics.js         # ApexCharts dashboards
  auth.js               # Supabase Auth (email+password, invite flow)
  supabase.js           # Supabase client, all DB queries
  search.js             # Swisstopo location search
  icons.js              # Batched Lucide icon refresh
  xlsx-loader.js        # On-demand SheetJS loading for export
backend/                # Deno + Hono rule engine API (TypeScript)
  app/main.ts           # Server entry point (port 8787)
  app/config.ts         # Environment config (SUPABASE_URL, SERVICE_ROLE_KEY)
  app/db.ts             # Supabase client for backend
  app/engine/           # Rule registry, runner, confidence scoring
  app/rules/            # Rule definitions (address, geometry, identification)
  app/routes/           # HTTP routes (health, check, rules)
supabase/
  config.toml           # Edge function config (verify_jwt = false)
  functions/invite-user/ # Admin-only user invitation (service role key)
  functions/rule-engine/ # Edge function mirror of backend rule engine
docs/                   # DATABASE.md (schema), EDGE-FUNCTIONS.md, RULES.md
scripts/Upsert.fmw      # FME workspace for bulk data upsert
data/                   # Demo/fallback JSON files (not used when Supabase is connected)
```

## Running

```bash
# Frontend — any static server
npx serve                    # or: python -m http.server 8000

# Backend rule engine
cd backend && deno task dev  # watch mode, port 8787

# Edge functions (requires Supabase CLI)
supabase functions serve
```

**Required env vars for backend:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (no fallback — app throws if missing).

## Tech Stack

| Layer    | Technology                                |
|----------|-------------------------------------------|
| Frontend | Vanilla JS (ES6 modules), no framework    |
| Maps     | Mapbox GL JS v3.3.0                       |
| Charts   | ApexCharts v5.3.6 (CDN)                   |
| Icons    | Lucide v0.563.0 (CDN)                     |
| Export   | SheetJS/XLSX v0.18.5 (CDN, lazy-loaded)   |
| Auth/DB  | Supabase JS v2.95.3 (CDN)                 |
| Backend  | Deno + Hono v4.6.0 (TypeScript)           |
| Database | Supabase PostgreSQL with RLS              |
| CI/CD    | GitHub Actions (edge function deploy)     |
| ETL      | FME (scripts/Upsert.fmw)                 |

## Data Model

**Three-Value Pattern (TVP):** Every building field stores `{sap, gwr, korrektur, match}` as JSONB. Canonical value: `korrektur > gwr > sap`. See `docs/DATABASE.md` for full schema.

**Building object** has ~50 TVP fields across: address, identifiers (egid, egrid), classification (gkat, gklas), measurements (garea, parcel_area), and coordinates.

**Confidence scoring** (0-100%) weighs 5 dimensions: Identifikation 30%, Adresse 30%, Lage 20%, Klassifikation 10%, Bemessungen 10%.

## State Management (`js/state.js`)

Centralized `state` object with filters. Modules communicate via callbacks set in `main.js`:
```javascript
setKanbanCallbacks({ onSelectBuilding, onDataChange });
setDetailPanelCallbacks({ onStatusChange, onAssigneeChange });
```

**URL sync:** All filters serialize to URL params (`?tab=karte&id=...&kanton=TG,ZH`). `pushState()` on change, `parseURL()` on load.

## Security Conventions

- **HTML escaping:** Always use `escapeHtml()` (exported from `state.js`) when inserting DB values into innerHTML/template literals. This applies to data attributes too.
- **CSP:** Meta tag in `index.html`. `unsafe-eval` kept for ApexCharts; `unsafe-inline` in `style-src` only (Mapbox needs it).
- **SRI:** All CDN scripts have `integrity` + `crossorigin="anonymous"` attributes — including dynamically loaded scripts (`xlsx-loader.js`).
- **Backend errors:** Never expose raw `Error.message` in API responses. Log details server-side, return generic German messages to clients.
- **Supabase keys:** Anon key is safe for client. Service role key is backend-only (no empty fallback).

## CSS Design Tokens (`css/tokens.css`)

Key colors: `--swiss-red: #d8232a`, `--federal-blue: #1a365d`, `--color-critical/warning/success` for confidence levels. Source colors: `--type-geo` (indigo), `--type-sap` (cyan), `--type-gwr` (green).

Responsive breakpoints at bottom of `styles.css`: 1440px, 1280px, 1024px, **900px** (key: kanban stacks, panel repositions), 600px.

## Common Patterns

- **Lucide icons:** Call `scheduleLucideRefresh()` (from `icons.js`) after any DOM update that adds `data-lucide` elements. It batches via `requestAnimationFrame`.
- **Tab switching:** Map tab = no body scroll; other tabs (`statistik`, `aufgaben`, `settings`) = page scroll via `.page-scroll-tab` class.
- **Chart filters:** `chartFilters` state is isolated from main filters. Click chart segments to filter, "Zurücksetzen" to clear.
- **Supabase SDK:** Loaded via CDN `<script>`, not import. Access via `window.supabase` in `supabase.js`.

## Deployment

- **Frontend:** GitHub Pages at `https://bbl-dres.github.io/geo-check/`
- **Edge functions:** Auto-deployed on push to `main` when `supabase/functions/**` changes (`.github/workflows/deploy-edge-functions.yml`)
- **Backend API:** Manual deployment (Deno runtime)

## Testing

No automated tests. Manual testing checklist:
1. All tabs and filters work
2. URL state persists across refresh/back/forward
3. Kanban drag-drop updates status
4. Chart click filtering
5. Responsive layout at 900px breakpoint
6. Detail panel edit mode + save
