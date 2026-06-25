# Data Model — Data-Check

**The input/output data model for `data-check`: a browser-based engine that
checks building and parcel master data against the official Swiss registers
(GWR, official address directory, ÖREB cadastre) and reports where the records
disagree.**

This document defines *what data flows through the engine* — the input schema,
the official reference records, the reconciled record model, findings,
confidence, and the exported outputs. The rule catalogue that operates on this
model lives in [CHECKING-RULES.md](CHECKING-RULES.md).

`data-check` consolidates the ideas of two earlier projects: the client-side
GWR enrichment of [`../gwr-check/`](../gwr-check/) and the rule engine +
multi-source reconciliation of [`../prototype-quality/`](../prototype-quality/),
plus the parcel/E-GRID logic of [`../oereb-check/`](../oereb-check/).

| | |
|---|---|
| **Runtime** | Browser-only — static app, no build step, no backend. All checking runs in the browser; **input data never leaves the device**. |
| **Reference data** | Official Swiss registers via the public swisstopo / BFS APIs (no API key, CORS-enabled). |
| **Objects checked** | **Buildings** (EGID → GWR) and **Parcels / land** (E-GRID → ÖREB cadastre), grouped by economic unit. |
| **Core pattern** | Three-Value reconciliation — every comparable field carries *your* value, the *official* value, an optional *correction*, and a *match* flag. |
| **Outputs** | Enriched records (CSV/XLSX), findings (CSV), GeoJSON, a self-contained interactive HTML report, and a machine-readable JSON snapshot. |

---

## 1. Principles

1. **Official data is the reference, not the truth-by-fiat.** The engine
   compares your records against the federal registers and *flags* divergence;
   it never silently overwrites. A divergence can be a real error in your data,
   a stale register, or a legitimate exception (see §10).
2. **Local-first.** Records are parsed and checked entirely in the browser.
   Only the *keys* needed for a lookup (EGID, E-GRID, an address string) are
   sent to the public APIs — never the full internal record.
3. **One field, four facets.** Every comparable attribute is a *SourceField*
   (§4): `internal`, `official`, `correction`, `match`. This is the unit the
   rules read and the corrections write.
4. **Switzerland-aware.** ~1 100 foreign properties (embassies, consulates)
   legitimately have no Swiss EGID/E-GRID; they are marked `foreign`, not
   flagged as missing. See [CHECKING-RULES.md §4](CHECKING-RULES.md).
5. **Maps are optional.** The product is a *checking engine + report*, not a map
   tool. Coordinates are first-class **data** (used for distance rules); a map
   is at most a secondary view, never the primary surface.

---

## 2. Official reference data sources

All default sources are public, keyless, and CORS-enabled, so they work from a
static page (even `file://`). Coordinates are requested in **LV95 (EPSG:2056,
metres)** so distances are exact planar calculations; WGS84 (`sr=4326`) is
available for mapping.

| Source | Role | Layer / endpoint | Key? |
|---|---|---|---|
| **GWR** — Gebäude- und Wohnungsregister (BFS), served via swisstopo | Authoritative building record: address, classification, measurements, coordinates, **and** the building's parcel E-GRID | `api3.geo.admin.ch/.../MapServer/ch.bfs.gebaeude_wohnungs_register` (used today by `../gwr-check/`) | none |
| **Official building-address directory** (amtliches Gebäudeadressverzeichnis) | Authoritative street / house-number / locality for address checks | Carried by the GWR layer above (street `strname`, number `deinr`, ZIP `dplz4`, locality `dplzname`) | none |
| **ÖREB cadastre / cadastral parcels** | Authoritative parcel by E-GRID: geometry, centroid, area, municipality | `api3.geo.admin.ch/.../MapServer/find` on the ÖREB/cadastre layer, `searchField=egris_egrid` (as in `../oereb-check/`) | none |
| **GeoAdmin geocoder** (SearchServer) | Address → coordinate, for the address↔coordinate distance check | `api3.geo.admin.ch/rest/services/api/SearchServer?type=locations` | none |
| *(optional)* **Federal GWR web service** — GWR-Webdienst, `madd.bfs.admin.ch` | Direct federated GWR query (richest, e.g. dwellings) | registration-gated | **yes** |

