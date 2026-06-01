# Regelwerk — ÖREB-Check

**Prüfregeln für die Validierung der BBL-SAP-Liegenschaftsstammdaten gegen die
nationalen Register (GWR / ÖREB-Kataster).**

Dieses Dokument beschreibt — analog zur Dokumentation *CheckGWR* der amtlichen
Vermessung — sämtliche Regeln, nach denen `oereb_check.py` die Gebäude- und
Grundstücksdaten prüft: je Regel die Kennung, den Schweregrad, das geprüfte
Objekt, die genaue Bedingung, die Datenquelle, den ausgegebenen Befundtext und
die empfohlene Massnahme.

| | |
|---|---|
| **Werkzeug** | `oereb-check/oereb_check.py` (Python, ohne Abhängigkeiten) |
| **Geprüfte Objekte** | Gebäude (EGID → GWR), Grundstücke (E-GRID → ÖREB-Kataster) |
| **Datenquellen** | swisstopo REST-API (GWR, ÖREB-Kataster) — öffentlich, ohne Schlüssel |
| **Ausgabe** | `findings.csv`, angereicherte CSV, interaktiver `report.html` |
| **Stand** | 2026-06-01 |

---

## 1. Zweck

In SAP sind die BBL-Liegenschaften hierarchisch organisiert:

| Ebene | Beispiel | Fremdschlüssel ins nationale Register |
|---|---|---|
| Buchungskreis | `1086` (BBL) | — |
| Wirtschaftseinheit (WE) | `1502` | — |
| Gebäude | `AA`, `BG` | **EGID** → GWR |
| Grundstück | `1`, `2`, `3` | **E-GRID** → ÖREB-Kataster |

Die Felder **EGID** und **E-GRID** sind von Hand gepflegte Fremdschlüssel. Sie
sind fehleranfällig (falsch, fehlend oder veraltet) und von Auge kaum prüfbar.
Der ÖREB-Check gleicht jeden Schlüssel automatisch gegen die amtlichen Register
ab und meldet Abweichungen.

---

## 2. Datenquellen

| Quelle | Verwendung | Ebene / Layer |
|---|---|---|
| **GWR** (Gebäude- und Wohnungsregister) | Gebäudekoordinate **und** der autoritative E-GRID der Parzelle, auf der das Gebäude steht | `ch.bfs.gebaeude_wohnungs_register` |
| **ÖREB-Kataster** | Parzellengeometrie / -zentrum | `ch.swisstopo-vd.stand-oerebkataster` |

