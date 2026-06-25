# Checking Rules — Data-Check

**The rule catalogue for `data-check`: every rule by which the engine validates
building and parcel master data against the official Swiss registers (GWR,
official address directory, ÖREB cadastre).**

Modelled on the official *CheckGWR* documentation style: for each rule its id,
severity, checked object, exact condition, data source, message, and recommended
action. The data these rules operate on is defined in
[DATA-MODEL.md](DATA-MODEL.md).

This catalogue consolidates and de-duplicates the checks of three predecessors:
the weighted address/coordinate comparison of [`../gwr-check/`](../gwr-check/),
the registered rule engine of [`../prototype-quality/`](../prototype-quality/)
(`ID-`/`ADR-`/`GEO-`), and the parcel/E-GRID catalogue of
[`../oereb-check/RULE-SET.md`](../oereb-check/RULE-SET.md) (`GS-`/`GB-`/`QP-`).

| | |
|---|---|
| **Engine** | Browser-side, no backend. Rules are pure functions over the reconciled record model. |
| **Objects** | Buildings (EGID → GWR), Parcels (E-GRID → ÖREB), and cross-checks within an economic unit. |
| **Reference** | swisstopo / BFS public APIs (no key) — see [DATA-MODEL.md §2](DATA-MODEL.md). |
| **Output** | `findings.csv`, enriched CSVs, interactive `report.html` — see [DATA-MODEL.md §10](DATA-MODEL.md). |

---

## 1. Severity levels

Three levels, matching the internal `HIGH`/`MED`/`LOW` of `../oereb-check/`:

| Symbol | Level | internal | Meaning |
|:---:|---|---|---|
| 🔴 | **Error** | `HIGH` | Very likely a wrong or missing value — should be corrected. |
| 🟠 | **Warning** | `MED` | An anomaly worth checking; not necessarily an error. |
| ⚪ | **Hint** | `LOW` | Informational / unexpected-but-usually-harmless constellation. |

---

## 2. Rule schema (engine contract)

Every rule is a self-contained definition the engine registers and evaluates;
this is the consolidation of `../prototype-quality/`'s `registerRule(...)` plus
the structured fields of `../oereb-check/`'s catalogue.

```jsonc
{
  "id":       "ADR-007",            // unique, <set>-<nnn>
  "severity": "warning",           // error | warning | info
  "rule_set": "address",           // identification | address | location |
                                   //   classification | measurements | crosscheck
  "object":   "building",          // building | parcel | crosscheck
  "field":    "house_number",      // affected field (null for object-level)
  "scope":    "record",            // record | group(WE) | dataset
  "check":    "(record, ctx) => message | null"   // null = pass; string = finding detail
}
```

- **`scope: record`** — evaluated per object against its own official lookup.
- **`scope: group`** — evaluated per economic unit (e.g. parcel-far, building↔parcel
  cross-checks); `ctx` provides the WE's buildings + parcels.
- **`scope: dataset`** — evaluated once over the whole run (e.g. duplicate keys).

