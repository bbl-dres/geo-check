# Wireframe: Edit Mode v2 - GWR Lookup & Korrektur

## User Feedback Summary

1. **GWR Column**: Only EGID should be editable - changing EGID queries GWR API and populates other fields (read-only)
2. **"Is building in GWR?" dropdown**: Yes/No selection
3. **Korrektur Column**: Empty by default, allows user corrections/overrides
4. **Map Coordinates**: Need separate fields for map display (independent of data comparison)

---

## Current vs. Proposed Data Structure

### Current Structure (per field)
```json
{
  "plz": {
    "sap": "8280",
    "gwr": "8280",
    "value": "8280",    // ← Currently used as "canonical" value
    "match": true
  }
}
```

### Proposed Structure (per field)
```json
{
  "plz": {
    "sap": "8280",           // Read-only from SAP
    "gwr": "8280",           // Read-only from GWR API (populated via EGID lookup)
    "korrektur": "",         // User correction (empty by default)
    "match": true
  }
}
```

### New Building-Level Fields
```json
{
  "id": "1080/2021/AB",
  "name": "Kreuzlingen, Hauptstrasse 12",

  // NEW: GWR status
  "inGwr": true,             // Is building registered in GWR?
  "gwrEgid": "1456789",      // EGID used for GWR lookup (editable in edit mode)

  // NEW: Map coordinates (separate from comparison data)
  "mapLat": 47.6512,         // Used for map marker position
  "mapLng": 9.1756,          // Managed independently

  // Existing comparison fields...
  "plz": { "sap": "...", "gwr": "...", "korrektur": "", "match": true },
  // etc.
}
```

---

## Wireframe: Edit Mode Table

### View Mode (inGwr = true)
```
┌─────────────────┬────────────────┬────────────────┬────────────────┬───────┐
│ Attribut        │ SAP            │ GWR            │ Korrektur      │ Match │
├─────────────────┼────────────────┼────────────────┼────────────────┼───────┤
│ Gebäude im GWR? │ -              │ Ja             │ -              │       │
├─────────────────┼────────────────┼────────────────┼────────────────┼───────┤
│ EGID            │                │ 1456789        │                │   ✗   │
│ PLZ             │ 8280           │ 8280           │                │   ✓   │
│ Ort             │ Kreuzlingen    │ Kreuzlingen    │                │   ✓   │
│ Strasse         │ Hauptstrasse   │ Hauptstr.      │                │   ✗   │
│ Hausnr.         │ 12             │ 12a            │ 12             │   ✗   │
│ Koordinaten     │ 47.65, 9.175   │ 47.6512, 9.17  │                │   ✓   │
└─────────────────┴────────────────┴────────────────┴────────────────┴───────┘
```

### View Mode (inGwr = false)
```
┌─────────────────┬────────────────┬────────────────┬────────────────┬───────┐
│ Attribut        │ SAP            │ GWR            │ Korrektur      │ Match │
├─────────────────┼────────────────┼────────────────┼────────────────┼───────┤
│ Gebäude im GWR? │ -              │ Nein           │ -              │       │
├─────────────────┼────────────────┼────────────────┼────────────────┼───────┤
│ EGID            │                │ -              │                │       │
│ PLZ             │ 8280           │ -              │ 8280           │       │
│ Ort             │ Kreuzlingen    │ -              │ Kreuzlingen    │       │
│ Strasse         │ Hauptstrasse   │ -              │ Hauptstrasse   │       │
│ ...             │ ...            │ -              │ ...            │       │
└─────────────────┴────────────────┴────────────────┴────────────────┴───────┘
```

### Edit Mode (NEW)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ KORREKTUR                                                                    │
├─────────────────┬────────────────┬────────────────┬─────────────────────────┤
│ Attribut        │ SAP            │ GWR            │ Korrektur               │
│                 │ (Referenz)     │ (via EGID)     │ (Ihre Eingabe)          │
├─────────────────┼────────────────┼────────────────┼─────────────────────────┤
│ Gebäude im GWR? │ -              │ [ Ja ▼ ]       │ -                       │
│                 │                │ ↑ editable     │                         │
├─────────────────┼────────────────┼────────────────┼─────────────────────────┤
│ EGID            │ -              │ [1456789    ]  │ -                       │
│                 │                │ ↑ editable     │                         │
├─────────────────┼────────────────┼────────────────┼─────────────────────────┤
│ PLZ             │ 8280           │ 8280           │ [            ]          │
│ Ort             │ Kreuzlingen    │ Kreuzlingen    │ [            ]          │
│ Strasse         │ Hauptstrasse   │ Hauptstr.      │ [            ]          │
│ Hausnr.         │ 12             │ 12a            │ [12          ]          │
│ Koordinaten     │ 47.65, 9.175   │ 47.6512, 9.17  │ [            ]          │
│ ...             │ ...            │ ...            │ ...                     │
└─────────────────┴────────────────┴────────────────┴─────────────────────────┘
│                                                                             │
│          ∧ Weniger Attribute        [ Abbrechen ]  [ Speichern ]            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Edit Mode - Building NOT in GWR (inGwr = false)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ KORREKTUR                                                                    │
├─────────────────┬────────────────┬────────────────┬─────────────────────────┤
│ Attribut        │ SAP            │ GWR            │ Korrektur               │
│                 │ (Referenz)     │ (N/A)          │ (Ihre Eingabe)          │
├─────────────────┼────────────────┼────────────────┼─────────────────────────┤
│ Gebäude im GWR? │ -              │ [ Nein ▼ ]     │ -                       │
│                 │                │ ↑ editable     │                         │
├─────────────────┼────────────────┼────────────────┼─────────────────────────┤
│ EGID            │ -              │ -              │ -                       │
│                 │                │ (disabled)     │                         │
├─────────────────┼────────────────┼────────────────┼─────────────────────────┤
│ PLZ             │ 8280           │ -              │ [            ]          │
│ Ort             │ Kreuzlingen    │ -              │ [            ]          │
│ Strasse         │ Hauptstrasse   │ -              │ [Hauptstrass ]          │
│ ...             │ ...            │ -              │ ...                     │
└─────────────────┴────────────────┴────────────────┴─────────────────────────┘
```

---

## Interaction Flow

### 1. Enter Edit Mode
```
User clicks [Korrigieren] button
    ↓
