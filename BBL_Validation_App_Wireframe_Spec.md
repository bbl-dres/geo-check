# BBL Liegenschaftsinventar Validation App - Wireframe Specification

## Overview

A web-based data validation tool for the Swiss Federal Office for Buildings and Logistics (BBL) to validate location data across a real estate portfolio of ~3000 buildings. The app compares data from multiple sources (SAP RE-FX, GWR/Gebäuderegister, Geodata) and allows distributed domain experts to collaboratively fix errors.

## Design System

### Visual Identity
- **Style**: Swiss Federal Corporate Design - clean, professional, utilitarian
- **Primary Color**: Swiss Red `#d8232a` (accents, active states)
- **Secondary Color**: Federal Blue `#1a365d` (buttons, links, headers)
- **Background**: Light gray `#f7f8fa` with white `#ffffff` panels
- **Typography**: "Source Sans 3" or system sans-serif
- **Border Radius**: 4px (small), 8px (medium), 12px (large)
- **Shadows**: Subtle, layered (`0 1px 2px`, `0 4px 6px`)

### Status Colors
- **Critical** (red `#dc2626`): Major errors requiring immediate attention
- **Warning** (orange `#ea580c`): Issues that need review
- **Minor** (yellow `#facc15`): Small discrepancies
- **OK** (green `#16a34a`): Validated, no issues

---

## Global Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER (64px height, sticky)                                    │
│ [Swiss Cross + BBL Logo] [Search Bar]              [User Avatar]│
├─────────────────────────────────────────────────────────────────┤
│ NAVIGATION TABS                                                 │
│ [Karte] [Aufgaben] [Statistik] [Handbuch & Downloads]          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ TAB CONTENT (fills remaining viewport height)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Header Components
1. **Logo**: Swiss cross (32x32px red square with white cross) + two-line text ("Bundesamt für Bauten und Logistik" / "Korrekturen Liegenschaftsinventar")
2. **Search Bar**: 320px width, placeholder "Wirtschaftseinheit, Strasse, oder Bezeichnung...", searches across all buildings
3. **User Menu**: Circular avatar with initials, dropdown for settings/logout

### Navigation Tabs
- Horizontal tab bar, underline style
- Active tab: Swiss Red underline + red text
- Hover: Light gray background

---

## Tab 1: Karte (Map View)

The primary workspace for discovering and correcting errors.

### Layout (3-column)

```
┌──────────────────┬─────────────────────────────┬──────────────────┐
│ FILTER BAR (spans all columns)                                    │
│ [Error Type Chips] [Dropdown Filters] [Result Count]             │
├──────────────────┼─────────────────────────────┼──────────────────┤
│ LIST PANEL       │ MAP                         │ DETAIL PANEL     │
│ (360px fixed)    │ (flexible, min 400px)       │ (380px fixed)    │
│                  │                             │                  │
│ Scrollable list  │ Leaflet/MapLibre map        │ Selected object  │
│ of buildings     │ with colored markers        │ details & actions│
│                  │                             │                  │
│                  │ [Basemap Selector]          │                  │
└──────────────────┴─────────────────────────────┴──────────────────┘
```

### Filter Bar

**Row 1 - Error Type Chips** (toggle filters):
```
Fehlertypen: [✓ Georeferenzierung (234)] [✓ SAP Stammdaten (89)] [✓ GWR Abgleich (156)] [✓ Adressfehler (45)] | [Nur meine Aufgaben]
```
- Chips are toggleable (active = filled Federal Blue, inactive = outlined)
- Each chip shows count in parentheses
- "Nur meine Aufgaben" filters to current user's assignments

**Row 2 - Dropdown Filters**:
```
Weitere Filter: [Kanton ▼] [Status ▼] [Konfidenz ▼] [Zugewiesen ▼]     547 von 3'012 Objekten
```
- Kanton: TG, SG, GR, ZH, BE, etc.
- Status: Offen, Zugewiesen, In Prüfung, Erledigt
- Konfidenz: Kritisch (<50%), Warnung (50-80%), OK (>80%)
- Zugewiesen: Team member names

### List Panel

**Header**:
```
📋 Liste (547)                    Sortieren: [Konfidenz ▼]
```

**List Item Structure**:
```
┌────────────────────────────────────────┐
│ ● [Status Dot] Building Name           │
│   [Tag: Georef] [Tag: SAP]             │
│   👤 Assignee | ⚠️ 2 Fehler            │
└────────────────────────────────────────┘
```

