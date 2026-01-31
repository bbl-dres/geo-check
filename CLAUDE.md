# CLAUDE.md - Geo-Check Codebase Guide

This document provides comprehensive information for developers and AI assistants working with the geo-check codebase.

## Project Overview

**Geo-Check** is a Swiss federal building data quality management tool. It helps validate and correct building records by comparing data from multiple sources (GEOREF, SAP RE-FX, GWR).

**Key Users:** Project managers tracking data quality initiative progress

**Language:** German UI, Swiss locale formatting (`de-CH`)

---

## Project Structure

```
geo-check/
├── index.html              # Single-page application (all HTML)
├── css/
│   ├── tokens.css          # Design system tokens
│   └── styles.css          # Component styles (~4,800 lines)
├── js/
│   ├── main.js             # App initialization & orchestration
│   ├── state.js            # Global state & filtering
│   ├── map.js              # Mapbox GL integration
│   ├── detail-panel.js     # Building detail sidebar
│   ├── data-table.js       # Table view with pagination
│   ├── kanban.js           # Kanban board & drag-drop
│   ├── statistics.js       # Stats & ApexCharts
│   └── search.js           # Swisstopo location search
├── data/
│   ├── buildings.json      # Building records
│   ├── users.json          # Team members
│   ├── events.json         # Activity log
│   ├── comments.json       # Building comments
│   ├── errors.json         # Validation errors
│   └── rules.json          # Validation rules
└── assets/                 # SVG logos
```

---

## Technology Stack

- **Vanilla JavaScript (ES6 Modules)** - No frameworks
- **Mapbox GL JS v3.3.0** - Interactive maps
- **ApexCharts** - Data visualization (CDN)
- **Lucide Icons** - Icon system via `data-lucide` attributes
- **Source Sans 3** - Google Fonts typography

**No build pipeline required** - Static file serving only

---

## Running the Project

```bash
# Python
python -m http.server 8000

# Node.js
npx serve
```

Open http://localhost:8000

---

## Architecture Patterns

### State Management (`js/state.js`)

Centralized state object:
```javascript
export const state = {
  selectedBuildingId: null,
  activeFilters: { high, medium, low, myTasks },
  filterKanton: [],
  filterConfidence: [],
  filterPortfolio: [],
  filterStatus: [],
  filterAssignee: [],
  currentTab: 'karte',
  editMode: false
};
```

**Key exports:**
- `buildings[]` - Main dataset
- `getFilteredBuildings()` - Apply all filters
- `updateURL()` / `parseURL()` - URL state sync
- `setupMultiSelectFilter()` - Dropdown filter setup

### Module Communication

Modules communicate via callbacks set in `main.js`:
```javascript
setKanbanCallbacks({ onSelectBuilding, onDataChange });
setDetailPanelCallbacks({ onStatusChange, onAssigneeChange });
setTableCallbacks({ onSelectBuilding });
```

### Tab Switching & Scroll Behavior

**Map tab (`karte`):** App mode - no page scroll, map fills viewport

**Other tabs:** Page scroll mode - body scrolls naturally

```javascript
// Toggled in switchTab()
const pageScrollTabs = ['statistik', 'aufgaben', 'settings'];
document.body.classList.toggle('page-scroll-tab', pageScrollTabs.includes(tabId));
```

---

## CSS Design System

### Design Tokens (`css/tokens.css`)

**Colors:**
```css
--swiss-red: #d8232a;
--federal-blue: #1a365d;
--color-critical: #dc2626;    /* < 50% confidence */
--color-warning: #d97706;     /* 50-80% confidence */
--color-success: #059669;     /* >= 80% confidence */
```

**Data Source Colors:**
```css
--type-geo: #6366f1;      /* GEOREF */
--type-sap: #0891b2;      /* SAP */
--type-gwr: #059669;      /* GWR */
--type-address: #7c3aed;  /* Address */
```

**Typography:**
```css
--font-base: 14px;    /* Body text (WCAG AA minimum) */
--font-sm: 13px;      /* Labels, badges */
--font-lg: 17px;      /* Section titles */
--font-2xl: 28px;     /* Stat values */
```

**Spacing (4px base):**
```css
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
```

### Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| ≤1440px | Stat cards: 3 columns |
| ≤1280px | Detail panel: 380px width |
| ≤1024px | Charts: single column, filters wrap |
| ≤900px | **Kanban stacks vertically**, detail panel below content |
| ≤600px | Detail panel: 60vh height, stat cards: 1 column |

### Key CSS Classes

```css
.page-scroll-tab          /* Body class for page-level scrolling */
.btn-primary/.btn-ghost   /* Button variants */
.filter-chip.active       /* Active filter state */
.kanban-card.selected     /* Selected card highlight */
.detail-panel.visible     /* Show detail sidebar */
```

---

## Data Structures

### Building Object

