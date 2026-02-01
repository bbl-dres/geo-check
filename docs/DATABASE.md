# DATABASE.md - Geo-Check Data Model

This document describes the conceptual data model for the Geo-Check application, including entity definitions, relationships, and code lists from the Swiss Federal Register of Buildings and Dwellings (GWR).

---

## 1. Conceptual Model Overview

Geo-Check manages Swiss federal building data by comparing records from three authoritative sources:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BUILDING RECORD                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐    ┌───────────┐    ┌───────────┐                       │
│  │  GEOREF   │    │  SAP RE-FX│    │    GWR    │                       │
│  │ (Federal  │    │ (Property │    │ (Building │                       │
│  │  Geodata) │    │  Mgmt)    │    │  Register)│                       │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘                       │
│        │                │                │                              │
│        └────────────────┼────────────────┘                              │
│                         ▼                                               │
│              ┌─────────────────────┐                                    │
│              │   DATA COMPARISON   │                                    │
│              │   & VALIDATION      │                                    │
│              └──────────┬──────────┘                                    │
│                         ▼                                               │
│              ┌─────────────────────┐                                    │
│              │  CONFIDENCE SCORE   │                                    │
│              │  (0-100%)           │                                    │
│              └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Sources

| Source | Full Name | Purpose |
|--------|-----------|---------|
| **GEOREF** | Federal Geodata Reference | Official coordinates and geographic boundaries |
| **SAP RE-FX** | SAP Real Estate Management | Federal property management system |
| **GWR** | Gebäude- und Wohnungsregister | Swiss Federal Register of Buildings and Dwellings |

---

## 2. Entity Definitions

### 2.1 Building (Gebäude)

The primary entity representing a federal building record.

#### Current Structure

```json
{
  "id": "1080/2020/AA",
  "name": "Romanshorn, Friedrichshafnerstrasse",
  "lat": 47.5656,
  "lng": 9.3744,
  "kanton": "TG",
  "portfolio": "Büro",
  "priority": "medium",
  "confidence": { ... },
  "assignee": "M. Keller",
  "kanbanStatus": "inprogress",
  "data": { ... },
  "lastUpdate": "2026-01-27T14:30:00Z",
  "lastUpdateBy": "M. Keller",
  "dueDate": "2026-02-15"
}
```

#### Proposed Structure (with Address Components)

```json
{
  "id": "1080/2020/AA",
  "name": "Romanshorn, Friedrichshafnerstrasse",
  "lat": 47.5656,
  "lng": 9.3744,
  "kanton": "TG",
  "portfolio": "Büro",
  "priority": "medium",
  "confidence": { ... },
  "assignee": "M. Keller",
  "kanbanStatus": "inprogress",
  "data": {
    "country": { "sap": "CH", "gwr": "CH", "match": true },
    "kanton": { "sap": "TG", "gwr": "TG", "match": true },
    "gemeinde": { "sap": "Romanshorn", "gwr": "Romanshorn", "match": true },
    "plz": { "sap": "8590", "gwr": "8590", "match": true },
    "ort": { "sap": "Romanshorn", "gwr": "Romanshorn", "match": true },
    "strasse": { "sap": "Friedrichshafnerstr.", "gwr": "Friedrichshafnerstrasse", "match": false },
    "hausnummer": { "sap": "12", "gwr": "12", "match": true },
    "zusatz": { "sap": "", "gwr": "", "match": true },
    "gkat": { "sap": "1060", "gwr": "1060", "match": true },
    "gklas": { "sap": "1220", "gwr": "1220", "match": true },
    "coords": { "sap": "47.5656, 9.3744", "gwr": "47.5656, 9.3744", "match": true },
    "egid": { "sap": "2340212", "gwr": "2340212", "match": true },
    "year": { "sap": "1965", "gwr": "1967", "match": false }
  },
  "lastUpdate": "2026-01-27T14:30:00Z",
  "lastUpdateBy": "M. Keller",
  "dueDate": "2026-02-15"
}
```

### 2.2 Building Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | SAP property ID (format: `XXXX/YYYY/ZZ`) |
| `name` | string | Yes | Display name (City, Street) |
| `lat` | number | Yes | WGS84 latitude |
| `lng` | number | Yes | WGS84 longitude |
| `kanton` | string | Yes | 2-letter canton code |
| `portfolio` | string | Yes | Building usage category (internal) |
| `priority` | string | Yes | Task priority: `low`, `medium`, `high` |
| `confidence` | object | Yes | Confidence scores per source |
| `assignee` | string | No | Assigned team member name |
| `kanbanStatus` | string | Yes | Workflow status |
| `data` | object | Yes | Source comparison data |
| `lastUpdate` | string | Yes | ISO 8601 timestamp |
| `lastUpdateBy` | string | Yes | Last editor name |
| `dueDate` | string | No | ISO 8601 date |

