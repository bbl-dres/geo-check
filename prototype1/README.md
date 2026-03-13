# Geo-Check

A prototype web application for validating and managing property data.

> [!CAUTION]
> **This is an unofficial mockup for demonstration purposes only.**
> All data is fictional. Not all features are fully functional. This project serves as a visual and conceptual prototype — it is not intended for production use.

**Live Demo:** https://bbl-dres.github.io/geo-check/

![Preview](assets/preview1.jpg)

## Features

### Map View
- Interactive map with Swiss federal buildings (Mapbox GL JS)
- Multiple basemap options (swisstopo, OpenStreetMap, Orthofoto)
- WMS layer overlays (Cadastral parcels, Administrative boundaries)
- Location search via swisstopo API
- Click-to-identify building information

### Data Table
- Searchable and sortable building list
- Row selection with checkboxes
- Configurable page size (100, 500, 1000)
- Export to CSV, XLSX (all or selected)

### Kanban Board
- Task management with drag-and-drop
- Status columns: Backlog, In Bearbeitung, Abklärung, Erledigt
- Filter by priority, canton, confidence, assignee

### Detail Panel
- Building metadata and confidence scores
- Data source comparison (GEOREF, SAP, GWR, ADDRESS)
- Inline editing with correction tracking
- Comments and event history
- Image carousel with upload

### Validation Rules
- Automated data quality checks via rule engine
- Configurable rule severity levels (error, warning, info)
- Confidence scoring across 5 dimensions
- Swagger UI API documentation

### Authentication
- Email + password authentication via Supabase Auth
- Role-based access (Admin, Bearbeiter, Leser)
- Admin user invitation flow

## Tech Stack

| Layer    | Technology                                |
|----------|-------------------------------------------|
| Frontend | Vanilla JavaScript (ES6 Modules)          |
| Maps     | Mapbox GL JS v3.3.0                       |
| Charts   | ApexCharts v5.3.6                         |
| Icons    | Lucide Icons v0.563.0                     |
| Export   | SheetJS/XLSX v0.18.5 (on-demand)          |
| Auth/DB  | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Backend  | Deno + Hono (TypeScript)                  |
| CI/CD    | GitHub Actions                            |
| Styling  | Custom CSS with design tokens             |

## Project Structure

```
geo-check/
├── index.html              # Single-page application
├── css/
│   ├── tokens.css          # Design tokens (colors, spacing, fonts)
│   └── styles.css          # Component styles
├── js/
│   ├── main.js             # App entry point & orchestration
│   ├── state.js            # Global state & filtering
│   ├── map.js              # Mapbox GL integration
│   ├── detail-panel.js     # Building detail sidebar
│   ├── data-table.js       # Table view with pagination
│   ├── kanban.js           # Kanban board & drag-drop
│   ├── statistics.js       # Charts & statistics
│   ├── auth.js             # Supabase authentication
│   ├── supabase.js         # Database queries
│   ├── search.js           # Swisstopo location search
│   ├── icons.js            # Lucide icon rendering
│   └── xlsx-loader.js      # On-demand XLSX library loader
├── backend/                # Deno rule engine API
│   ├── deno.json           # Deno config & tasks
│   └── app/
│       ├── main.ts         # Server entry point
│       ├── config.ts       # Environment configuration
│       ├── db.ts           # Supabase database client
│       ├── models.ts       # TypeScript type definitions
│       ├── engine/         # Rule registry, runner, confidence
│       ├── rules/          # Validation rule definitions
│       ├── routes/         # HTTP route handlers
│       └── geo/            # Swisstopo geocoding client
├── supabase/
│   ├── config.toml         # Supabase project config
│   └── functions/          # Edge Functions (invite-user, rule-engine)
├── docs/                   # DATABASE.md, EDGE-FUNCTIONS.md, RULES.md
├── scripts/                # FME workspace for data upsert
└── data/                   # Rule configuration (rules.json)
```

## Getting Started

### Frontend

Serve the files with any static web server:

```bash
# Node.js
npx serve

# Python
python -m http.server 8000
```

Open http://localhost:8000

### Backend (Rule Engine)

Requires [Deno](https://deno.land/):

```bash
cd backend
deno task dev    # development with watch mode (port 8787)
deno task start  # production
```

**Environment variables:**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (required, no fallback)
- `PORT` — Server port (default: 8787)

### Edge Functions

Deployed automatically via GitHub Actions on push to `main` (when `supabase/functions/**` changes).

For local development with [Supabase CLI](https://supabase.com/docs/guides/cli):
```bash
supabase functions serve
```

## Configuration

The application uses:
- **Swisstopo APIs** for base maps, WMS overlays, and location search (no API key required)
- **Mapbox GL JS** for interactive mapping (access token in `js/map.js`)
- **Supabase** for authentication, database, storage, and realtime subscriptions

## Browser Support

Modern browsers with ES Module support:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+

## License

> [!CAUTION]
> **This is an unofficial mockup for demonstration purposes only.**
> All data is fictional. Not all features are fully functional. This project serves as a visual and conceptual prototype — it is not intended for production use.