System loads current values
    ↓
Edit mode UI renders with:
    - "Gebäude im GWR?" dropdown (defaults to current inGwr value)
    - EGID input in GWR column (if inGwr=true)
    - Empty Korrektur inputs (pre-filled only if korrektur has value)
```

### 2. Change EGID (GWR Lookup)
```
User changes EGID input
    ↓
Debounced (300ms) API call to GWR
    ↓
API returns building data
    ↓
GWR column fields update (read-only display)
    ↓
Coordinates preview updates on map (optional visual feedback)
```

### 3. Toggle "Gebäude im GWR?"
```
User selects "Nein"
    ↓
EGID input disabled/hidden
    ↓
GWR column shows "-" for all fields
    ↓
User can still enter Korrektur values
```

### 4. Save Changes
```
User clicks [Speichern]
    ↓
System saves:
    - inGwr: true/false
    - gwrEgid: "1456789" (if inGwr=true)
    - Each field's korrektur value (if user entered one)
    - mapLat/mapLng: from map marker position (if dragged)
    ↓
Match recalculated based on SAP vs GWR vs Korrektur
```

---

## Dependencies & Implementation Impact

### 1. Data Structure Changes (`data/buildings.json`)

**Add new fields:**
```javascript
// Per building
{
  "inGwr": true,          // NEW
  "gwrEgid": "1456789",   // NEW (separate from comparison egid)
  "mapLat": 47.6512,      // NEW (for map display)
  "mapLng": 9.1756,       // NEW (for map display)

  // Field structure change: value → korrektur
  "plz": {
    "sap": "8280",
    "gwr": "8280",
    "korrektur": "",      // RENAMED from "value"
    "match": true
  }
}
```

### 2. Map Module (`js/map.js`)

**Change:** Use `mapLat`/`mapLng` instead of `lat.value`/`lng.value`
```javascript
// Before
center: [parseFloat(building.lng.value), parseFloat(building.lat.value)]

// After
center: [building.mapLng, building.mapLat]
```

### 3. Detail Panel (`js/detail-panel.js`)

**Changes needed:**
- Add "Gebäude im GWR?" dropdown at top of edit section
- EGID row: only GWR column is editable
- All other rows: only Korrektur column is editable
- GWR API integration for EGID lookup
- Save logic updates for new field structure

### 4. State Module (`js/state.js`)

**Add:**
- `gwrLookupCache`: Cache for GWR API responses
- API call function for GWR lookup

### 5. Match Calculation Logic

**New logic:**
```javascript
// Match is true when:
// - SAP matches GWR (if both exist)
// - OR Korrektur provides the resolved value
field.match = (field.sap === field.gwr) ||
              (field.korrektur && field.korrektur === field.gwr);
```

---

## GWR API Integration

### API Endpoint
```
https://api3.geo.admin.ch/rest/services/ech/MapServer/find
```

### Request Parameters
```javascript
const params = new URLSearchParams({
  layer: 'ch.bfs.gebaeude_wohnungs_register',
  searchText: egid,           // e.g., "1231641"
  searchField: 'egid',
  returnGeometry: 'true',
  contains: 'false',          // exact match
  sr: '4326'                  // WGS84 coordinates
});