### 2.3 Confidence Object

```json
{
  "total": 67,
  "georef": 67,
  "sap": 100,
  "gwr": 100
}
```

| Field | Range | Description |
|-------|-------|-------------|
| `total` | 0-100 | Weighted overall confidence |
| `georef` | 0-100 | GEOREF data completeness |
| `sap` | 0-100 | SAP RE-FX data completeness |
| `gwr` | 0-100 | GWR data completeness |

**Confidence Thresholds:**
- Critical: < 50% (red)
- Warning: 50-80% (orange)
- OK: >= 80% (green)

---

## 3. Address Components

### 3.1 Overview

Swiss addresses follow a hierarchical structure. For federal buildings, we track both the official municipality (Gemeinde) and the postal locality (Ort), as these can differ.

```
┌─────────────────────────────────────────┐
│ Country (Land)           CH             │
├─────────────────────────────────────────┤
│ Canton (Kanton)          TG             │
├─────────────────────────────────────────┤
│ Municipality (Gemeinde)  Romanshorn     │
├─────────────────────────────────────────┤
│ Postal Code (PLZ)        8590           │
├─────────────────────────────────────────┤
│ Locality (Ort)           Romanshorn     │
├─────────────────────────────────────────┤
│ Street (Strasse)         Hauptstrasse   │
├─────────────────────────────────────────┤
│ House Number (Hausnummer) 12            │
├─────────────────────────────────────────┤
│ Supplement (Zusatz)      Eingang B      │
└─────────────────────────────────────────┘
```

### 3.2 Address Fields

| Field | German | Example | Description |
|-------|--------|---------|-------------|
| `country` | Land | "CH" | ISO 3166-1 alpha-2 country code. Required because some federal buildings near borders may geocode outside Switzerland. |
| `kanton` | Kanton | "TG" | 2-letter canton abbreviation |
| `gemeinde` | Gemeinde | "Romanshorn" | Official municipality name (BFS Gemeindenummer) |
| `plz` | PLZ | "8590" | 4-digit Swiss postal code |
| `ort` | Ort | "Romanshorn" | Postal locality name (can differ from Gemeinde) |
| `strasse` | Strasse | "Hauptstrasse" | Street name without house number |
| `hausnummer` | Hausnummer | "12" | House/building number (may include letters: "12a") |
| `zusatz` | Zusatz | "Eingang B" | Address supplement (entrance, floor, c/o, etc.) |

### 3.3 Gemeinde vs. Ort

In Switzerland, the official municipality (Gemeinde) and postal locality (Ort) can differ:

| Situation | Gemeinde | Ort | PLZ |
|-----------|----------|-----|-----|
| Same | Zürich | Zürich | 8001 |
| Different | Arlesheim | Münchenstein | 4142 |
| Multiple PLZ | Bern | Bern | 3000-3030 |

---

## 4. Building Usage (Nutzung)

### 4.1 Internal Portfolio Categories

The application uses simplified portfolio categories for filtering:

| Portfolio | German | Description |
|-----------|--------|-------------|
| `Büro` | Büro | Office buildings |
| `Wohnen` | Wohnen | Residential buildings |
| `Öffentlich` | Öffentlich | Public/government buildings |
| `Industrie` | Industrie | Industrial buildings |
| `Bildung` | Bildung | Educational buildings |

### 4.2 GWR Building Category (GKAT)

High-level building classification in GWR:

| Code | Short | Description |
|------|-------|-------------|
| 1010 | Prov. Unterkunft | Provisorische Unterkunft |
| 1020 | Mit Wohnnutzung | Gebäude mit ausschliesslicher Wohnnutzung |
| 1021 | Einfamilienhaus | Einfamilienhaus, ohne Nebennutzung |
| 1025 | Mehrfamilienhaus | Mehrfamilienhaus, ohne Nebennutzung |
| 1030 | Wohngebäude m. Nebennutzung | Andere Wohngebäude (mit Nebennutzung) |
| 1040 | Mit teilw. Wohnnutzung | Gebäude mit teilweiser Wohnnutzung |
| 1060 | Ohne Wohnnutzung | Gebäude ohne Wohnnutzung |
| 1080 | Sonderbau | Sonderbau |

