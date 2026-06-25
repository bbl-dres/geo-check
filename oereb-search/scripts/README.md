# oereb-search / scripts

Companion CLI tools for the [ÖREB Parcel Search](../) app.

## `oereb.py` — bulk parcel area lookup

Reads a list of EGRIDs (with cantons) from `egrids.csv`, fetches the XML ÖREB extract for each parcel directly from the canton's official web service, parses out the land-registry area, and writes the results to `grundstuecke.csv`.

Author: [@troschel](https://github.com/troschel).

### Cantonal endpoints

The script maps each Swiss canton (`AG`, `BE`, `BL`, …) to its official ÖREB web service URL — 26 cantons are wired up. The canonical source list is [cadastre.ch/de/oereb-webservice](https://www.cadastre.ch/de/oereb-webservice); update `KANTON_URLS` in the script if a canton changes endpoint.

### Usage

```bash
pip install requests
python oereb.py
```

### Input — `egrids.csv` (same folder)

```csv
EGRID,Kanton
CH123456789012,ZH
CH987654321098,BE
```

UTF-8 with optional BOM. Column names are case-sensitive (`EGRID`, `Kanton`).

### Output — `grundstuecke.csv`

```csv
EGRID,Kanton,Flaeche_m2
CH123456789012,ZH,1234.5
CH987654321098,BE,nicht gefunden
```

Per row, `Flaeche_m2` is either the numeric area from `<LandRegistryArea>` or one of `nicht gefunden` / `XML-Fehler` / `Fehler bei Abfrage`.

### Notes

- Per-request timeout: 120 s. `WITHIMAGES=false`, `GEOMETRY=false` (lean responses).
- TLS warnings are suppressed via `urllib3.disable_warnings` — some cantonal services use self-signed or chain-incomplete certs.
- The script is sequential (one HTTP request at a time). For large input lists, consider chunking by canton and running in parallel.
- Requests via the API of the Canton of Vaud times out after 20 requests. It is necessary to chunk requests into lists of 20 entries.