const url = `https://api3.geo.admin.ch/rest/services/ech/MapServer/find?${params}`;
```

### Response Structure (Example)
```json
{
  "results": [{
    "featureId": "1231641_0",
    "geometry": {
      "x": 7.430877,          // longitude (WGS84)
      "y": 46.958232          // latitude (WGS84)
    },
    "attributes": {
      "egid": "1231641",
      "strname_deinr": "Beaulieustrasse 2",
      "plz_plz6": "3012/301200",
      "ggdename": "Bern",
      "gdekt": "BE",
      "egrid": "CH251146763508",
      "gkat": 1020,
      "gklas": 1122,
      "gbaup": 8012,
      "garea": 174,
      "strname": ["Beaulieustrasse"],
      "strnamk": ["Beaulieustr."],
      "deinr": "2",
      "dplz4": 3012,
      "dplzname": "Bern"
    }
  }]
}
```

### Field Mapping (GWR API → Our Data)
| Our Field      | GWR API Field          | Notes                          |
|----------------|------------------------|--------------------------------|
| plz            | `dplz4`                | 4-digit PLZ                    |
| ort            | `ggdename`             | Municipality name              |
| strasse        | `strname[0]`           | Street name (array)            |
| hausnummer     | `deinr`                | House number                   |
| kanton         | `gdekt`                | Canton code (BE, ZH, etc.)     |
| egrid          | `egrid`                | E-GRID identifier              |
| gkat           | `gkat`                 | Building category code         |
| gklas          | `gklas`                | Building class code            |
| gbaup          | `gbaup`                | Construction period code       |
| footprintArea  | `garea`                | Building footprint area (m²)   |
| lat            | `geometry.y`           | WGS84 latitude                 |
| lng            | `geometry.x`           | WGS84 longitude                |

### Implementation
```javascript
async function lookupGwrByEgid(egid) {
  const params = new URLSearchParams({
    layer: 'ch.bfs.gebaeude_wohnungs_register',
    searchText: egid,
    searchField: 'egid',
    returnGeometry: 'true',
    contains: 'false',
    sr: '4326'
  });

  const response = await fetch(
    `https://api3.geo.admin.ch/rest/services/ech/MapServer/find?${params}`
  );
  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    return null; // EGID not found
  }

  const result = data.results[0];
  const attr = result.attributes;

  return {
    egid: attr.egid,
    plz: String(attr.dplz4),
    ort: attr.ggdename,
    strasse: attr.strname?.[0] || '',
    hausnummer: attr.deinr || '',
    kanton: attr.gdekt,
    egrid: attr.egrid,
    gkat: String(attr.gkat),
    gklas: String(attr.gklas),
    gbaup: String(attr.gbaup),
    footprintArea: String(attr.garea || ''),
    lat: result.geometry.y,
    lng: result.geometry.x
  };
}
```

---

## Questions for Clarification

1. **Korrektur pre-fill**: Should Korrektur column pre-fill with GWR values, or always start empty?
   - Recommendation: Start empty, user explicitly enters corrections

2. **Map coordinate source**: Which source should the map use by default?
   - Recommendation: `mapLat`/`mapLng` - managed separately, initially set from GWR or user input

3. **Match logic**: What defines a "match" with the new three-column structure?
   - Recommendation: SAP ↔ GWR match (Korrektur is the user's resolution, not part of match calc)

4. **GWR API availability**: Is there a real GWR API endpoint we can use?
   - For prototype: Use mock data
   - For production: Need API credentials/documentation

---

## Migration Path

### Phase 1: Data Structure Update
1. Add `mapLat`, `mapLng` to buildings (copy from `lat.value`, `lng.value`)
2. Add `inGwr` (default `true` if gwr fields have data)
3. Add `gwrEgid` (copy from `egid.gwr`)
4. Rename `value` → `korrektur` (set to empty or keep existing)

### Phase 2: UI Updates
1. Update `renderDataComparison()` for new column structure
2. Add "Gebäude im GWR?" dropdown
3. Update edit mode to only allow EGID + Korrektur edits
4. Update map.js to use `mapLat`/`mapLng`

### Phase 3: GWR Integration
1. Add mock GWR lookup function
2. Wire EGID input to trigger lookup
3. Display loading state during lookup
4. Handle lookup errors gracefully

---

## Visual Summary

```
┌────────────────────────────────────────────────────────────────────┐
│                        EDIT MODE v2                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   ┌─────────────────┬─────────┬─────────────┬─────────────┐       │
│   │ Attribut        │   SAP   │     GWR     │  Korrektur  │       │
│   │                 │(locked) │  (lookup)   │  (input)    │       │
│   ├─────────────────┼─────────┼─────────────┼─────────────┤       │
│   │ Gebäude im GWR? │    -    │  [ Ja ▼ ]   │      -      │ ← NEW │
│   │                 │         │   ↑edit     │             │  row  │
│   ├─────────────────┼─────────┼─────────────┼─────────────┤       │
│   │ EGID            │    -    │  [1456789]  │      -      │ ← GWR │
│   │                 │         │   ↑edit     │             │  only │
│   ├─────────────────┼─────────┼─────────────┼─────────────┤       │
│   │ PLZ             │  8280   │    8280     │ [        ]  │ ← Kor │
│   │ Ort             │ Kreuz.  │   Kreuz.    │ [        ]  │  only │
│   │ Strasse         │ Hauptst │  Hauptstr.  │ [        ]  │       │
│   │ ...             │  ...    │    ...      │ [        ]  │       │
│   └─────────────────┴─────────┴─────────────┴─────────────┘       │
│                                                                    │
│   Map: Uses separate mapLat/mapLng (draggable in edit mode)       │
│                                                                    │
│                     [ Abbrechen ]  [ Speichern ]                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```