> The registration-gated GWR-Webdienst is **out of scope for the browser-only
> default** (a secret key cannot live in a public static page). The open
> geo.admin.ch GWR layer carries everything the rules below need. If a keyed
> deployment is ever wanted, it slots in as an alternative `official` provider
> without changing this data model.

### 2.1 Lookup strategy (per the gwr-check reference)

- **Buildings:** batch up to ~50 EGIDs per request
  (`.../{egid1_0,egid2_0,…}?returnGeometry=true&sr=2056`); on a batch 404, fall
  back to per-EGID requests (bounded concurrency) so one bad key doesn't void
  the batch. Results are cached per run; a not-found EGID is cached as `null`.
- **Parcels:** `find` by `egris_egrid`, returning centroid + geometry + area.
- Throttle between batches (~300 ms) to stay friendly to the public API.

---

## 3. Object model overview

```
CheckRun ──┬── (1:N) EconomicUnit (WE)
           │          ├── (1:N) Building   ──┐
           │          └── (1:N) Parcel      ─┤ cross-linked by E-GRID
           │                                 │
           ├── (1:N) Finding  ───────────────┘  (refers to a Building/Parcel/WE + a field)
           └── (1:N) Correction (field-level, optional workflow)

Building / Parcel ── each comparable attribute is a SourceField {internal, official, correction, match}
Building / Parcel ── carries one Confidence {total + 5 dimension scores}
```

| Entity | What it is | Key |
|---|---|---|
| **CheckRun** | One execution over an uploaded dataset; holds metadata, options, source-file info, and the produced findings/confidence. | run id (timestamp) |
| **EconomicUnit (WE)** | The grouping that ties buildings and parcels together (the SAP *Wirtschaftseinheit*); the scope for cross-checks like parcel-far and building↔parcel linkage. | `we` |
| **Building** | One building record reconciled against GWR. | `internal_id` |
| **Parcel** | One parcel/land record reconciled against the ÖREB cadastre. | `internal_id` |
| **SourceField** | One comparable attribute, four facets (§4). | — |
| **Finding** | One rule violation on an object/field. | `rule_id` + object |
| **Confidence** | Per-object data-quality score across 5 dimensions (§7). | — |
| **Correction** | A user-supplied corrected value for a field, with workflow status (§8). | object + field |

The **EconomicUnit** grouping is what makes parcel/land data useful as an
*additional input* rather than a separate silo: a building's GWR parcel can be
cross-checked against the parcels recorded for the same WE
([CHECKING-RULES.md §QP](CHECKING-RULES.md)).

---

## 4. The SourceField (Three-Value Pattern)

The atomic unit of the model. Every comparable attribute is stored not as a bare
value but as a four-facet object, so the engine can compare, correct, and
explain without losing provenance.

```jsonc
{
  "internal":   "Bundesplatz",   // your value (e.g. from a SAP/RE-FX export)
  "official":   "Bundesplatz",   // value from the authoritative register (GWR/ÖREB)
  "correction": "",              // user-supplied corrected value ("" = none)
  "match":      true             // normalised(internal) === normalised(official)
}
```

**Canonical value priority** — when a single value is needed (export, map,
downstream system):

```
correction  >  official  >  internal
```

i.e. a human-verified correction wins; absent that, the authoritative register
wins; absent that, fall back to the internal value.

**`match` semantics.** `match` is computed by a normalising comparison, not a
raw string equality:

- case-insensitive, whitespace-trimmed
- street-type abbreviation expansion (`Str.` ↔ `Strasse`, `pl.` ↔ `Platz`, …)
- empty values treated uniformly (both empty ⇒ not a mismatch)
- numeric fields compared as numbers; coordinates compared by **distance**, not
  equality (see §6)

**Per-field comparison status.** Beyond the boolean `match`, each field also
resolves to a finer status used by the report and the rules:

| status | meaning |
|---|---|
| `exact` | normalised values identical (or coordinate distance < near-threshold) |
| `similar` | high string similarity (≥ 0.7) or coordinate distance within tolerance |
| `mismatch` | values differ beyond tolerance |
| `empty` | one side missing → not comparable (excluded from scoring) |

---

## 5. Input data model