Alle Koordinaten in **LV95 (EPSG:2056, Meter)** → Distanzen sind exakte planare
Berechnungen. Beide Quellen werden über die öffentliche
[swisstopo-API](https://docs.geo.admin.ch/) bezogen.

---

## 3. Schweregrade

Der ÖREB-Check kennt drei Schweregrade. Sie entsprechen den internen Stufen
`HIGH` / `MED` / `LOW` (Spalte `severity` in `findings.csv`):

| Symbol | Stufe | intern | Bedeutung |
|:---:|---|---|---|
| 🔴 | **Fehler** | `HIGH` | Sehr wahrscheinlich falscher oder fehlender Schlüssel — soll korrigiert werden. |
| 🟠 | **Warnung** | `MED` | Auffälligkeit, die geprüft werden sollte; nicht zwingend ein Fehler. |
| ⚪ | **Hinweis** | `LOW` | Informativer Hinweis / unerwartete, meist harmlose Konstellation. |

> **Schweiz-Bewusstsein:** Das Portfolio enthält rund **1 100 Auslandobjekte**
> (Botschaften / Konsulate), die rechtmässig **keinen** Schweizer EGID/E-GRID
> besitzen. Solche Objekte werden **nicht** als Fehler gemeldet (Status
> `foreign` statt `missing`).

---

## 4. Übersicht aller Prüfregeln

| ID | Regel | Schweregrad | Objekt | Kategorie (`category`) |
|---|---|:---:|---|---|
| **GS-02** | E-GRID nicht im ÖREB-Kataster gefunden | 🔴 Fehler | Grundstück | `INVALID_EGRID` |
| **GS-03** | Grundstück weit vom Gebäudecluster entfernt | 🔴 Fehler | Grundstück | `PARCEL_FAR` |
| **GS-04** | Einzelpaar-WE: E-GRID kann ergänzt werden | 🔴 Fehler | Grundstück | `SINGLE_PAIR_FILL` |
| **GS-05** | Einzelpaar-WE: E-GRID widerspricht GWR | 🔴 Fehler | Grundstück | `SINGLE_PAIR_MISMATCH` |
| **GB-02** | EGID nicht im GWR gefunden | 🔴 Fehler | Gebäude | `INVALID_EGID` |
| **GS-01** | Grundstück ohne E-GRID | 🟠 Warnung | Grundstück | `MISSING_EGRID` |
| **GB-01** | Schweizer Gebäude ohne EGID | 🟠 Warnung | Gebäude | `MISSING_EGID` |
| **QP-01** | GWR-Parzelle des Gebäudes fehlt in der WE | 🟠 Warnung | Querprüfung | `GWR_EGRID_NOT_IN_SAP` |
| **GB-03** | Nicht-CH-Gebäude trägt eine EGID | ⚪ Hinweis | Gebäude | `NONCH_WITH_EGID` |

Kennungsschema: **GS** = Grundstück, **GB** = Gebäude, **QP** = Querprüfung
(Gebäude ↔ Grundstücke einer WE).

---

## 5. Prüfregeln im Detail

### 🔴 Gebäude

#### GB-02 — EGID nicht im GWR gefunden
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🔴 Fehler (`HIGH`) |
| **Objekt** | Gebäude |
| **Beschreibung** | Der im SAP gesetzte EGID existiert nicht (mehr) im GWR — veraltet oder falsch erfasst. |
| **Bedingung** | EGID ist gültig (positive Ganzzahl), aber die GWR-Feature-Abfrage liefert keinen Treffer (Status `notfound`; im 20er-Batch per Binärsplit isoliert). |
| **Geprüftes Attribut** | EGID (Gebäude) |
| **Datenquelle** | GWR (`ch.bfs.gebaeude_wohnungs_register`) |
| **Befundtext** | `EGID not found in GWR (stale or wrong)` |
| **Empfehlung** | Korrekten EGID ermitteln. Häufige Ursache: Gebäudeabbruch, -zusammenlegung oder Neunummerierung im GWR. |

### 🔴 Grundstück

#### GS-02 — E-GRID nicht im ÖREB-Kataster gefunden
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🔴 Fehler (`HIGH`) |
| **Objekt** | Grundstück |
| **Beschreibung** | Der gesetzte E-GRID existiert nicht im ÖREB-Kataster — veraltet oder falsch. |
| **Bedingung** | E-GRID ist formal gültig («CH» + 12 alphanumerische Zeichen), aber die ÖREB-Abfrage über das Feld `egris_egrid` liefert kein Resultat (Status `notfound`). |
| **Geprüftes Attribut** | E-GRID (Grundstück) |
| **Datenquelle** | ÖREB-Kataster (`ch.swisstopo-vd.stand-oerebkataster`) |
| **Befundtext** | `E-GRID not found in OEREB cadastre (stale or wrong)` |
| **Empfehlung** | Korrekten E-GRID ermitteln. Häufige Ursache: Parzellenmutation (Teilung / Vereinigung) mit neuer E-GRID. |

#### GS-03 — Grundstück weit vom Gebäudecluster entfernt
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🔴 Fehler (`HIGH`) |
| **Objekt** | Grundstück |
| **Beschreibung** | Das Grundstück liegt deutlich weiter vom Schwerpunkt der Gebäude derselben WE entfernt, als plausibel ist → wahrscheinlich falscher E-GRID-Fremdschlüssel. |
| **Bedingung** | Distanz (Parzellenzentrum → robustes WE-Zentrum) **> Schwellenwert** (Standard **500 m**) **und** das WE-Zentrum ist vertrauenswürdig (aus Gebäuden gebildet oder aus ≥ 3 Grundstücken). Siehe [§ 7 Distanzmethodik](#7-distanzmethodik). |
| **Geprüftes Attribut** | E-GRID / Lage (Grundstück) |
| **Datenquelle** | GWR (Gebäudekoordinaten) + ÖREB (Parzellenzentrum), LV95 |
| **Befundtext** | `parcel is <d> m from the WE building cluster (> <Schwelle> m) — likely wrong E-GRID` |
| **Empfehlung** | Lage prüfen. **Achtung Fehlalarme:** legitim verstreute WE (Baurechte, Dienstbarkeiten, Berggebiete) erzeugen grosse Distanzen ohne Fehler. Das schärfere Signal ist ein **Gemeindewechsel** gegenüber den Gebäuden. |

#### GS-04 — Einzelpaar-WE: E-GRID kann ergänzt werden
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🔴 Fehler (`HIGH`) — höchste Korrektur-Konfidenz |
| **Objekt** | Grundstück |
| **Beschreibung** | WE mit genau **1 Gebäude + 1 Grundstück**; dem Grundstück fehlt der E-GRID. Er lässt sich eindeutig aus der GWR-Parzelle des Gebäudes ableiten. |
| **Bedingung** | WE hat genau 1 Gebäude und 1 Grundstück; Grundstück-E-GRID fehlt (Status `missing`); das Gebäude hat im GWR einen E-GRID → dieser wird vorgeschlagen. |
| **Geprüftes Attribut** | E-GRID (Grundstück) |
| **Datenquelle** | GWR (Gebäude → Parzelle) |
| **Befundtext** | `single building + single parcel: parcel E-GRID is missing — assign the building's GWR parcel` |
| **Vorschlag** | GWR-E-GRID des Gebäudes (Spalte `suggested_egrid`) |
| **Empfehlung** | Vorgeschlagenen E-GRID übernehmen — dies sind die zuverlässigsten Korrekturen des gesamten Prüflaufs. |

#### GS-05 — Einzelpaar-WE: E-GRID widerspricht GWR
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🔴 Fehler (`HIGH`) |
| **Objekt** | Grundstück |
| **Beschreibung** | WE mit genau **1 Gebäude + 1 Grundstück**; der vorhandene SAP-E-GRID weicht von der GWR-Parzelle des Gebäudes ab. |
| **Bedingung** | WE 1 + 1; Grundstück-E-GRID gültig; **≠** GWR-E-GRID des Gebäudes. |
| **Geprüftes Attribut** | E-GRID (Grundstück) |
| **Datenquelle** | GWR |
| **Befundtext** | `single building + single parcel: SAP E-GRID '<egrid>' != building's GWR parcel '<bg>'` |
| **Vorschlag** | GWR-E-GRID des Gebäudes (Spalte `suggested_egrid`) |
| **Empfehlung** | Prüfen. Oft **legitim** bei Baurechten / Dienstbarkeiten («BR z.L.», «DDP», «serv. à charge») — das Gebäude steht auf einer fremden Parzelle. Andernfalls E-GRID korrigieren. |

### 🟠 Grundstück

#### GS-01 — Grundstück ohne E-GRID
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🟠 Warnung (`MED`) |
| **Objekt** | Grundstück |
| **Beschreibung** | Das Grundstück besitzt im SAP keinen gültigen E-GRID-Fremdschlüssel. |
| **Bedingung** | Land = CH **und** `egrid` ist leer, `0000000000` oder formal ungültig (kein «CH» + 12 alphanumerische Zeichen) → Status `missing`. **Ausnahme:** Einzelpaar-WE werden über GS-04 abgewickelt. |
| **Geprüftes Attribut** | E-GRID (Grundstück) |
| **Datenquelle** | SAP-Export Grundstücke |
| **Befundtext** | `parcel has no / zero E-GRID in SAP` |
| **Empfehlung** | E-GRID im ÖREB-Kataster nachschlagen und im SAP ergänzen. |

### 🟠 Gebäude

#### GB-01 — Schweizer Gebäude ohne EGID
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🟠 Warnung (`MED`) |
| **Objekt** | Gebäude |
| **Beschreibung** | Ein Schweizer Gebäude hat im SAP keinen EGID. |
| **Bedingung** | Land = CH **und** `egid` ist keine positive Ganzzahl (leer / `0`) → Status `missing`. (Auslandobjekte erhalten Status `foreign` und werden nicht gemeldet.) |
| **Geprüftes Attribut** | EGID (Gebäude) |
| **Datenquelle** | SAP-Export Gebäude |
| **Befundtext** | `CH building has no EGID in SAP` |
| **Empfehlung** | EGID im GWR ermitteln und ergänzen. |

### 🟠 Querprüfung

#### QP-01 — GWR-Parzelle des Gebäudes fehlt in der WE
| Feld | Inhalt |
|---|---|
| **Schweregrad** | 🟠 Warnung (`MED`) |
| **Objekt** | Querprüfung (Gebäude ↔ SAP-Grundstücke derselben WE) |
| **Beschreibung** | Die Parzelle, auf der das Gebäude laut GWR steht, ist nicht unter den SAP-Grundstücken derselben WE → möglicherweise fehlendes Grundstück oder falscher Schlüssel. |
| **Bedingung** | GWR-E-GRID des Gebäudes vorhanden; die WE hat ≥ 1 gültigen SAP-Grundstück-E-GRID; der GWR-E-GRID ist **nicht** in dieser Menge enthalten; die WE ist **kein** Einzelpaar (1 + 1). |
| **Geprüftes Attribut** | E-GRID (Gebäude-GWR vs. WE-Grundstücke) |
| **Datenquelle** | GWR + SAP |
| **Befundtext** | `building's GWR parcel is not among this WE's SAP parcels (possible missing parcel or wrong key)` |
| **Vorschlag** | GWR-E-GRID des Gebäudes (Spalte `suggested_egrid`) |
| **Empfehlung** | Fehlendes Grundstück in der WE ergänzen oder Schlüssel korrigieren. |

### ⚪ Gebäude

#### GB-03 — Nicht-CH-Gebäude trägt eine EGID
| Feld | Inhalt |
|---|---|
| **Schweregrad** | ⚪ Hinweis (`LOW`) |
| **Objekt** | Gebäude |
| **Beschreibung** | Ein Gebäude im Ausland trägt unerwartet eine (gültige) EGID. |
| **Bedingung** | Land ≠ CH **und** `egid` ist gültig. |
| **Geprüftes Attribut** | EGID, Land |
| **Datenquelle** | SAP-Export Gebäude |
| **Befundtext** | `non-CH building (<Land>) unexpectedly carries an EGID` |
| **Empfehlung** | Land- oder EGID-Angabe prüfen (möglicher Erfassungsfehler). |

---

## 6. Geltungsbereich & Standardausschlüsse

Der interaktive Bericht (`report.html`) blendet über das **Filter-Panel**
bestimmte Objektklassen **standardmässig aus**. Die Befunde werden weiterhin
berechnet, aber nicht angezeigt; die Filter lassen sich jederzeit abschalten.

| Klasse | Erkennung | Standard |
|---|---|---|
| **Abgang** | Objektname beginnt mit `ABGA…` | ausgeblendet |
| **Löschvermerk** | Objektname beginnt mit `LÖVM…` | ausgeblendet |
| **Parkplätze** | Grundstücksname enthält `PP` (als eigenständiges Wort, `\bPP\b`) | ausgeblendet |
| **Infrastrukturgefässe** | Gebäude-ID = `GR` | ausgeblendet |

Zusätzliche **Bereichsfilter** (Mehrfachauswahl): **Land** (CH / Ausland) und
**Kanton**. Die Übersichts-Kacheln zeigen stets die Gesamtzahlen des Datensatzes;
Diagramme, Tabellen und Karte folgen dem aktiven Geltungsbereich.

---

## 7. Distanzmethodik

Regel **GS-03** (`PARCEL_FAR`) beruht auf einer robusten Distanzberechnung je WE:

1. **Robustes Zentrum** = komponentenweiser **Median** der aufgelösten
   Gebäudekoordinaten (LV95). Sind keine Gebäude auflösbar, ersatzweise der
   Median der Grundstücke — dieser gilt aber erst ab **≥ 3 Grundstücken** als
   vertrauenswürdig.
2. **Distanz** = exakte planare Distanz (LV95, Meter) zwischen Parzellenzentrum
   und WE-Zentrum.
3. **Markierung** (`far_flag`) nur, wenn das Zentrum vertrauenswürdig ist
   **und** die Distanz den Schwellenwert (`--threshold`, Standard 500 m)
   überschreitet.
4. Die **exakte Distanz** wird unabhängig von der Markierung in
   `parcels_enriched.csv` geschrieben (Spalte `dist_to_we_center_m`) — so lassen
   sich Grenzfälle selbst nachsortieren.

Die Parzellenposition ist das **Bounding-Box-Zentrum** des ÖREB-Polygons —
genau genug, um Fehler im Bereich von hunderten Metern bis Kilometern zu finden.

> **Bekannte Einschränkung:** Distanz allein über-markiert. In einem Prüflauf
> lagen ~107 von 146 weit entfernten Grundstücken in derselben (grossen) Gemeinde
> wie die Gebäude (legitime Wald-/Dienstbarkeits-/Baurechtsparzellen). Das
> schärfere Fehlersignal ist Distanz **+ abweichende Gemeinde**.

---

## 8. Felder in `findings.csv`

| Spalte | Inhalt |
|---|---|
| `severity` | `HIGH` / `MED` / `LOW` (siehe § 3) |
| `category` | Regelkategorie (z. B. `PARCEL_FAR`) |
| `we` | Wirtschaftseinheit |
| `kind` | `building` / `parcel` |
| `sap_id` | SAP-ID des Objekts |
| `name` | Objektbezeichnung |
| `key` | EGID bzw. E-GRID des Objekts |
| `detail` | Befundtext (siehe je Regel) |
| `suggested_egrid` | Korrekturvorschlag, falls vorhanden |
| `distance_m` | Distanz in Metern (nur GS-03) |
| `gemeinde`, `ort`, `land`, `kanton` | Verortung |

Die Befunde sind nach Schweregrad, Kategorie und WE sortiert. **Einstieg:**
`findings.csv` (bzw. die Filter-Diagramme im `report.html`); die angereicherten
CSV (`buildings_enriched.csv`, `parcels_enriched.csv`, `we_summary.csv`) liefern
das vollständige Bild für die Detailanalyse.

---

*Vorbild für Aufbau und Stil: amtliche Dokumentation «CheckGWR» der amtlichen
Vermessung Schweiz. Erstellt für das Bundesamt für Bauten und Logistik (BBL).*