A rule returns `null` (pass) or a message string (→ a [Finding](DATA-MODEL.md#8-finding-model)).
Rules never mutate records; corrections are a separate, user-driven step.

Every rule×object also records an **evaluation state** — `passed` / `finding` /
`skipped-no-data` / `error` — so that the *absence* of a finding is never
silently read as a pass (a check that couldn't run, e.g. no geometry or a foreign
object, is `skipped-no-data`, auditable in the report, not invisible).

**Dependent-finding suppression.** When a *root* key finding fires
(`lookup_status ∈ {skipped, not_found, error}`), downstream rules that can only
fail *because* of that gap (e.g. GEO-001 coordinates-missing) are **suppressed**,
so one root cause yields one finding, not a cascade.

**Comparison helper.** Most field rules are a normalised compare of a single
SourceField — shared as one helper (the consolidation of gwr-check's per-field
status and prototype-quality's `compareSourceField`):

```
compare(field) →
  both empty            → pass (null)
  internal & not official → "missing in register"
  official & not internal → "missing in your data"
  normalised mismatch     → "your '<internal>'  vs  official '<official>'"
  else                    → pass
```

---

## 3. Catalogue overview

37 distinct rules across 6 rule sets. The id prefix marks the set;
ids are stable so findings can be tracked across runs.

| Set | Prefix | Object | Rules |
|---|---|---|---|
| Identification | `ID-` | building / parcel / dataset | ID-001 … ID-010 |
| Address | `ADR-` | building | ADR-001 … ADR-009 |
| Location | `GEO-` | building / parcel / group | GEO-001 … GEO-005 |
| Classification | `CLS-` | building | CLS-001 … CLS-006 |
| Measurements | `MES-` | building / parcel | MES-001 … MES-004 |
| Cross-check (WE) | `QP-` | crosscheck | QP-001 … QP-003 |

| ID | Rule | Sev. | Object | Maps from |
|---|---|---|---|---|
| **ID-001** | EGID missing (CH building) | Warning | building | gwr `skipped`, pq ID-001, oereb GB-01 |
| **ID-002** | EGID malformed | Error | building | pq ID-002 |
| **ID-003** | EGID not found in GWR | Error | building | gwr `not_found`, pq ID-001, oereb GB-02 |
| **ID-004** | EGID resolves to an implausible building | Error | building | redefined (was a dead echo-check) |
| **ID-005** | E-GRID missing (CH parcel) | Warning | parcel | oereb GS-01 |
| **ID-006** | E-GRID not found in ÖREB cadastre | Error | parcel | oereb GS-02 |
| **ID-007** | Duplicate EGID / E-GRID across records | Error | dataset | pq ID-005 |
| **ID-008** | Foreign object carries a Swiss key | Hint | building/parcel | oereb GB-03 |
| **ID-009** | Building missing E-GRID (fillable from GWR) | Warning | building | new (building↔parcel) |
| **ID-010** | Building E-GRID disagrees with GWR parcel | Warning | building | new (building↔parcel) |
| **ADR-001** | Country code mismatch | Error | building | pq ADR-001 |
| **ADR-002** | Region mismatch | Warning | building | gwr region, pq ADR |
| **ADR-003** | Municipality mismatch | Warning | building | pq ADR |
| **ADR-004** | BFS municipality-number mismatch | Warning | building | pq ADR |
| **ADR-005** | ZIP mismatch | Warning | building | gwr zip, pq ADR |
| **ADR-006** | Locality mismatch | Warning | building | gwr city, pq ADR |
| **ADR-007** | Street mismatch | Warning | building | gwr street, pq ADR-007 |
| **ADR-008** | House-number mismatch | Warning | building | gwr street_number, pq ADR-007 |
| **ADR-009** | Address present in register but absent in your data | Hint | building | pq ADR |
| **GEO-001** | Coordinates missing | Error | building | pq GEO-001 |
| **GEO-002** | Internal vs register coordinate deviation | Warning | building | gwr coord match, pq GEO-002 |
| **GEO-003** | Address ↔ coordinate deviation | Hint | building | pq GEO-003 |
| **GEO-004** | Parcel far from its building cluster | Error | group | oereb GS-03 |
| **GEO-005** | Parcel coordinate / centroid missing | Warning | parcel | oereb (parcel locate) |
| **CLS-001** | Building demolished | Error | building | gwr report |
| **CLS-002** | Building not yet completed | Warning | building | gwr report |
| **CLS-003** | Building category mismatch | Warning | building | gwr building_type, pq |
| **CLS-004** | Building class mismatch | Hint | building | pq |
| **CLS-005** | Construction period / year mismatch | Hint | building | pq |
| **CLS-006** | Building not usable / not realised (GSTAT 1005/1008) | Warning | building | gwr |
| **MES-001** | Floors mismatch | Hint | building | pq |
| **MES-002** | Dwellings mismatch | Hint | building | pq |
| **MES-003** | Footprint area mismatch (> tolerance) | Hint | building | pq |
| **MES-004** | Parcel area mismatch (> tolerance) | Hint | parcel | pq |
| **QP-001** | Building's GWR parcel not among the WE's parcels | Warning | crosscheck | oereb QP-01 |
| **QP-002** | Single-pair WE: parcel E-GRID can be filled | Error | crosscheck | oereb GS-04 |
| **QP-003** | Single-pair WE: parcel E-GRID contradicts GWR | Warning | crosscheck | oereb GS-05 |
| — | *Overall low confidence / ≥3 field mismatches* | (derived) | building | gwr report — see §11 |

---

## 4. Scope, exclusions & Switzerland-awareness

**Foreign objects.** The federal portfolio includes ~1 100 foreign properties
(embassies, consulates) that legitimately have **no** Swiss EGID/E-GRID. An
object with `country ≠ CH` and no key gets `lookup_status = foreign` and is
**not** flagged as missing (ID-001/ID-005 do not fire). The only foreign-related
rule is the *hint* ID-008 (a foreign object that unexpectedly *does* carry a
key — possible data-entry error).

**Default exclusions** (computed but hidden by default in the report, toggleable —
carried from `../oereb-check/`):

| Class | Detection | Default |
|---|---|---|
| Abgang (disposal) | object name starts `ABGA…` | hidden |
| Löschvermerk (deletion note) | object name starts `LÖVM…` | hidden |
| Parkplätze (parking) | parcel name contains `PP` as a word (`\bPP\b`) | hidden |
| Infrastrukturgefässe | building id = `GR` | hidden |
| **Baurecht / servitude** | `tenure = baurecht` or `name` ~ `/BR\s*z|DDP|servitude|Dienstbarkeit/i` | suppression context |
| **Stockwerkeigentum / Miteigentum** | `tenure = stwe` or `name` ~ `/STWE|Stockwerk|Miteigentum/i` | suppression context |

**Legitimate-exception flags ≠ exclusions.** The first four classes are *hidden
by default* (toggleable display filters). The Baurecht/STWE flags are different —
they are **suppression context**: they don't hide the object, they **downgrade or
suppress** the specific rules those constellations legitimately trip:
- **Baurecht/servitude** → ID-010 / QP-003 drop to *hint* (the building lawfully
  sits on a third party's parcel) and GEO-004 is softened.
- **STWE/Miteigentum** → ID-007 does **not** error when records share a key
  (legitimately one physical building/parcel under co-ownership; see ID-007).
- **non-owned** (`tenure ∈ {rented, mandate}`) → ID-001 softens to a hint (we may
  not maintain the EGID for objects we don't own).

Scope filters (region, country CH/foreign) and these exclusions drive the
report's tables, charts and summary counts alike.

---

## 5. Identification rules (`ID-`)

### 🟠 ID-001 — EGID missing (CH building)
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / `egid` |
| **Condition** | `country = CH` **and** `egid` is not a positive integer (empty / `0`). Foreign objects get `foreign` and are skipped. |
| **Source** | input |
| **Message** | `CH building has no EGID` |
| **Action** | Look up the EGID in GWR and add it. |

### 🔴 ID-002 — EGID malformed
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | building / `egid` |
| **Condition** | `egid` present but fails `^[1-9][0-9]{0,8}$` (leading zero, non-numeric, too long). |
| **Source** | input |
| **Message** | `EGID has invalid format: <egid>` |
| **Action** | Correct the key; re-derive from the register if needed. |

### 🔴 ID-003 — EGID not found in GWR
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | building / `egid` |
| **Condition** | `egid` valid but the GWR lookup returns no feature — fires only on a **definitive** `not_found` (404 after retries); a transient `error` lookup does **not** fire it (DATA-MODEL §6). |
| **Source** | GWR (`ch.bfs.gebaeude_wohnungs_register`) |
| **Message** | `EGID not found in GWR (stale or wrong)` |
| **Action** | Determine the correct EGID. Common cause: demolition, merge, or renumbering in GWR. |

### 🔴 ID-004 — EGID resolves to an implausible building
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | building / `egid` |
| **Condition** | `egid` resolves in GWR (`matched`), but the GWR building is implausibly *not* the one your record describes — **locality mismatch _and_ `location` distance > 500 m**. (A plain EGID-equality check is impossible: the lookup is keyed *by* the EGID, so GWR always echoes the queried value — hence this address/location-plausibility test instead.) |
| **Source** | GWR (address + coordinates) |
| **Message** | `EGID <egid> resolves to a building in <official_locality>, ~<d> m from your record — likely the wrong EGID` |
| **Action** | Verify the EGID actually identifies *this* building; a far, different-locality match usually means a wrong key. Complements (does not duplicate) the per-field ADR-/GEO- warnings and the §11 ≥3-mismatch headline. |

### 🟠 ID-005 — E-GRID missing (CH parcel)
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | parcel / `egrid` |
| **Condition** | `country = CH` **and** `egrid` empty / `0000000000` / not `CH`+12 alphanum (`missing`). **Exception:** single-pair WE handled by QP-002. |
| **Source** | input |
| **Message** | `parcel has no / zero E-GRID` |
| **Action** | Look up the E-GRID in the ÖREB cadastre and add it. |

### 🔴 ID-006 — E-GRID not found in ÖREB cadastre
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | parcel / `egrid` |
| **Condition** | `egrid` formally valid but the cadastre `find` on `egris_egrid` returns nothing — a **definitive** `not_found` only; a transient `error` lookup does **not** fire it (DATA-MODEL §6). |
| **Source** | ÖREB cadastre |
| **Message** | `E-GRID not found in ÖREB cadastre (stale or wrong)` |
| **Action** | Determine the correct E-GRID. Common cause: parcel mutation (split/merge) yielding a new E-GRID. |

### 🔴 ID-007 — Duplicate EGID / E-GRID across records
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | dataset / `egid` or `egrid` |
| **Scope** | dataset |
| **Condition** | The same valid `egid` (or `egrid`) appears on more than one record. **Exception:** **not** an error when the sharing records are flagged STWE/Miteigentum (or are otherwise the same physical building/parcel) — uniqueness holds at the *physical-object* level, not the SAP-Bewirtschaftungsobjekt level; those are demoted to a **hint**. |
| **Source** | input |
| **Message** | `EGID <key> is used by N records: <ids>` |
| **Action** | A building/parcel key should be unique at the physical-object level; investigate the duplicates (or confirm a legitimate STWE/co-ownership constellation). |

### ⚪ ID-008 — Foreign object carries a Swiss key
| | |
|---|---|
| **Severity** | ⚪ Hint |
| **Object / field** | building or parcel / `egid`/`egrid`, `country` |
| **Condition** | `country ≠ CH` **and** a valid Swiss key is present. |
| **Source** | input |
| **Message** | `non-CH object (<country>) unexpectedly carries a Swiss key` |
| **Action** | Check the country or key (possible data-entry error). |

### 🟠 ID-009 — Building missing E-GRID
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / `egrid` |
| **Condition** | `country = CH` **and** the building's `egrid` is empty / `0000000000` / not `CH`+12 alphanum, **and** GWR returns the building's parcel E-GRID → fillable, **and** the WE is **not** a single pair (1+1). |
| **Source** | GWR (building → parcel) |
| **Message** | `building has no E-GRID — GWR parcel is '<official>'` |
| **Suggested** | the building's GWR parcel E-GRID |
| **Action** | Adopt the GWR parcel E-GRID. **Single-pair WEs are handled by QP-002 instead** (the `not a single pair` guard prevents ID-009 and QP-002 both firing on the same fact). |

### 🟠 ID-010 — Building E-GRID disagrees with GWR parcel
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / `egrid` |
| **Condition** | The building's `egrid` is valid but **≠** the building's GWR parcel E-GRID. |
| **Source** | GWR |
| **Message** | `building E-GRID '<internal>' ≠ GWR parcel '<official>'` |
| **Suggested** | the building's GWR parcel E-GRID |
| **Action** | Check. Often **legitimate** under Baurecht / servitude (the building sits on a third party's parcel); otherwise correct the E-GRID. |

---

## 6. Address rules (`ADR-`)

All ADR rules are a `compare(field)` (§2) of one building address field, your
value vs the official GWR / address-directory value. `mismatch` ⇒ the listed
severity; `missing in your data` (official has it, you don't) ⇒ ADR-009 as a
hint. Empty-both ⇒ pass.

| ID | Field | GWR alias | Severity |
|---|---|---|:---:|
| **ADR-001** | `country` | — | 🔴 Error |
| **ADR-002** | `region` | `gdekt` | 🟠 Warning |
| **ADR-003** | `municipality` | `ggdename` | 🟠 Warning |
| **ADR-004** | `bfs_nr` | `ggdenr` | 🟠 Warning |
| **ADR-005** | `zip` | `dplz4` | 🟠 Warning |
| **ADR-006** | `locality` | `dplzname` | 🟠 Warning |
| **ADR-007** | `street` | `strname` | 🟠 Warning |
| **ADR-008** | `house_number` | `deinr` | 🟠 Warning |

> Street and locality use **string-similarity** comparison: identical ⇒ `exact`;
> similarity ≥ 0.7 (e.g. `Beaulieustr.` vs `Beaulieustrasse`) ⇒ `similar` (no
> finding); below ⇒ `mismatch`. ZIP, house-number, BFS, country, region are
> compared as exact tokens. Country mismatch is an **error** because it usually
> signals a wrong record altogether.

### ⚪ ADR-009 — Address present in register but absent in your data
| | |
|---|---|
| **Severity** | ⚪ Hint |
| **Object / field** | building / any address field |
| **Condition** | `official` has a value for an address field your record leaves empty. |
| **Source** | GWR / address directory |
| **Message** | `<field>: empty in your data (register: '<official>')` |
| **Action** | Backfill from the official directory if appropriate. |

---

## 7. Location rules (`GEO-`)

### 🔴 GEO-001 — Coordinates missing
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | building / coordinates (`wgs84_lat`/`wgs84_lon`, `lv95_e`/`lv95_n`) |
| **Condition** | Neither your record nor the register yields usable coordinates (or they parse as NaN). **Suppressed** when `lookup_status ∈ {skipped, not_found, error}` — the key finding (ID-002/003) already explains the absent register coordinates; firing GEO-001 too would just double-count (dependent-finding suppression, §2). |
| **Source** | input + GWR |
| **Message** | `coordinates missing in all sources` |
| **Action** | Add coordinates or fix the EGID so GWR can supply them. |

### 🟠 GEO-002 — Internal vs register coordinate deviation
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / coordinates (`wgs84_lat`/`wgs84_lon`, `lv95_e`/`lv95_n`) |
| **Condition** | Both your and the GWR coordinates present; planar (LV95) distance **> 50 m**. The distance is always stored in `distance_m`, independent of the flag. |
| **Source** | input + GWR |
| **Message** | `your coordinates deviate <d> m from GWR` |
| **Action** | Check which position is correct; the GWR coordinate is usually authoritative. |

> **Scoring tie-in.** For confidence/match the coordinate field is graded by
> distance, not equality: `< 50 m` ⇒ `exact`; `50–500 m` ⇒ `similar`
> (interpolated); `> 500 m` ⇒ `mismatch` (carried from `../gwr-check/`).

### ⚪ GEO-003 — Address ↔ coordinate deviation
| | |
|---|---|
| **Severity** | ⚪ Hint |
| **Object / field** | building / coordinates (`wgs84_lat`/`wgs84_lon`, `lv95_e`/`lv95_n`) |
| **Condition** | Geocoding the record's own address (street + number + ZIP + locality) via the GeoAdmin SearchServer yields a point **> 100 m** from the record's coordinates. |
| **Source** | GeoAdmin geocoder |
| **Message** | `address and coordinates deviate <d> m` |
| **Action** | One of address or coordinate is likely wrong for this record. |

### 🔴 GEO-004 — Parcel far from its building cluster
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | crosscheck (WE) / parcel `egrid` / location |
| **Scope** | group (economic unit) |
| **Condition** | Shortest planar distance from the nearest WE building to the parcel's **polygon edge > threshold** (default **500 m**) — a building *on* the parcel counts as 0 m — **and** the parcel lies in a **different municipality** than the WE buildings (cross-municipality gate). See §10. |
| **Source** | GWR (building coords) + ÖREB (parcel geometry), LV95 |
| **Message** | `parcel is <d> m from the WE building cluster (> <threshold> m) — likely wrong E-GRID` |
| **Suggested** | — |
| **Action** | Check the location. **Beware false positives:** legitimately scattered WEs (Baurechte, servitudes, mountain regions) produce large distances without error; the sharper signal is the **municipality change**. |

### 🟠 GEO-005 — Parcel could not be located
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | parcel / centroid |
| **Condition** | E-GRID resolves in the cadastre but no usable centroid/geometry is returned (cannot run GEO-004). |
| **Source** | ÖREB cadastre |
| **Message** | `parcel geometry unavailable — location checks skipped` |
| **Action** | Retry the lookup; verify the E-GRID. |

---

## 8. Classification rules (`CLS-`)

### 🔴 CLS-001 — Building demolished
| | |
|---|---|
| **Severity** | 🔴 Error |
| **Object / field** | building / `building_status` |
| **Condition** | GWR `gstat = 1007` (demolished). |
| **Source** | GWR |
| **Message** | `building is recorded as demolished in GWR` |
| **Action** | The record likely refers to a building that no longer exists — verify and retire/re-key. |

### 🟠 CLS-002 — Building not yet completed
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / `building_status` |
| **Condition** | GWR `gstat ∈ {1001 planned, 1002 approved, 1003 under construction}`. |
| **Source** | GWR |
| **Message** | `building is not yet existing in GWR (status <code>)` |
| **Action** | Confirm the building is actually in service in your portfolio. |

### 🟠 CLS-003 — Building category mismatch
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / `building_category` |
| **Condition** | `compare(building_category)` mismatch (GKAT code differs). |
| **Source** | GWR |
| **Message** | `building category: your '<internal>' vs GWR '<official>'` |
| **Action** | Align the category; GWR is authoritative for the building's classification. |

### ⚪ CLS-004 — Building class mismatch
| | |
|---|---|
| **Severity** | ⚪ Hint |
| **Object / field** | building / `building_class` (`gklas`) |
| **Condition** | `compare(building_class)` mismatch. |
| **Source** | GWR |
| **Message** | `building class differs from GWR` |
| **Action** | Informational; reconcile if the use-class matters downstream. |

### ⚪ CLS-005 — Construction period / year mismatch
| | |
|---|---|
| **Severity** | ⚪ Hint |
| **Object / field** | building / `construction_period`, `construction_year` |
| **Condition** | `compare` mismatch on `gbaup`/`gbauj`. |
| **Source** | GWR |
| **Message** | `construction period/year differs from GWR` |
| **Action** | Informational. |

### 🟠 CLS-006 — Building not usable / not realised
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object / field** | building / `building_status` |
| **Condition** | GWR `gstat ∈ {1005 nicht nutzbar (not usable), 1008 nicht realisiert (not realised)}`. |
| **Source** | GWR |
| **Message** | `building is recorded in GWR as not usable / not realised (status <code>)` |
| **Action** | `1008` means the project was never built — verify the record should exist at all; `1005` means it exists but is not usable. Decisive enough to check, like CLS-001/002. |

---

## 9. Measurement rules (`MES-`)

Numeric comparisons with a tolerance (exact match not required for areas).

| ID | Field | GWR/ÖREB alias | Severity | Condition |
|---|---|---|:---:|---|
| **MES-001** | `floors_total` | `gastw` | ⚪ Hint | integer mismatch (GWR tracks only the total) |
| **MES-002** | `dwellings` | `ganzwhg` | ⚪ Hint | integer mismatch |
| **MES-003** | `area_footprint_m2` | `garea` | ⚪ Hint | relative difference > 10 % |
| **MES-004** | `area_parcel_m2` | `flaeche` | ⚪ Hint | relative difference > 10 % |

> Measurements carry the lowest weight in confidence and are hints by default:
> register measurements are themselves often estimates, so a small delta is not
> a data error. Surface them, don't alarm on them.
>
> `floors_above`/`floors_below`, the `area_floor_*` areas, and the `volume_*`
> measurements have **no GWR counterpart** (GWR records only total storeys via
> `gastw` and footprint area via `garea`); they are carried as data and reserved
> for a future check against storey-/volume-estimation models — no rule fires on
> them today.

---

## 10. Cross-check rules (`QP-`) and the distance methodology

Cross-checks exploit the **economic-unit (WE)** grouping that links buildings to
parcels — the payoff of treating land/parcel data as an additional input.

### 🟠 QP-001 — Building's GWR parcel not among the WE's parcels
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object** | crosscheck (building ↔ the WE's SAP parcels) |
| **Condition** | The building's GWR parcel E-GRID is present; the WE has ≥ 1 valid parcel E-GRID; the GWR E-GRID is **not** among them; and the WE is **not** a single pair (1+1). |
| **Source** | GWR + input |
| **Message** | `building's GWR parcel is not among this WE's parcels (possible missing parcel or wrong key)` |
| **Suggested** | the building's GWR parcel E-GRID |
| **Action** | Add the missing parcel to the WE, or correct a key. |

### 🔴 QP-002 — Single-pair WE: parcel E-GRID can be filled
| | |
|---|---|
| **Severity** | 🔴 Error (highest correction confidence) |
| **Object** | crosscheck |
| **Condition** | WE has exactly **1 building + 1 parcel**; the parcel's E-GRID is missing; the building has a GWR parcel E-GRID → propose it. |
| **Source** | GWR |
| **Message** | `single building + single parcel: parcel E-GRID is missing — assign the building's GWR parcel` |
| **Suggested** | building's GWR parcel E-GRID |
| **Action** | Adopt the proposed E-GRID — these are the most reliable corrections of the whole run. |

### 🟠 QP-003 — Single-pair WE: parcel E-GRID contradicts GWR
| | |
|---|---|
| **Severity** | 🟠 Warning |
| **Object** | crosscheck |
| **Condition** | WE 1 + 1; parcel E-GRID valid but **≠** the building's GWR parcel E-GRID. |
| **Source** | GWR |
| **Message** | `single building + single parcel: your E-GRID '<egrid>' ≠ building's GWR parcel '<bg>'` |
| **Suggested** | building's GWR parcel E-GRID |
| **Action** | Check. Often **legitimate** under Baurecht/servitude (the building sits on a third party's parcel — "BR z.L.", "DDP", "serv. à charge"); otherwise correct the E-GRID. |
| **Note** | **Warning, not Error** — its own action says the disagreement is *often legitimate*, so it can't be "very likely wrong" (§1). This now matches **ID-010**, the same fact seen from the building's `egrid`; the two share severity, and when both fire on one 1+1 WE they are the same issue (dedup by `internal_id`-pair, don't count twice). |

### 10.1 Distance methodology (GEO-004)

How "far from its cluster" is measured — against the parcel **polygon**, not a
single centroid (carried verbatim from `../oereb-check/RULE-SET.md §7`, the
hard-won anti-false-positive logic):

1. **Is a building on the parcel?** If any resolved WE building coordinate lies
   **inside** the parcel polygon, distance = **0 m** → not far (the E-GRID is
   obviously right), regardless of parcel shape/size.
2. **Otherwise:** distance = shortest planar (LV95) distance from the **nearest
   WE building** to the parcel's polygon edge.
3. **Parcel-only WE** (no resolved buildings): fall back to the **pole of
   inaccessibility** (polylabel — the visual centre, *not* the bounding-box
   centre) → median of the parcels; trustworthy only at **≥ 3 parcels**.
4. **Cross-municipality gate:** raise the **Error** only if the parcel is in a
   *different municipality* than the WE buildings. A wrong E-GRID almost always
   lands in another municipality; legitimately scattered forest/Baurecht parcels
   stay in the same one. If either municipality is **unknown**, the gate can't
   confirm the signal → emit at most a **Warning** on distance alone, **never an
   Error** (this is exactly the sparse-data case the gate exists to protect, so
   it must not silently degrade to pure distance).
5. **Flag** only when the reference is trustworthy **and** distance > threshold;
   **Error** when the cross-municipality gate holds, **Warning** when the gate is
   unevaluable (unknown municipality).
6. The distance is recorded in `parcels_enriched.csv` regardless of the flag, so
   borderline cases can be re-sorted by hand.

> **Why the gate exists:** distance alone over-flags. In one run, ~107 of 146
> far parcels sat in the *same* (large) municipality as the buildings (legitimate
> forest / servitude / Baurecht parcels). The cross-municipality gate cut 146
> flags to ~39 genuine suspects — the sharpest single signal of a wrong E-GRID.
> See the `egrid-far-flag-insight` memory.

---

## 11. Determining an object's overall status

Beyond individual findings, the report derives a per-record headline, combining
the rule outcomes with confidence (the consolidation of `../gwr-check/`'s
recommendation roll-up):

| Headline | Condition |
|---|---|
| **🔴 Error** | any open `error`-level finding, **or** ≥ 3 **field mismatches** (defined below), **or** confidence `total` < 50. |
| **🟠 Warning** | no errors but ≥ 1 `warning` finding, or confidence 50–79. |
| **⚪ Hint** | only `hint`-level findings, confidence ≥ 80. |
| **✅ OK** | no findings and confidence ≥ 80. |

A **field mismatch** here is one field whose comparison status is **`mismatch`**
(not `similar`, not `empty`), counted **once per field** and only for
Warning-level-or-above fields, **de-duplicated** against findings already raised
— so per-field `similar` results, `ADR-009` backfill hints, and the roll-up
rules (ID-004, this headline itself) never inflate the count. The threshold `3`
is a configurable constant (see the thresholds table referenced by `run_meta`).

Because an open `error` finding **also caps confidence below the OK tier**
([DATA-MODEL §7](DATA-MODEL.md#7-confidence-model)), the headline and the
confidence tier can never disagree on a record carrying an error.

A record is **"clean enough to sign off"** as one computable predicate: its
**headline is OK or Hint**, **no open `error`/`warning` findings remain
unresolved** (each `corrected`/`accepted`), its sign-off-critical fields
(EGID/E-GRID, address, `location`) are present, and the decisions persist against
the finding fingerprint ([DATA-MODEL §9](DATA-MODEL.md#9-corrections--workflow-light-client-side)).

---

*Companion document: [DATA-MODEL.md](DATA-MODEL.md). Style after the official
**CheckGWR** documentation of the Swiss official survey. Lineage:
[`../gwr-check/`](../gwr-check/), [`../prototype-quality/`](../prototype-quality/),
[`../oereb-check/RULE-SET.md`](../oereb-check/RULE-SET.md). Prepared for the
Bundesamt für Bauten und Logistik (BBL).*