Input is one or two delimited files (CSV/TSV/XLSX), auto-detected delimiter,
headers normalised to lowercase. A **buildings** file and an optional
**parcels** file (the two SAP "Dynamische Listenausgabe" exports of
`../oereb-check/`), or a single combined file. Column names are matched
case-insensitively against the canonical names below **plus** known aliases, so
real-world exports map without manual editing.

### 5.1 Buildings — input columns

| Canonical field | Required | Maps to (dimension) | GWR alias | Notes |
|---|:---:|---|---|---|
| `internal_id` | ✅ | — | — | Unique record id (e.g. SAP `WE/Gebäude`). |
| `egid` | ✅ | Identification | `egid` | Foreign key into GWR. Positive integer, else `skipped`. |
| `we` | ○ | — | — | Economic-unit id; enables cross-checks. |
| `name` | ○ | — | — | Display label; also drives default exclusions (§9 of rules). |
| `country` | ○ | Address | — | `CH` vs foreign → drives Switzerland-awareness. |
| `canton` | ○ | Address | `gdekt` | |
| `municipality` | ○ | Address | `ggdename` | |
| `bfs_nr` | ○ | Address | `ggdenr` | Municipality number. |
| `zip` | ○ | Address | `dplz4` | |
| `locality` | ○ | Address | `dplzname` | |
| `street` | ○ | Address | `strname` | |
| `house_number` | ○ | Address | `deinr` | |
| `address_suffix` | ○ | Address | — | |
| `lat`, `lng` *or* `coord_e`, `coord_n` | ○ | Location | `geometry` / `gkode`,`gkodn` | WGS84 **or** LV95; LV95 preferred for distance. |
| `building_category` | ○ | Classification | `gkat` | GKAT code. |
| `building_class` | ○ | Classification | `gklas` | GKLAS code. |
| `building_status` | ○ | Classification | `gstat` | GSTAT code. |
| `construction_period` | ○ | Classification | `gbaup` | GBAUP code. |
| `year_built` | ○ | Classification | `gbauj` | |
| `floors` | ○ | Measurements | `gastw` | |
| `dwellings` | ○ | Measurements | `ganzwhg` | |
| `building_area` | ○ | Measurements | `garea` | m². |
| `comment` | ○ | — | — | Pass-through, never validated. |

Only `internal_id` + `egid` are required; every other column, if present,
becomes the `internal` side of its SourceField and is reconciled against the
official value. Absent columns simply don't contribute findings or confidence.

### 5.2 Parcels — input columns

| Canonical field | Required | Maps to | ÖREB alias | Notes |
|---|:---:|---|---|---|
| `internal_id` | ✅ | — | — | Unique parcel record id. |
| `egrid` | ✅ | Identification | `egris_egrid` | Foreign key into the cadastre. `CH`+12 alphanum, else `missing`/`skipped`. |
| `we` | ○ | — | — | Ties the parcel to its building cluster. |
| `name` | ○ | — | — | Drives exclusions (e.g. parking `PP`). |
| `country` | ○ | — | — | Foreign-awareness. |
| `municipality` | ○ | Address | — | |
| `canton` | ○ | Address | — | |
| `parcel_area` | ○ | Measurements | `flaeche` | m². |

### 5.3 Validation & normalisation at intake

- File must have a header + ≥ 1 data row; fully empty rows dropped.
- `egid` must be a positive integer or the building is `skipped`
  (status, not an error).
- `egrid` is normalised; `0000000000`/blank/format-invalid ⇒ `missing`.
- A building/parcel with `country ≠ CH` and no key ⇒ `foreign` (not flagged).
- Headers and values trimmed; numbers parsed locale-tolerantly.

---

## 6. Reconciled record model (after the official lookup)

After fetching the official record, every input field becomes a populated
SourceField and the object carries its lookup status and confidence.

**Building object (shape):**