### 4.3 GWR Building Class (GKLAS)

Detailed building classification (EUROSTAT-based):

| Code | Short | Description |
|------|-------|-------------|
| 1110 | Gebäude mit 1 Wohnung | Gebäude mit einer Wohnung |
| 1121 | Gebäude mit 2 Wohnungen | Gebäude mit zwei Wohnungen |
| 1122 | Gebäude mit 3+ Wohnungen | Gebäude mit drei oder mehr Wohnungen |
| 1130 | Wohngeb. f. Gemeinschaften | Wohngebäude für Gemeinschaften |
| 1211 | Hotelgebäude | Hotelgebäude |
| 1212 | Andere Beherbergung | Andere Gebäude für kurzfristige Beherbergung |
| 1220 | Bürogebäude | Bürogebäude |
| 1230 | Gross- und Einzelhandel | Gross- und Einzelhandelsgebäude |
| 1231 | Restaurants und Bars | Restaurants und Bars in Gebäuden ohne Wohnnutzung |
| 1241 | Verkehr / Kommunikation | Gebäude des Verkehrs- und Nachrichtenwesens ohne Garagen |
| 1242 | Garagengebäude | Garagengebäude |
| 1251 | Industriegebäude | Industriegebäude |
| 1252 | Behälter, Silo, Lager | Behälter, Silos und Lagergebäude |
| 1261 | Kultur-/Freizeitstätte | Gebäude für Kultur- und Freizeitzwecke |
| 1262 | Museum / Bibliothek | Museen und Bibliotheken |
| 1263 | Schul-/Hochschulgebäude | Schul- und Hochschulgebäude, Forschungseinrichtungen |
| 1264 | Krankenhaus | Krankenhäuser und Facheinrichtungen des Gesundheitswesens |
| 1265 | Sporthalle | Sporthallen |
| 1271 | Landw. Betriebsgebäude | Landwirtschaftliche Betriebsgebäude |
| 1272 | Kirche / Kultgebäude | Kirchen und sonstige Kultgebäude |
| 1273 | Denkmal | Denkmäler oder unter Denkmalschutz stehende Bauwerke |
| 1274 | Sonstiger Hochbau | Sonstige Hochbauten, anderweitig nicht genannt |
| 1275 | Andere kollektive Unterkünfte | Andere Gebäude für die kollektive Unterkunft |
| 1276 | Tierhaltung | Gebäude für die Tierhaltung |
| 1277 | Pflanzenbau | Gebäude für den Pflanzenbau |
| 1278 | Andere landw. Gebäude | Andere landwirtschaftliche Gebäude |

### 4.4 Portfolio to GKLAS Mapping

| Portfolio | Typical GKLAS Codes |
|-----------|---------------------|
| Büro | 1220 |
| Wohnen | 1110, 1121, 1122, 1130 |
| Öffentlich | 1261, 1262, 1263, 1264, 1272 |
| Industrie | 1251, 1252, 1241, 1242 |
| Bildung | 1263 |

---

## 5. Workflow & Task Management

### 5.1 Kanban Status

| Status | German | Description |
|--------|--------|-------------|
| `backlog` | Backlog | Not yet started |
| `inprogress` | In Bearbeitung | Currently being worked on |
| `clarification` | Abklärung | Requires clarification or external input |
| `done` | Erledigt | Completed |

### 5.2 Priority Levels

| Priority | German | Criteria |
|----------|--------|----------|
| `high` | Hoch | Critical data issues, urgent deadline |
| `medium` | Mittel | Moderate issues, standard deadline |
| `low` | Niedrig | Minor issues, no urgency |

---

## 6. Related Entities

### 6.1 User (Benutzer)

```json
{
  "id": 1,
  "name": "M. Keller",
  "initials": "MK",
  "role": "Admin",
  "openTasks": 3
}
```

| Role | Description |
|------|-------------|
| `Admin` | Full access, can manage users |
| `Bearbeiter` | Can edit buildings, manage tasks |
| `Leser` | Read-only access |

### 6.2 Error (Fehler)

```json
{
  "type": "georef",
  "title": "Koordinatenabweichung",
  "description": "SAP - GWR: 47m Differenz",
  "severity": "warning"
}
```

| Severity | Description |
|----------|-------------|
| `critical` | Major data inconsistency |
| `warning` | Notable discrepancy |
| `minor` | Small difference |

### 6.3 Comment (Kommentar)

