# Geo-Check — Kurzanleitung / Instructions

---

## Deutsch

### Was ist Geo-Check?

Geo-Check vergleicht Ihre Gebäudedaten mit dem eidgenössischen Gebäude- und Wohnungsregister (GWR). Abweichungen werden erkannt und pro Gebäude bewertet — Karte, Tabelle und PDF-Bericht inklusive.

### Schnellstart

1. **Datei vorbereiten** — CSV (Semikolon-getrennt) oder Excel mit folgenden Spalten:

   | Spalte | Pflicht? | Beschreibung |
   |---|---|---|
   | `internal_id` | Ja | Ihre interne Gebäude-ID |
   | `egid` | Ja | Eidg. Gebäudeidentifikator |
   | `street` | Nein | Strassenname |
   | `street_number` | Nein | Hausnummer |
   | `zip` | Nein | Postleitzahl |
   | `city` | Nein | Ort |
   | `region` | Nein | Kanton (2 Buchstaben, z.B. BE) |
   | `building_type` | Nein | Gebäudekategorie (GWR-Code) |
   | `latitude` | Nein | Breitengrad (WGS 84) |
   | `longitude` | Nein | Längengrad (WGS 84) |
   | `country` | Nein | Ländercode (CH) |
   | `comment` | Nein | Freitext-Bemerkung |

2. **Hochladen** — Datei in die Dropzone ziehen oder klicken zum Durchsuchen.

3. **Ergebnisse prüfen** — Karte und Tabelle zeigen den Abgleich pro Gebäude. Farben: Grün = Übereinstimmung, Gelb = ähnlich, Rot = Abweichung.

4. **PDF-Bericht** — Klicken Sie auf ein Gebäude in der Karte und wählen Sie «PDF-Bericht», um einen detaillierten Bericht mit Empfehlungen und Kartenausschnitt herunterzuladen.

5. **Ergebnisse herunterladen** — Alle Resultate als CSV, Excel oder GeoJSON exportieren.

### Datenschutz

Ihre Daten bleiben im Browser. Es werden keine Dateien auf einen Server hochgeladen. Nur die EGID (öffentliche Gebäude-ID) wird an die GWR-API gesendet.

---

## Français

### Qu'est-ce que Geo-Check ?

Geo-Check compare vos données de bâtiments avec le Registre fédéral des bâtiments et des logements (RegBL). Les écarts sont détectés et évalués par bâtiment — carte, tableau et rapport PDF inclus.

### Démarrage rapide

1. **Préparer le fichier** — CSV (séparé par des points-virgules) ou Excel avec les colonnes suivantes :

   | Colonne | Requis ? | Description |
   |---|---|---|
   | `internal_id` | Oui | Votre identifiant interne |
   | `egid` | Oui | Identifiant fédéral du bâtiment |
   | `street` | Non | Nom de la rue |
   | `street_number` | Non | Numéro de la maison |
   | `zip` | Non | Code postal |
   | `city` | Non | Localité |
   | `region` | Non | Canton (2 lettres, p. ex. VD) |
   | `building_type` | Non | Catégorie de bâtiment (code RegBL) |
   | `latitude` | Non | Latitude (WGS 84) |
   | `longitude` | Non | Longitude (WGS 84) |
   | `country` | Non | Code pays (CH) |
   | `comment` | Non | Remarque libre |

2. **Télécharger** — Glisser le fichier dans la zone ou cliquer pour parcourir.

3. **Examiner les résultats** — La carte et le tableau montrent la comparaison par bâtiment. Couleurs : vert = correspondance, jaune = similaire, rouge = écart.

4. **Rapport PDF** — Cliquez sur un bâtiment sur la carte et choisissez « Rapport PDF » pour télécharger un rapport détaillé avec recommandations et extrait de carte.

5. **Exporter** — Tous les résultats en CSV, Excel ou GeoJSON.

### Protection des données

Vos données restent dans le navigateur. Aucun fichier n'est envoyé à un serveur. Seul l'EGID (identifiant public) est transmis à l'API RegBL.

---

## Italiano

### Cos'è Geo-Check?

Geo-Check confronta i vostri dati sugli edifici con il Registro federale degli edifici e delle abitazioni (REA). Le differenze vengono rilevate e valutate per edificio — mappa, tabella e rapporto PDF inclusi.

### Avvio rapido

1. **Preparare il file** — CSV (separato da punti e virgola) o Excel con le seguenti colonne:

   | Colonna | Obbligatorio? | Descrizione |
   |---|---|---|
   | `internal_id` | Sì | Il vostro identificatore interno |
   | `egid` | Sì | Identificatore federale dell'edificio |
   | `street` | No | Nome della via |
   | `street_number` | No | Numero civico |
   | `zip` | No | Codice postale |
   | `city` | No | Località |
   | `region` | No | Cantone (2 lettere, p. es. TI) |
   | `building_type` | No | Categoria dell'edificio (codice REA) |
   | `latitude` | No | Latitudine (WGS 84) |
   | `longitude` | No | Longitudine (WGS 84) |
   | `country` | No | Codice paese (CH) |
   | `comment` | No | Nota libera |

2. **Caricare** — Trascinare il file nella zona o cliccare per sfogliare.

3. **Verificare i risultati** — Mappa e tabella mostrano il confronto per edificio. Colori: verde = corrispondenza, giallo = simile, rosso = differenza.

4. **Rapporto PDF** — Cliccate su un edificio sulla mappa e scegliete «Rapporto PDF» per scaricare un rapporto dettagliato con raccomandazioni e estratto cartografico.

5. **Esportare** — Tutti i risultati in CSV, Excel o GeoJSON.

### Protezione dei dati

I vostri dati restano nel browser. Nessun file viene inviato a un server. Solo l'EGID (identificatore pubblico) viene trasmesso all'API REA.

---

## English

### What is Geo-Check?

Geo-Check compares your building data against the Swiss Federal Register of Buildings and Dwellings (GWR). Discrepancies are detected and scored per building — map, table, and PDF report included.

### Quick start

1. **Prepare your file** — CSV (semicolon-separated) or Excel with the following columns:

   | Column | Required? | Description |
   |---|---|---|
   | `internal_id` | Yes | Your internal building ID |
   | `egid` | Yes | Federal building identifier |
   | `street` | No | Street name |
   | `street_number` | No | House number |
   | `zip` | No | Postal code |
   | `city` | No | City / locality |
   | `region` | No | Canton (2 letters, e.g. ZH) |
   | `building_type` | No | Building category (GWR code) |
   | `latitude` | No | Latitude (WGS 84) |
   | `longitude` | No | Longitude (WGS 84) |
   | `country` | No | Country code (CH) |
   | `comment` | No | Free-text note |

2. **Upload** — Drag the file into the drop zone or click to browse.

3. **Review results** — The map and table show the comparison per building. Colours: green = match, yellow = similar, red = mismatch.

4. **PDF report** — Click a building on the map and choose "PDF report" to download a detailed report with recommendations and map excerpt.

5. **Export** — All results as CSV, Excel, or GeoJSON.

### Privacy

Your data stays in the browser. No files are uploaded to a server. Only the EGID (public building ID) is sent to the GWR API.