```jsonc
{
  "internal_id": "1502/AA",
  "we": "1502",
  "lookup_status": "matched",        // matched | not_found | skipped | foreign
  "egid":  { "internal": "1231641", "official": "1231641", "correction": "", "match": true },
  "egrid": { "internal": "",        "official": "CH807…",  "correction": "", "match": false }, // building's GWR parcel
  "street":       { "internal": "Beaulieustr.", "official": "Beaulieustrasse", "correction": "", "match": true },
  "house_number": { "internal": "2", "official": "2", "correction": "", "match": true },
  "zip":          { "internal": "3012", "official": "3012", "correction": "", "match": true },
  "locality":     { "internal": "Bern", "official": "Bern", "correction": "", "match": true },
  "lat": { "internal": "46.958", "official": "46.9579", "correction": "", "match": true },
  "lng": { "internal": "7.431",  "official": "7.4312",  "correction": "", "match": true },
  "building_status": { "internal": "1004", "official": "1004", "correction": "", "match": true },
  "...": "…remaining classification & measurement fields…",
  "distance_m": 12,                  // internal vs official coordinate (LV95)
  "confidence": { "total": 96, "identification": 100, "address": 100, "location": 100, "classification": 100, "measurements": null },
  "findings": ["GEO-… ", "…"]        // rule_ids that fired on this object
}
```

`lookup_status` ∈:

| value | meaning |
|---|---|
| `matched` | key resolved in the register; fields reconciled. |
| `not_found` | key syntactically valid but absent in the register (stale/wrong). |
| `skipped` | key missing or malformed → not looked up. |
| `foreign` | non-CH object legitimately without a Swiss key. |

**Official record fields fetched & resolved.** From GWR (buildings): `egid`,
`egrid`, `strname`, `deinr`, `dplz4`, `dplzname`, `ggdename`, `ggdenr`, `gdekt`,
`gkat`, `gklas`, `gstat`, `gbaup`, `gbauj`, `garea`, `gastw`, `ganzwhg`,
`gkode`/`gkodn` (LV95), `geometry` (WGS84), `lparz`. From the ÖREB cadastre
(parcels): centroid, polygon geometry, `flaeche`, municipality. Coded GWR fields
(`gkat`, `gstat`, `gklas`, `gbaup`, `gksce`, heating codes …) are resolved to
readable DE/FR/IT/EN labels via the shared code table (as in
[`../gwr-check/data/gwr-codes.json`](../gwr-check/data/gwr-codes.json)).

---

## 7. Confidence model

Each object carries a confidence score: a per-dimension and overall measure of
how well its fields agree with the official register. Adopted from
`../prototype-quality/` (five dimensions), aligned to the field groups in §5.

| Dimension | Fields | Weight |
|---|---|---|
| **Identification** | `egid`, `egrid` | 0.30 |
| **Address** | `zip`, `locality`, `street`, `house_number` | 0.30 |
| **Location** | `lat`/`lng` (or `coord_e`/`coord_n`) | 0.20 |
| **Classification** | `building_category`, `building_class`, `building_status`, `construction_period`, `year_built` | 0.10 |
| **Measurements** | `floors`, `dwellings`, `building_area`, `parcel_area` | 0.10 |

**Per-dimension score** — share of *present* fields that are *resolved*:

```
dimension_score = round( resolved / present × 100 )

present   = fields where internal OR official has data
resolved  = fields where match === true  OR  correction is set
          → null if present === 0  (dimension excluded from the total)
```