```json
{
  "author": "M. Keller",
  "date": "12.01.2026",
  "text": "Vor Ort verifiziert - GWR Position ist korrekt.",
  "system": false
}
```

### 6.4 Event (Ereignis)

```json
{
  "id": 1,
  "buildingId": "1080/2020/AA",
  "type": "comment",
  "action": "Kommentar hinzugefügt",
  "user": "M. Keller",
  "timestamp": "2026-01-12T14:32:00",
  "details": "..."
}
```

| Event Type | Description |
|------------|-------------|
| `comment` | Comment added |
| `assignment` | Assignee changed |
| `detection` | Error detected |
| `status_change` | Status updated |

---

## 7. Code Lists (GWR)

### 7.1 Building Status (GSTAT)

| Code | Short | Description |
|------|-------|-------------|
| 1001 | projektiert | Gebäude projektiert |
| 1002 | bewilligt | Gebäude bewilligt |
| 1003 | im Bau | Gebäude im Bau |
| 1004 | bestehend | Gebäude bestehend |
| 1005 | nicht nutzbar | Gebäude nicht nutzbar |
| 1007 | abgebrochen | Gebäude abgebrochen |
| 1008 | nicht realisiert | Gebäude nicht realisiert |

### 7.2 Construction Period (GBAUP)

| Code | Short | Description |
|------|-------|-------------|
| 8011 | Vor 1919 | Periode vor 1919 |
| 8012 | 1919-1945 | Periode von 1919 bis 1945 |
| 8013 | 1946-1960 | Periode von 1946 bis 1960 |
| 8014 | 1961-1970 | Periode von 1961 bis 1970 |
| 8015 | 1971-1980 | Periode von 1971 bis 1980 |
| 8016 | 1981-1985 | Periode von 1981 bis 1985 |
| 8017 | 1986-1990 | Periode von 1986 bis 1990 |
| 8018 | 1991-1995 | Periode von 1991 bis 1995 |
| 8019 | 1996-2000 | Periode von 1996 bis 2000 |
| 8020 | 2001-2005 | Periode von 2001 bis 2005 |
| 8021 | 2006-2010 | Periode von 2006 bis 2010 |
| 8022 | 2011-2015 | Periode von 2011 bis 2015 |
| 8023 | Nach 2015 | Periode nach 2015 |

### 7.3 Energy Source for Heating (GENH1)

| Code | Short | Description |
|------|-------|-------------|
| 7500 | Keine | Keine |
| 7501 | Luft | Luft |
| 7510 | Erdwärme (generisch) | Erdwärme (generisch) |
| 7511 | Erdwärmesonde | Erdwärmesonde |
| 7512 | Erdregister | Erdregister |
| 7513 | Wasser | Wasser (Grundwasser, Oberflächenwasser, Abwasser) |
| 7520 | Gas | Gas |
| 7530 | Heizöl | Heizöl |
| 7540 | Holz (generisch) | Holz (generisch) |
| 7541 | Holz (Stückholz) | Holz (Stückholz) |
| 7542 | Holz (Pellets) | Holz (Pellets) |
| 7543 | Holz (Schnitzel) | Holz (Schnitzel) |
| 7550 | Abwärme | Abwärme (innerhalb des Gebäudes) |
| 7560 | Elektrizität | Elektrizität |
| 7570 | Sonne (thermisch) | Sonne (thermisch) |
| 7580 | Fernwärme (generisch) | Fernwärme (generisch) |
| 7581 | Fernwärme (Hochtemperatur) | Fernwärme (Hochtemperatur) |
| 7582 | Fernwärme (Niedertemperatur) | Fernwärme (Niedertemperatur) |
| 7598 | Unbestimmt | Unbestimmt |
| 7599 | Andere | Andere |

### 7.4 Heat Generator (GWAERZH1)