- Status dot: 12px circle, color matches severity
- Selected item: Light blue background `#ebf5ff`, left border 3px Federal Blue
- Tags: Small colored pills (Georef=blue, SAP=amber, GWR=green, Adresse=purple)
- Click item → selects on map, shows in detail panel

### Map Panel

**Map Features**:
- Base layer: CartoDB Positron or swisstopo (light, clean)
- Markers: Colored dots (16px) with white border, color = status
- Selected marker: Larger (24px), pulsing animation
- Click marker → selects building

**Basemap Selector** (bottom-left):
```
┌─────────────────────────────┐
│ [Karte] [Satellit] [Kataster] │
└─────────────────────────────┘
```
- Toggle between map styles
- Could integrate swisstopo WMTS layers

### Detail Panel

**Empty State** (no selection):
```
┌────────────────────────────┐
│         📍                 │
│  Objekt auswählen um       │
│  Details zu sehen          │
└────────────────────────────┘
```

**With Selection**:
```
┌────────────────────────────────────────┐
│ HEADER                                 │
│ Building Name (18px, bold)             │
│ Subtitle (13px, gray)                  │
├────────────────────────────────────────┤
│ CONFIDENCE OVERVIEW                    │
│ ┌────────────────────────────────────┐ │
│ │ 67%  │ Georef ████░░ 67%          │ │
│ │ big  │ SAP    ██████ 100%         │ │
│ │ num  │ GWR    ██████ 100%         │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ FEHLER                                 │
│ ┌──────────────────────────────────┐   │
│ │ [Georef] Koordinatenabweichung   │   │
│ │ SAP ↔ GWR: 47m Differenz        │   │
│ └──────────────────────────────────┘   │
├────────────────────────────────────────┤
│ DATENVERGLEICH                         │
│ ┌──────────────────────────────────┐   │
│ │ Attribut  │ SAP RE-FX │ GWR      │   │
│ │ Adresse   │ ✓ Match   │ ✓ Match  │   │
│ │ Koordin.  │ ✗ Fehlt   │ ✓ Valid  │   │
│ │ Baujahr   │ 1965      │ 1967 ⚠️   │   │
│ └──────────────────────────────────┘   │
├────────────────────────────────────────┤
│ KOMMENTARE                             │
│ ┌──────────────────────────────────┐   │
│ │ M.Keller (12.01.2026)            │   │
│ │ "Vor Ort verifiziert..."         │   │
│ └──────────────────────────────────┘   │
├────────────────────────────────────────┤
│ ACTIONS                                │
│ [🔵 Zuweisen                        ]  │
│ [💬 Kommentar    ] [✏️ Korrigieren  ]  │
│ [🟢 Als erledigt markieren          ]  │
└────────────────────────────────────────┘
```

**Confidence Meter**:
- Large percentage number on left (color-coded: <50% red, 50-80% orange, >80% default)
- Three horizontal bars: Georef, SAP, GWR
- Bar fill color matches confidence level

**Error Cards**:
- Red background for critical, amber for warning
- Tag + title on first line, description below

**Data Comparison Table**:
- 3 columns: Attribut, SAP RE-FX, GWR
- Color-code cells: green for match, red for mismatch, gray italic for missing

**Comments Section**:
- Chronological list
- System comments styled differently (blue left border)

---

## Tab 2: Aufgaben (Task Board)