**Overall** — weighted mean, with weight redistributed away from null
dimensions (so a record with no measurement data isn't penalised for it):

```
total = round( Σ(dimension_score × weight) / Σ(weight) )   over non-null dimensions
        clamped to [0, 100]
```

**Confidence tiers** (for filtering & colour priority):

| tier | range |
|---|---|
| **OK** | ≥ 80 |
| **Warning** | 50 – 79 |
| **Critical** | < 50 |

> Confidence answers *"how aligned is this record overall?"*; **findings**
> (§ next) answer *"which specific rules failed?"*. The two are complementary —
> a record can be high-confidence yet still carry one `info` finding, or
> low-confidence with a single decisive `error`.

---

## 8. Finding model

A finding is one rule violation. It is the engine's primary output and the row
unit of `findings.csv`.

| Field | Meaning |
|---|---|
| `rule_id` | Rule that fired, e.g. `ADR-007`, `GEO-002`, `QP-01` (see CHECKING-RULES.md). |
| `severity` | `error` / `warning` / `info` (≙ HIGH / MED / LOW). |
| `rule_set` | `identification` / `address` / `location` / `classification` / `measurements` / `crosscheck`. |
| `object_kind` | `building` / `parcel` / `crosscheck`. |
| `internal_id` | The object the finding is about. |
| `we` | Economic unit (for grouping). |
| `field` | Affected field (nullable for object-level findings). |
| `message` | Human-readable detail (multilingual via message-key + args, like `../oereb-check/`). |
| `suggested_value` | Proposed correction when derivable (e.g. the GWR parcel E-GRID), else empty. |
| `distance_m` | Distance in metres (location rules only). |
| `detected_at` | Run timestamp. |
| `status` | `open` / `corrected` / `accepted` / `dismissed` (workflow, §9). |

Findings are sorted by severity, then rule set, then WE.

---

## 9. Corrections & workflow (light, client-side)

Because the engine is browser-only, the heavyweight kanban/DB workflow of
`../prototype-quality/` is reduced to a **field-level correction** plus a small
status set carried in the run (and persisted in the URL hash / `localStorage`,
the pattern used across these apps). No server, no auth.

**Correction** = writing the `correction` facet of a SourceField. Doing so:
- sets the canonical value (priority in §4),
- flips the relevant dimension's field to `resolved` (raising confidence),
- moves the related finding's `status` from `open` → `corrected`.

**Finding status lifecycle:**

```
open ──corrected──▶ corrected        (user supplied a value)
 │
 ├──accepted──▶ accepted             (divergence is real & acknowledged, no fix here)
 └──dismissed─▶ dismissed            (false positive / legitimate exception, e.g. Baurecht)
```

This is deliberately minimal: enough to triage a run and export the decisions,
without reintroducing a backend.

---

## 10. Output data model

| Output | Contents |
|---|---|
| **`findings.csv`** | One row per finding (§8). The triage entry point. |
| **`buildings_enriched.csv`** | One row per building: all input fields + resolved official fields + per-field status + `distance_m` + confidence + `lookup_status`. |
| **`parcels_enriched.csv`** | One row per parcel: input + cadastre fields + `distance_to_cluster_m` + cross-municipality flag + confidence. |
| **`we_summary.csv`** | One row per economic unit: counts of buildings/parcels, findings by severity, mean confidence. |
| **GeoJSON** | Located buildings + parcels as WGS84 points/polygons with raw + English property names, for GIS. *(Map is optional; this is the data export.)* |
| **`report.html`** | Self-contained interactive report (embedded JSON): findings by severity & rule set, the sortable/filterable/searchable findings + records tables, confidence tiers, default exclusions, DE/FR/IT/EN. A map is an optional secondary tab, not the centrepiece. |
| **`run.json`** | Machine-readable snapshot of the whole CheckRun (records + findings + confidence + corrections) for round-tripping or downstream tooling. |

**Security note (carried from `../oereb-check/`):** when embedding the dataset
as a JS literal in `report.html`, escape `<`, `>`, `&`, U+2028, U+2029 to
`\uXXXX` so a record value can't break out of the `<script>` tag, and route all
table cells through HTML-escaping.

---

## 11. Glossary of key official (GWR) code fields

| Code | Field | Examples |
|---|---|---|
| **GKAT** | Building category | 1021 single-family, 1025 multi-family, 1060 non-residential |
| **GSTAT** | Building status | 1004 existing, 1003 under construction, 1007 demolished |
| **GKLAS** | Building class | 1110–1277 detailed use classes |
| **GBAUP** | Construction period | 8011 (pre-1919) … 8023 (post-2015) |
| **GKSCE** | Coordinate source | 901 official survey, 903 building permit, … |
| **EGID** | Building identifier | federal building key (→ GWR) |
| **E-GRID** | Parcel identifier | `CH` + 12 alphanumerics (→ ÖREB cadastre) |

Codes are resolved to DE/FR/IT/EN labels at render time; the raw code is always
retained in the data.

---

*Companion document: [CHECKING-RULES.md](CHECKING-RULES.md) — the rule catalogue
that operates on this model. Lineage: [`../gwr-check/`](../gwr-check/) (client-side
GWR enrichment), [`../prototype-quality/`](../prototype-quality/) (rule engine +
five-dimension confidence + Three-Value Pattern), [`../oereb-check/`](../oereb-check/)
(parcel/E-GRID rules + cross-municipality methodology).*