| Code | Short | Description |
|------|-------|-------------|
| 7400 | Kein Wärmeerzeuger | Kein Wärmeerzeuger |
| 7410 | Wärmepumpe f. ein Geb. | Wärmepumpe für ein Gebäude |
| 7411 | Wärmepumpe f. mehr. Geb. | Wärmepumpe für mehrere Gebäude |
| 7420 | Therm. Solaranlage ein Geb. | Thermische Solaranlage für ein Gebäude |
| 7421 | Therm. Solaranlage mehr. Geb. | Thermische Solaranlage für mehrere Gebäude |
| 7430 | Heizkessel (gen.) ein Geb. | Heizkessel (generisch) für ein Gebäude |
| 7431 | Heizkessel (gen.) mehr. Geb. | Heizkessel (generisch) für mehrere Gebäude |
| 7432 | Heizkessel nicht kond. ein Geb. | Heizkessel nicht kondensierend für ein Gebäude |
| 7433 | Heizkessel nicht kond. mehr. Geb. | Heizkessel nicht kondensierend für mehrere Gebäude |
| 7434 | Heizkessel kond. ein Geb. | Heizkessel kondensierend für ein Gebäude |
| 7435 | Heizkessel kond. mehr. Geb. | Heizkessel kondensierend für mehrere Gebäude |
| 7436 | Ofen | Ofen |
| 7440 | WKK-Anlage ein Geb. | Wärmekraftkopplungsanlage für ein Gebäude |
| 7441 | WKK-Anlage mehr. Geb. | Wärmekraftkopplungsanlage für mehrere Gebäude |
| 7450 | Elektro-Zentralheizung ein Geb. | Elektrospeicher-Zentralheizung für ein Gebäude |
| 7451 | Elektro-Zentralheizung mehr. Geb. | Elektrospeicher-Zentralheizung für mehrere Gebäude |
| 7452 | Elektro direkt | Elektro direkt |
| 7460 | Wärmetauscher ein Geb. | Wärmetauscher (inkl. Fernwärme) für ein Gebäude |
| 7461 | Wärmetauscher mehr. Geb. | Wärmetauscher (inkl. Fernwärme) für mehrere Gebäude |
| 7499 | Andere | Andere |

### 7.5 Heating Type (GHEIZ)

| Code | Short | Description |
|------|-------|-------------|
| 7100 | Keine Heizung | Keine Heizung |
| 7101 | Einzelofenheizung | Einzelofenheizung |
| 7102 | Etagenheizung | Etagenheizung |
| 7103 | Zentralheizung f. Geb. | Zentralheizung für das Gebäude |
| 7104 | ZH f. mehrere Gebäude | Zentralheizung für mehrere Gebäude |
| 7105 | Fernwärmeversorgung | Öffentliche Fernwärmeversorgung |
| 7109 | Andere Heizungsart | Andere Heizungsart |

---

## 8. Swiss Canton Codes

| Code | Name | Name (German) |
|------|------|---------------|
| AG | Aargau | Aargau |
| AI | Appenzell Innerrhoden | Appenzell Innerrhoden |
| AR | Appenzell Ausserrhoden | Appenzell Ausserrhoden |
| BE | Bern | Bern |
| BL | Basel-Landschaft | Basel-Landschaft |
| BS | Basel-Stadt | Basel-Stadt |
| FR | Fribourg | Freiburg |
| GE | Geneva | Genf |
| GL | Glarus | Glarus |
| GR | Graubünden | Graubünden |
| JU | Jura | Jura |
| LU | Lucerne | Luzern |
| NE | Neuchâtel | Neuenburg |
| NW | Nidwalden | Nidwalden |
| OW | Obwalden | Obwalden |
| SG | St. Gallen | St. Gallen |
| SH | Schaffhausen | Schaffhausen |
| SO | Solothurn | Solothurn |
| SZ | Schwyz | Schwyz |
| TG | Thurgau | Thurgau |
| TI | Ticino | Tessin |
| UR | Uri | Uri |
| VD | Vaud | Waadt |
| VS | Valais | Wallis |
| ZG | Zug | Zug |
| ZH | Zürich | Zürich |

---

## 9. Data Comparison Logic

### 9.1 Match Determination

Each field in `data` contains SAP and GWR values with a `match` boolean:

```json
{
  "strasse": {
    "sap": "Hauptstrasse",
    "gwr": "Hauptstr.",
    "match": false
  }
}
```

**Match Rules:**
- Exact string match (case-insensitive)
- Coordinate match: within 5m tolerance
- PLZ match: exact 4-digit match
- Empty values ("—" or "") never match non-empty values

### 9.2 Confidence Calculation

```
total = (georef_weight × georef_score +
         sap_weight × sap_score +
         gwr_weight × gwr_score) / total_weight
```

Source weights are configurable in validation rules.

---

## 10. References

- [GWR Merkmalskatalog 4.2](https://www.housing-stat.ch/de/help/42.html) - Official attribute catalog
- [Swisstopo API](https://api3.geo.admin.ch/) - Swiss geographic services
- [BFS Gemeinderegister](https://www.bfs.admin.ch/bfs/de/home/grundlagen/agvch.html) - Municipality register

---

*Last updated: 2026-02-01*