Kanban-style workflow management.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│ Aufgaben-Board          [Board] [Liste] [Meine Aufgaben]       │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│ 📥 OFFEN      │ 👤 ZUGEWIESEN │ 🔍 IN PRÜFUNG │ ✅ ERLEDIGT     │
│ (234)         │ (89)          │ (34)          │ (1'842)         │
├───────────────┼───────────────┼───────────────┼─────────────────┤
│ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐   │
│ │ Card      │ │ │ Card      │ │ │ Card      │ │ │ Card      │   │
│ │           │ │ │           │ │ │           │ │ │           │   │
│ └───────────┘ │ └───────────┘ │ └───────────┘ │ └───────────┘   │
│ ┌───────────┐ │ ┌───────────┐ │               │                 │
│ │ Card      │ │ │ Card      │ │               │                 │
│ └───────────┘ │ └───────────┘ │               │                 │
│ [+124 mehr]   │ [+86 mehr]    │               │                 │
├───────────────┴───────────────┴───────────────┴─────────────────┤
│ TEAM OVERVIEW                                                   │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│ │ 👤 M.Keller │ │ 👤 S.Brunner│ │ 👤 T.Weber  │                │
│ │ GIS / TG,SG │ │ SAP RE-FX   │ │ Facility    │                │
│ │ ●●● 3 offen │ │ ●● 2 offen  │ │ ● 1 offen   │                │
│ └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Kanban Columns
- 4 equal-width columns
- Light gray background `#f7f8fa`
- Header: emoji + title + count badge
- Scrollable card area

### Kanban Card

```
┌─────────────────────────────────┐
│ Building Name (bold)            │  ← Left border color = severity
│ Subtitle (gray)                 │
│ [Georef] [SAP]                  │  ← Error type tags
│ ────────────────────────────────│
│ 👤 M.Keller        💬 2  ⏱️ 3d  │  ← Assignee, comments, age
└─────────────────────────────────┘
```

- Left border: 3px, color = severity
- Hover: Slight elevation, shadow
- Click: Opens detail modal or navigates to Karte tab

### Team Overview Section
- Horizontal row of team member cards
- Each shows: Avatar, Name, Expertise area, Workload dots (colored by severity)

---

## Tab 3: Statistik (Statistics)

Dashboard for progress tracking and reporting.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Zeitraum: [Letzte 30 Tage ▼]                    [📥 Export CSV] │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│ STAT CARD     │ STAT CARD     │ STAT CARD     │ STAT CARD       │
│ Fortschritt   │ Erledigt      │ Offen         │ Ø Bearbeitungsz.│
│ 62%           │ 1'842         │ 547           │ 3.2 Tage        │
│ +8% ↑         │ +127 ↑        │ -89 ↓         │ -0.5d ↑         │
├───────────────┴───────────────┼───────────────┴─────────────────┤
│ PROGRESS CHART                │ ERROR TYPES CHART               │
│                               │                                 │
│ ████████████████░░░░░░ 62%    │ Georef    ████████░░  234       │
│ 1'842 / 3'000                 │ GWR       █████░░░░░  156       │
│                               │ SAP       ███░░░░░░░   89       │
│                               │ Adresse   █░░░░░░░░░   45       │
├───────────────────────────────┴─────────────────────────────────┤
│ OPTIONAL: Line chart showing trend over time                    │
│ OPTIONAL: By canton breakdown                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Stat Cards
- 4 cards in a row
- Large number (32px, Federal Blue)
- Small label above
- Change indicator below (green for positive, red for negative)

### Charts
- Simple horizontal bar charts (CSS-only is fine for prototype)
- Progress bar with percentage fill
- Error type breakdown with counts

---

## Tab 4: Handbuch & Downloads

Documentation and export functionality.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 📖 HANDBUCH                                                     │
│ ├─ ▸ Einführung                                                │
│ ├─ ▸ Fehlertypen verstehen                                     │
│ │    ├─ Georeferenzierung                                      │
│ │    ├─ SAP Stammdaten                                         │
│ │    └─ GWR Abgleich                                           │
│ ├─ ▸ Korrektur-Workflow                                        │
│ └─ ▸ Häufige Fragen (FAQ)                                      │
├─────────────────────────────────────────────────────────────────┤
│ 📥 DOWNLOADS                                                    │
│ ┌───────────────────────────────┬────────┬──────────┐          │
│ │ Checkliste Vor-Ort-Prüfung    │ PDF    │ Download │          │
│ │ Excel-Vorlage Massenkorrektur │ XLSX   │ Download │          │
│ │ Aktueller Fehlerbericht       │ CSV    │ Download │          │
│ │ Meine offenen Aufgaben        │ PDF    │ Download │          │
│ └───────────────────────────────┴────────┴──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│ 🔗 EXTERNE RESSOURCEN                                          │
│ • GWR Dokumentation (BFS)                                      │
│ • SAP RE-FX Handbuch (intern)                                  │
│ • swisstopo Koordinatensysteme                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Modals

### Assignment Modal

Triggered by "Zuweisen" button.

```
┌─────────────────────────────────────────┐
│ Aufgabe zuweisen                    [×] │
├─────────────────────────────────────────┤
│ Wählen Sie einen Teamkollegen:          │
│                                         │
│ ○ [Avatar] M. Keller                    │
│            GIS / TG, SG                 │
│                                         │
│ ○ [Avatar] S. Brunner                   │
│            SAP RE-FX                    │
│                                         │
│ ○ [Avatar] T. Weber                     │
│            Facility Management          │
│                                         │
│ Notiz (optional):                       │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│              [Abbrechen] [Zuweisen]     │
└─────────────────────────────────────────┘
```

### Correction Modal

Triggered by "Korrigieren" button.

```
┌───────────────────────────────────────────────────────────┐
│ Daten korrigieren                                     [×] │
├───────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐  ┌─────────────────────┐         │
│ │ SAP RE-FX (Quelle)  │  │ GWR (Referenz)      │         │
│ │                     │  │                     │         │
│ │ Koordinaten: Fehlt  │  │ Koordinaten: ✓      │         │
│ │ Adresse: Friedrich. │  │ Adresse: Friedrich. │         │
│ │ Baujahr: 1965       │  │ Baujahr: 1967       │         │
│ └─────────────────────┘  └─────────────────────┘         │
│                                                           │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ 💡 Vorgeschlagene Aktion                              │ │
│ │ Koordinaten aus GWR übernehmen nach SAP RE-FX         │ │
│ │                     [Koordinaten übernehmen]          │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ Kommentar zur Korrektur:                                  │
│ ┌───────────────────────────────────────────────────────┐ │
│ │                                                       │ │
│ └───────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────┤
│                    [Abbrechen] [Korrektur speichern]      │
└───────────────────────────────────────────────────────────┘
```

---

## Data Model (for prototype)

```javascript
const building = {
  id: 1,
  name: "Romanshorn, Friedrichshafnerstrasse",
  subtitle: "Zollpavillon Nord",
  lat: 47.5656,
  lng: 9.3744,
  
  // Status: "critical" | "warning" | "minor" | "ok"
  status: "warning",
  
  // Confidence scores (0-100)
  confidence: {
    total: 67,
    georef: 67,
    sap: 100,
    gwr: 100
  },
  
  // Error list
  errors: [
    {
      type: "georef", // "georef" | "sap" | "gwr" | "address"
      title: "Koordinatenabweichung",
      description: "SAP ↔ GWR: 47m Differenz",
      severity: "warning" // "critical" | "warning" | "minor"
    }
  ],
  
  // Tags for filtering (derived from errors)
  tags: ["georef"],
  
  // Assignment
  assignee: "M. Keller", // null if unassigned
  
  // Workflow status
  kanbanStatus: "assigned", // "open" | "assigned" | "review" | "done"
  
  // Data comparison
  data: {
    address: { sap: "Friedrichshafnerstrasse", gwr: "Friedrichshafnerstrasse", match: true },
    plz: { sap: "8590 Romanshorn", gwr: "8590 Romanshorn", match: true },
    coords: { sap: "Fehlt", gwr: "2'738'456 / 1'278'234", match: false },
    egid: { sap: "—", gwr: "2340212", match: false },
    year: { sap: "1965", gwr: "1967", match: false }
  },
  
  // Comments
  comments: [
    {
      author: "M. Keller",
      date: "12.01.2026",
      text: "Vor Ort verifiziert - GWR Position ist korrekt.",
      system: false
    },
    {
      author: "System",
      date: "10.01.2026",
      text: "Automatisch erkannt: Koordinatenabweichung > 30m",
      system: true
    }
  ]
};
```

---

## Technical Requirements

### Frontend Stack
- **HTML/CSS/JS** (vanilla for prototype) or **React** for production
- **Leaflet** or **MapLibre GL JS** for mapping
- **CSS Grid/Flexbox** for layout
- No heavy frameworks needed for prototype

### Map Integration
- Use Leaflet with CartoDB Positron tiles for prototype
- Production: Integrate swisstopo WMTS (swissALTI3D, cadastral survey)
- Custom markers with CSS (colored dots)

### Responsive Behavior
- Desktop-first (primary use case)
- Minimum width: 1280px
- Collapse to 2-panel (list + map) on smaller screens
- Detail panel becomes slide-over on tablet

### Accessibility
- Keyboard navigation for list items
- ARIA labels on interactive elements
- Sufficient color contrast
- Focus indicators on all interactive elements

---

## Implementation Notes for Claude Code

1. **Start with the layout shell**: Header, tabs, 3-column grid for Karte
2. **Build static HTML/CSS first**: Get the visual structure right before adding JS
3. **Use CSS custom properties**: Define colors, spacing, typography as variables
4. **Map initialization**: Simple Leaflet setup with CartoDB tiles
5. **Mock data**: Use the building array provided above
6. **Interactivity order**:
   - Tab switching
   - List item selection → map centering → detail panel update
   - Filter chips toggle
   - Modal open/close
7. **Keep it simple**: No build tools, no npm - single HTML file with inline CSS/JS is fine for prototype

---

## Files to Generate

For a complete prototype, create:
1. `index.html` - Main application (can be single file with embedded CSS/JS)
2. `README.md` - Setup instructions

Optional for production:
- `styles.css` - Extracted styles
- `app.js` - Extracted JavaScript
- `data.json` - Mock building data