```javascript
{
  id: "1080/2020/AA",           // SAP ID format
  name: "Romanshorn, Friedrichshafnerstrasse",
  lat: 47.5656,
  lng: 9.3744,
  kanton: "TG",                 // 2-letter canton code
  portfolio: "Büro",            // Büro, Wohnen, Öffentlich, Industrie, Bildung
  priority: "medium",           // low, medium, high
  confidence: {
    total: 67,                  // 0-100 percentage
    georef: 67,
    sap: 100,
    gwr: 100
  },
  assignee: "M. Keller",        // null if unassigned
  kanbanStatus: "inprogress",   // backlog, inprogress, clarification, done
  dueDate: "2026-02-15",        // ISO date or null
  data: {                       // Source comparison
    address: { sap: "...", gwr: "...", match: true },
    plz: { sap: "8590", gwr: "8590", match: true }
  }
}
```

---

## Filter System

### Priority Filters (Quick Access)
- `high`, `medium`, `low` - Priority levels
- `my-tasks` - Current user's assignments (M. Keller)

### Multi-Select Filters
- **Kanton:** TG, ZH, BE, etc.
- **Confidence:** critical (<50%), warning (50-80%), ok (>=80%)
- **Portfolio:** Büro, Wohnen, etc.
- **Status:** backlog, inprogress, clarification, done
- **Assignee:** Team members or "Nicht zugewiesen" (empty string)

### Chart Filters (Isolated)
Statistics charts have their own filter state (`chartFilters`) separate from main filters. Click chart segments to filter, use "Zurücksetzen" to clear.

---

## URL State Synchronization

All filters are serialized to URL parameters:
```
?tab=karte&id=1080/2020/AA&filters=high&kanton=TG,ZH&confidence=critical
```

- `pushState()` on changes - supports browser back/forward
- `parseURL()` on load - restores full state

---

## Key Implementation Details

### Detail Panel
- Resizable via drag handle
- Accordion sections (some open by default)
- Edit mode enables marker dragging
- Comments submitted via form

### Kanban Board
- 4 columns: Backlog → In Bearbeitung → Abklärung → Erledigt
- Drag-and-drop changes `kanbanStatus`
- Updates `lastUpdate` and `lastUpdateBy` on drop

### ApexCharts Integration
6 charts with cross-filtering:
1. Confidence Distribution (bar)
2. Status Distribution (donut)
3. Errors by Source (horizontal bar)
4. Due Dates (bar)
5. Tasks per Assignee (horizontal bar)
6. Priority Distribution (donut)

Colors match CSS tokens:
```javascript
chartColors.confidence.critical = '#dc2626'  // --color-critical
chartColors.status.done = '#059669'          // --color-success
```

---

## Naming Conventions

### CSS Classes
```
.component-name           /* Root element */
.component-name-child     /* Child element */
.component-name.modifier  /* State modifier */
```

### Data Attributes
```html
data-tab="karte"                    <!-- Tab navigation -->
data-filter="high"                  <!-- Filter type -->
data-building-id="1080/2020/AA"     <!-- Record reference -->
data-lucide="search"                <!-- Icon name -->
```

### German Labels
- Tabs: Karte, Aufgaben, Statistik, Einstellungen & Export
- Status: Backlog, In Bearbeitung, Abklärung, Erledigt
- Actions: Speichern, Abbrechen, Suchen
- Dates: Swiss format `dd.mm.yyyy`

---

## Common Tasks

### Adding a New Filter
1. Add state property in `state.js`
2. Add filter logic in `getFilteredBuildings()`
3. Add HTML for dropdown in `index.html`
4. Call `setupMultiSelectFilter()` in `main.js`
5. Add URL serialization in `updateURL()` / `parseURL()`

### Adding a New Chart
1. Add chart instance in `statistics.js` charts object
2. Create render function `renderNewChart(filtered)`
3. Call from `updateStatistik()`
4. Add container in `index.html`
5. Optionally add chart filter in `chartFilters`

### Modifying Breakpoints
Edit media queries at bottom of `css/styles.css`:
- ≤1440px, ≤1280px, ≤1024px, ≤900px, ≤600px

---

## Performance Notes

- **Lucide icons:** Call `lucide.createIcons()` after DOM updates
- **Search:** Debounced 300ms
- **Table:** Paginated (100/500/1000 rows)
- **Map resize:** Delayed 50ms during panel drag
- **Filters:** Run on every change, keep filter logic efficient

---

## External APIs

- **Swisstopo Search:** `https://api3.geo.admin.ch/rest/services/api/SearchServer` (no auth)
- **Mapbox:** Requires access token in `map.js`
- **WMS Layers:** ÖREB cadastral, GWR building status from swisstopo

---

## Testing

No test framework configured. Manual testing:
1. Start local server
2. Test all tabs and filters
3. Test responsive breakpoints (900px is key)
4. Test URL state persistence (refresh, back/forward)
5. Test kanban drag-drop
6. Test chart click filtering
