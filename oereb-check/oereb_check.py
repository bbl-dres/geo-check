#!/usr/bin/env python3
"""
oereb_check.py
==============
Validate BBL (Bundesamt fuer Bauten und Logistik) SAP building & parcel master
data against the Swiss national registers via the public swisstopo API
(https://docs.geo.admin.ch / api3.geo.admin.ch):

  * Buildings (Gebaeude) -> GWR  (ch.bfs.gebaeude_wohnungs_register), keyed by EGID
  * Parcels   (Grundstuecke) -> OEREB cadastre (ch.swisstopo-vd.stand-oerebkataster),
    keyed by E-GRID

What it does
------------
1. Parses the two SAP "Dynamische Listenausgabe" reports (pipe-delimited, UTF-8).
2. For every building EGID, fetches from GWR:
      - the building coordinate (LV95 / EPSG:2056, metres)
      - the AUTHORITATIVE E-GRID of the parcel the building stands on
3. For every parcel E-GRID, fetches the parcel centroid (LV95) from the OEREB layer.
4. Per Wirtschaftseinheit (WE) it then:
      - computes a robust centre from the building coordinates and flags parcels
        that sit "way off" (> threshold) -> likely a wrong E-GRID foreign key
      - cross-checks each building's GWR-E-GRID against the WE's SAP parcels
      - for single-building + single-parcel WEs, derives the parcel's correct
        E-GRID from the building's GWR-E-GRID (fill if missing, flag if mismatched)
      - reports missing/invalid EGIDs and E-GRIDs (Switzerland-aware: foreign
        properties legitimately have no Swiss key and are not flagged as errors)

Outputs (written to OUTPUT_DIR, UTF-8 + BOM, ';'-separated for Swiss Excel):
    buildings_enriched.csv   every building + GWR enrichment + flags
    parcels_enriched.csv     every parcel   + OEREB enrichment + distance + flags
    we_summary.csv           one row per Wirtschaftseinheit
    findings.csv             the actionable issue list (sorted by severity)
    api_cache.json           HTTP response cache (re-runs are instant / resumable)

Zero third-party dependencies: Python 3.9+ standard library only.

Usage
-----
    python oereb_check.py                         # full run, defaults below
    python oereb_check.py --we 1498,1502          # only these Wirtschaftseinheiten
    python oereb_check.py --offline               # analyse from cache, no network
    python oereb_check.py --threshold 1000        # flag parcels > 1 km from cluster
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import math
import os
import re
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from statistics import median
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# ───────────────────────────── configuration ─────────────────────────────

DATA_DIR           = os.path.dirname(os.path.abspath(__file__))  # this script's folder
# The two SAP .txt exports live next to this script and are auto-discovered by
# name (any *.txt containing "geb" / "grundst"), so dated exports like 26062_…
# work next month too. Override with --data-dir / --gebaeude / --grundstuecke.
# Outputs (report.html + CSVs + cache) are written to DATA_DIR unless --out is given.

COMPANY_CODE       = "1086"   # Buchungskreis BBL (informational)
DISTANCE_THRESHOLD = 500      # metres: parcel farther than this from its WE's
                              # building cluster is flagged as "way off"
MAX_WORKERS        = 16       # concurrent API requests (I/O-bound; --workers to tune)
GWR_BATCH_SIZE     = 20       # EGIDs per batched GWR feature request (endpoint max;
                              # 25+ IDs returns HTTP 400)
REQUEST_TIMEOUT    = 30       # seconds per HTTP request
USER_AGENT         = "BBL-OEREB-Check/1.0 (+https://github.com/bbl-dres/geo-check)"

# swisstopo endpoints (https://docs.geo.admin.ch/access-data/find-features.html)
GWR_FEATURE = "https://api3.geo.admin.ch/rest/services/api/MapServer/ch.bfs.gebaeude_wohnungs_register"
FIND_URL    = "https://api3.geo.admin.ch/rest/services/ech/MapServer/find"
OEREB_LAYER = "ch.swisstopo-vd.stand-oerebkataster"

# ───────────────────────────── SAP report parsing ────────────────────────


def _norm(s: str) -> str:
    """Normalise a column header for alias matching (umlauts -> ascii, drop punct)."""
    s = s.strip().lower()
    s = s.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]", "", s)


# normalised-header -> canonical field name
BUILDING_COLS = {
    "bukr": "bukr", "we": "we", "gebaude": "id", "bezgebaude": "name",
    "lr": "land", "rg": "kanton", "ort": "ort", "plz": "plz",
    "strasse": "strasse", "hausnr": "hausnr", "egid": "egid",
}
PARCEL_COLS = {
    "bukr": "bukr", "we": "we", "grundstk": "id", "bezgrundstuck": "name",
    "lr": "land", "rg": "kanton", "ort": "ort", "plz": "plz",
    "strasse": "strasse", "hausnr": "hausnr", "egrid": "egrid",
    "koordinaten": "sap_koord",
}


def find_report(data_dir: str, keywords: list[str], label: str) -> str:
    """Locate a SAP .txt export inside data_dir by filename keyword (newest wins)."""
    if not os.path.isdir(data_dir):
        raise SystemExit(
            f"Data directory not available: {data_dir}\n"
            f"  Is the drive connected? Pass --data-dir or --{label} <file>.")
    cands = [p for p in glob.glob(os.path.join(data_dir, "*.txt"))
             if any(k in os.path.basename(p).lower() for k in keywords)]
    if not cands:
        raise SystemExit(f"No {label} report (a *.txt whose name contains "
                         f"{'/'.join(keywords)}) found in {data_dir}")
    return max(cands, key=os.path.getmtime)


def parse_sap_report(path: str, colmap: dict) -> list[dict]:
    """
    Parse a SAP "Dynamische Listenausgabe" pipe-delimited report.

    The report has a few header/metadata lines, then a column-header row
    (the one containing "BuKr"), then data rows. Each printable row looks like
    ``|1086|1502|AA   |...|``. Separator lines are made only of '|' and '-';
    page headers repeat the column row on later pages. We map columns to the
    canonical names in ``colmap`` by normalised header, ignoring the rest.
    """
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    headers: list[str] | None = None
    rows: list[dict] = []
    for ln in lines:
        if not ln.startswith("|"):
            continue
        if set(ln) <= {"|", "-"}:          # separator line
            continue
        parts = [p.strip() for p in ln.split("|")]   # parts[0]/[-1] are '' (outer pipes)
        if headers is None:
            if "BuKr" in parts:
                headers = parts
            continue
        if len(parts) < 2 or not parts[1].isdigit():  # not a data row (e.g. repeated header)
            continue
        raw = dict(zip(headers, parts))
        rec = {canon: "" for canon in set(colmap.values())}
        for header, value in raw.items():
            canon = colmap.get(_norm(header))
            if canon:
                rec[canon] = value
        rows.append(rec)

    if headers is None:
        raise SystemExit(f"No 'BuKr' header row found in {path} — is it the right file?")
    if not rows:
        raise SystemExit(
            f"Parsed 0 data rows from {path} (header found but no '|1086|…' rows). "
            f"The report layout may have changed — check the file.")
    return rows


# ───────────────────────────── key validation ────────────────────────────


def valid_egid(s: str) -> bool:
    """A GWR EGID is a positive integer."""
    s = (s or "").strip()
    return s.isdigit() and s != "0"


def valid_egrid(s: str) -> bool:
    """A real E-GRID is 'CH' + 12 alphanumerics. '0000000000' / '' are placeholders."""
    s = (s or "").strip().upper()
    payload = s[2:]
    return (s.startswith("CH") and len(s) == 14
            and payload.isalnum() and payload != "0" * 12)


def gwr_egrid(b: dict) -> str:
    """The authoritative (upper-cased) E-GRID a building's GWR record points at, or ''."""
    g = b.get("gwr")
    return g["egrid"].upper() if (g and g.get("egrid")) else ""


# ───────────────────────── coordinate helpers (LV95) ─────────────────────


def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Planar distance in metres between two LV95 (E, N) points."""
    return math.hypot(a[0] - b[0], a[1] - b[1])


def marginal_median(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    """Component-wise median centre — robust to a minority of outlier points."""
    if not points:
        return None
    return (median(p[0] for p in points), median(p[1] for p in points))


def lv95_to_wgs84(e: float, n: float) -> tuple[float, float]:
    """
    swisstopo's approximate LV95 (EPSG:2056) -> WGS84 formula (accurate to ~cm).
    Returns (lat, lon) in decimal degrees. (Same formula as the oereb-search app.)
    """
    y = (e - 2_600_000) / 1_000_000
    x = (n - 1_200_000) / 1_000_000
    lon = (2.6779094 + 4.728982 * y + 0.791484 * y * x
           + 0.1306 * y * x * x - 0.0436 * y ** 3)
    lat = (16.9023892 + 3.238272 * x - 0.270978 * y * y
           - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3)
    return lat * 100 / 36, lon * 100 / 36


def maps_url(e: float, n: float) -> str:
    lat, lon = lv95_to_wgs84(e, n)
    return f"https://www.google.com/maps?q={lat:.6f},{lon:.6f}"


# ───────────────────────────── swisstopo client ──────────────────────────


class _NotFound(Exception):
    """Definitive 404 — the key does not exist (do not retry)."""


class GeoAdmin:
    """Cached, retrying client for the two swisstopo layers."""

    def __init__(self, cache_path: str, offline: bool = False):
        self.cache_path = cache_path
        self.offline = offline
        self.cache: dict[str, dict] = {}
        self._lock = threading.Lock()   # guards self.cache across worker threads
        if os.path.exists(cache_path):
            try:
                with open(cache_path, encoding="utf-8") as f:
                    self.cache = json.load(f)
            except (OSError, json.JSONDecodeError):
                self.cache = {}

    def _store(self, key: str, res: dict) -> dict:
        with self._lock:
            self.cache[key] = res
        return res

    # -- persistence --------------------------------------------------------
    def save(self) -> None:
        # snapshot under the lock so workers can't mutate the dict mid-iteration;
        # never persist transient errors, so a later run retries them
        with self._lock:
            keep = {k: v for k, v in self.cache.items() if v.get("status") != "error"}
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        tmp = self.cache_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(keep, f, ensure_ascii=False)
        os.replace(tmp, self.cache_path)

    # -- low-level HTTP with retry/backoff ---------------------------------
    def _get_json(self, url: str, retries: int = 3) -> dict:
        delay = 0.5
        for attempt in range(retries + 1):
            try:
                req = Request(url, headers={"User-Agent": USER_AGENT})
                with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                    return json.load(resp)
            except HTTPError as e:
                if e.code == 404:
                    raise _NotFound from None
                if (e.code == 429 or e.code >= 500) and attempt < retries:
                    ra = e.headers.get("Retry-After")
                    wait = min(int(ra), 10) if (ra and ra.isdigit()) else delay
                    time.sleep(wait)
                    delay *= 2
                    continue
                raise
            except (URLError, TimeoutError, ConnectionError, json.JSONDecodeError):
                if attempt < retries:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        raise RuntimeError("unreachable")

    # -- shared cache / offline / error envelope ---------------------------
    def _resolve(self, key: str, fetch) -> dict:
        """Cached lookup. On a miss: offline → 'unchecked' (not persisted);
        else run fetch() (returns a result dict), mapping 404→notfound and any
        other exception→error, then cache it."""
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        if self.offline:
            return {"status": "unchecked"}
        try:
            res = fetch()
        except _NotFound:
            res = {"status": "notfound"}
        except Exception:
            res = {"status": "error"}
        return self._store(key, res)

    # -- building (GWR) -----------------------------------------------------
    def building(self, egid: str) -> dict:
        def fetch():
            data = self._get_json(f"{GWR_FEATURE}/{egid}_0?returnGeometry=true&sr=2056")
            return _building_result(data.get("feature") or data)
        return self._resolve(f"b:{egid}", fetch)

    def batch_buildings(self, egids: list[str]) -> None:
        """Resolve a group of EGIDs in ONE GWR feature request (comma-joined IDs),
        like the gwr-check JS app. The multi-feature endpoint 404s if ANY single ID
        is missing, so on a 404 we binary-split and recurse — isolating the few
        stale EGIDs in ~O(log n) extra requests rather than O(n) individual calls."""
        if self.offline:
            return
        self._fetch_building_group([e for e in egids if f"b:{e}" not in self.cache])

    def _fetch_building_group(self, group: list[str]) -> None:
        if not group:
            return
        if len(group) == 1:
            self.building(group[0])      # single ID → 200 (found) or 404 (notfound)
            return
        ids = ",".join(f"{e}_0" for e in group)
        try:
            data = self._get_json(f"{GWR_FEATURE}/{ids}?returnGeometry=true&sr=2056")
        except _NotFound:                # ≥1 ID missing → split and recurse
            mid = len(group) // 2
            self._fetch_building_group(group[:mid])
            self._fetch_building_group(group[mid:])
            return
        except Exception:                # transient failure → individual fallback
            for e in group:
                self.building(e)
            return
        feats = data.get("features")
        if feats is None:                # single-feature shape: {"feature": {...}}
            feats = [data["feature"]] if data.get("feature") else []
        for f in feats:
            eg = str((f.get("attributes") or {}).get("egid") or "")
            if eg:
                self._store(f"b:{eg}", _building_result(f))

    # -- parcel (OEREB) -----------------------------------------------------
    def parcel(self, egrid: str) -> dict:
        def fetch():
            params = urlencode({
                "layer": OEREB_LAYER, "searchText": egrid, "searchField": "egris_egrid",
                "contains": "false", "returnGeometry": "true",
                "geometryFormat": "geojson", "sr": "2056",
            })
            return _parcel_result(self._get_json(f"{FIND_URL}?{params}"), egrid)
        return self._resolve(f"p:{egrid}", fetch)


def _building_result(feat: dict) -> dict:
    """Build a result dict from one GWR feature (single or from a batch)."""
    geom = (feat or {}).get("geometry") or {}
    attr = (feat or {}).get("attributes") or {}
    if geom.get("x") is None or geom.get("y") is None:   # missing OR null coords
        return {"status": "notfound"}
    strname = attr.get("strname")
    if isinstance(strname, list):
        strname = strname[0] if strname else ""
    return {
        "status": "found", "e": geom["x"], "n": geom["y"],
        "egrid": str(attr.get("egrid") or ""),
        "gemeinde": attr.get("ggdename") or "", "kanton": attr.get("gdekt") or "",
        "gstat": str(attr.get("gstat") or ""), "strname": strname or "",
        "deinr": str(attr.get("deinr") or ""), "plz": str(attr.get("dplz4") or ""),
    }


def _parcel_result(data: dict, egrid: str) -> dict:
    """Build a result dict from an OEREB find response for one E-GRID."""
    results = data.get("results") or []
    if not results:
        return {"status": "notfound"}
    want = egrid.strip().upper()
    def attrs(r):
        return r.get("attributes") or r.get("properties") or {}
    match = next(
        (r for r in results if str(attrs(r).get("egris_egrid", "")).upper() == want),
        results[0],
    )
    e, n = _centroid(match)
    if e is None:
        return {"status": "notfound"}
    a = attrs(match)
    return {
        "status": "found", "e": e, "n": n,
        "gemeinde": a.get("gemeindename") or a.get("ort") or "",
        "kanton": a.get("kanton") or "",
        "oereb_status": a.get("oereb_status_de") or "", "label": a.get("label") or "",
    }


def _centroid(result: dict) -> tuple[float | None, float | None]:
    """Representative point of a find result: bbox centre, else vertex mean."""
    bb = result.get("bbox")
    if bb and len(bb) == 4:
        return (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    geom = result.get("geometry") or {}
    pts: list[list[float]] = []

    def walk(c):
        if isinstance(c, (list, tuple)):
            if c and isinstance(c[0], (int, float)):
                pts.append(c)
            else:
                for x in c:
                    walk(x)

    walk(geom.get("coordinates"))
    if not pts:
        return None, None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


# ───────────────────────────── fetch driver ──────────────────────────────


def fetch_all(client: GeoAdmin, egids: set[str], egrids: set[str], workers: int) -> None:
    """Fetch every uncached unique key concurrently. Buildings are looked up in
    batches of GWR_BATCH_SIZE (one request per batch, binary-split on misses);
    parcels one request each. Cache is flushed periodically so runs are resumable."""
    egid_list = sorted(e for e in egids if f"b:{e}" not in client.cache)
    egrid_list = sorted(g for g in egrids if f"p:{g}" not in client.cache)
    batches = [egid_list[i:i + GWR_BATCH_SIZE]
               for i in range(0, len(egid_list), GWR_BATCH_SIZE)]
    tasks = [("b", b) for b in batches] + [("p", g) for g in egrid_list]
    total = len(tasks)
    if total == 0:
        print("  all keys already cached — nothing to fetch")
        return
    print(f"  fetching {len(egid_list)} EGIDs in {len(batches)} batches "
          f"+ {len(egrid_list)} E-GRIDs = {total} tasks ...")

    done = 0
    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {
                ex.submit(client.batch_buildings if kind == "b" else client.parcel, payload): kind
                for kind, payload in tasks
            }
            for fut in as_completed(futs):
                fut.result()  # client methods store into cache and never raise
                done += 1
                if done % 25 == 0 or done == total:
                    print(f"    {done}/{total} tasks", end="\r", flush=True)
                if done % 200 == 0:
                    client.save()
    except KeyboardInterrupt:
        print("\n  interrupted — saving cache so far ...")
        client.save()
        raise
    print()
    client.save()


# ───────────────────────────── analysis ──────────────────────────────────

SEV_RANK = {"HIGH": 0, "MED": 1, "LOW": 2}


def analyse(buildings: list[dict], parcels: list[dict], client: GeoAdmin,
            threshold: float) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Enrich records, run all checks, return (buildings, parcels, we_rows, findings)."""

    # 1) attach API enrichment + per-record key status.
    #    status: found / notfound / error (from API) · missing (no key, CH) ·
    #            foreign (no key, non-CH — legitimate) · unchecked (offline, uncached)
    for b in buildings:
        b["egid_valid"] = valid_egid(b["egid"])
        if not b["egid_valid"]:
            b["egid_status"] = "missing" if b["land"] == "CH" else "foreign"
            b["gwr"] = None
        else:
            api = client.building(b["egid"])
            b["egid_status"] = api["status"]
            b["gwr"] = api if api["status"] == "found" else None

    for p in parcels:
        p["egrid_valid"] = valid_egrid(p["egrid"])
        if not p["egrid_valid"]:
            p["egrid_status"] = "missing" if p["land"] == "CH" else "foreign"
            p["oereb"] = None
        else:
            api = client.parcel(p["egrid"])
            p["egrid_status"] = api["status"]
            p["oereb"] = api if api["status"] == "found" else None

    # 2) group by Wirtschaftseinheit
    b_by_we: dict[str, list] = defaultdict(list)
    p_by_we: dict[str, list] = defaultdict(list)
    for b in buildings:
        b_by_we[b["we"]].append(b)
    for p in parcels:
        p_by_we[p["we"]].append(p)
    all_we = sorted(set(b_by_we) | set(p_by_we))

    findings: list[dict] = []
    we_rows: list[dict] = []

    def add(sev, cat, we, kind, rec, detail, suggested="", distance=""):
        enr = rec.get("gwr") or rec.get("oereb") or {}
        findings.append({
            "severity": sev, "category": cat, "we": we, "kind": kind,
            "sap_id": rec.get("id", ""), "name": rec.get("name", ""),
            "key": rec.get("egid") or rec.get("egrid", ""),
            "detail": detail, "suggested_egrid": suggested,
            "distance_m": distance,
            "gemeinde": enr.get("gemeinde", ""),
            "ort": rec.get("ort", ""),
            "land": rec.get("land", ""), "kanton": rec.get("kanton", ""),
        })

    for we in all_we:
        bs = b_by_we.get(we, [])
        ps = p_by_we.get(we, [])

        bpts = [(b["gwr"]["e"], b["gwr"]["n"]) for b in bs if b["gwr"]]
        ppts = [(p["oereb"]["e"], p["oereb"]["n"]) for p in ps if p["oereb"]]

        if bpts:
            centre, src = marginal_median(bpts), "buildings"
        elif ppts:
            centre, src = marginal_median(ppts), "parcels"
        else:
            centre, src = None, "none"
        # a parcel-cluster centre is only trustworthy with >=3 parcels
        reliable = bool(centre) and (src == "buildings" or len(ppts) >= 3)

        gwr_egrids = {e for e in (gwr_egrid(b) for b in bs) if e}
        sap_egrids = {p["egrid"].upper() for p in ps if p["egrid_valid"]}

        is_single_pair = len(bs) == 1 and len(ps) == 1
        single_status = ""
        single_suggest = ""

        # ---- per building checks ----
        for b in bs:
            bg = gwr_egrid(b)
            b["gwr_egrid_in_sap_we"] = (bg in sap_egrids) if bg else ""
            if b["egid_status"] == "missing":
                add("MED", "MISSING_EGID", we, "building", b,
                    "CH building has no EGID in SAP")
            elif b["egid_status"] == "notfound":
                add("HIGH", "INVALID_EGID", we, "building", b,
                    "EGID not found in GWR (stale or wrong)")
            # non-CH building carrying a (valid) EGID — independent of the above
            if b["egid_valid"] and b["land"] != "CH":
                add("LOW", "NONCH_WITH_EGID", we, "building", b,
                    f"non-CH building ({b['land']}) unexpectedly carries an EGID")
            # building sits on a parcel that is not in this WE's SAP parcels
            if bg and sap_egrids and bg not in sap_egrids and not is_single_pair:
                add("MED", "GWR_EGRID_NOT_IN_SAP", we, "building", b,
                    "building's GWR parcel is not among this WE's SAP parcels "
                    "(possible missing parcel or wrong key)", suggested=bg)

        # ---- per parcel checks ----
        for p in ps:
            p["egrid_matches_building"] = (
                p["egrid"].upper() in gwr_egrids if p["egrid_valid"] else ""
            )
            p["we_center_source"] = src
            p["we_center_e"] = round(centre[0], 1) if centre else ""
            p["we_center_n"] = round(centre[1], 1) if centre else ""
            p["dist_to_we_center_m"] = ""
            p["far_flag"] = ""

            if p["oereb"] and centre:
                d = dist_m((p["oereb"]["e"], p["oereb"]["n"]), centre)
                p["dist_to_we_center_m"] = round(d)
                far = reliable and d > threshold
                p["far_flag"] = far
                if far:
                    add("HIGH", "PARCEL_FAR", we, "parcel", p,
                        f"parcel is {round(d)} m from the WE building cluster "
                        f"(> {threshold:g} m) — likely wrong E-GRID",
                        distance=round(d))

            # missing / invalid E-GRID (handled specially for single pairs below)
            if p["egrid_status"] == "missing" and not is_single_pair:
                add("MED", "MISSING_EGRID", we, "parcel", p,
                    "parcel has no / zero E-GRID in SAP")
            elif p["egrid_status"] == "notfound":
                add("HIGH", "INVALID_EGRID", we, "parcel", p,
                    "E-GRID not found in OEREB cadastre (stale or wrong)")

        # ---- single building + single parcel special case ----
        if is_single_pair:
            b, p = bs[0], ps[0]
            bg = gwr_egrid(b)
            if p["egrid_valid"]:
                if bg and p["egrid"].upper() == bg:
                    single_status = "confirmed"
                elif bg:
                    single_status = "mismatch"
                    single_suggest = bg
                    add("HIGH", "SINGLE_PAIR_MISMATCH", we, "parcel", p,
                        f"single building + single parcel: SAP E-GRID '{p['egrid']}' "
                        f"!= building's GWR parcel '{bg}'", suggested=bg)
            elif p["egrid_status"] == "missing":          # CH parcel with no E-GRID
                if bg:
                    single_status = "fill"
                    single_suggest = bg
                    add("HIGH", "SINGLE_PAIR_FILL", we, "parcel", p,
                        "single building + single parcel: parcel E-GRID is missing — "
                        "assign the building's GWR parcel", suggested=bg)
                else:                                      # no GWR E-GRID to fill from
                    add("MED", "MISSING_EGRID", we, "parcel", p,
                        "parcel has no / zero E-GRID in SAP")

        # ---- WE summary row ----
        missing_parcels = sorted(gwr_egrids - sap_egrids)
        parcel_dists = [p["dist_to_we_center_m"] for p in ps
                        if isinstance(p.get("dist_to_we_center_m"), (int, float))]
        we_rows.append({
            "we": we,
            "n_buildings": len(bs),
            "n_buildings_ch": sum(1 for b in bs if b["land"] == "CH"),
            "n_buildings_with_egid": sum(1 for b in bs if b["egid_valid"]),
            "n_buildings_resolved": len(bpts),
            "n_parcels": len(ps),
            "n_parcels_with_egrid": sum(1 for p in ps if p["egrid_valid"]),
            "n_parcels_resolved": len(ppts),
            "n_parcels_far": sum(1 for p in ps if p.get("far_flag") is True),
            "max_parcel_dist_m": max(parcel_dists, default=""),
            "center_source": src,
            "n_gwr_egrids": len(gwr_egrids),
            "n_missing_parcels": len(missing_parcels),
            "missing_parcel_egrids": ",".join(missing_parcels),
            "is_single_pair": is_single_pair,
            "single_pair_status": single_status,
            "single_pair_suggested_egrid": single_suggest,
        })

    findings.sort(key=lambda r: (SEV_RANK.get(r["severity"], 9), r["category"], r["we"]))
    return buildings, parcels, we_rows, findings


# ───────────────────────────── CSV output ────────────────────────────────


def write_csv(path: str, rows: list[dict], fields: list[str]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def flatten_building(b: dict) -> dict:
    g = b.get("gwr") or {}
    out = {k: b.get(k, "") for k in
           ("bukr", "we", "id", "name", "land", "kanton", "ort", "plz",
            "strasse", "hausnr", "egid", "egid_status", "gwr_egrid_in_sap_we")}
    out.update({
        "gwr_egrid": g.get("egrid", ""),
        "gwr_gemeinde": g.get("gemeinde", ""),
        "gwr_kanton": g.get("kanton", ""),
        "gwr_gstat": g.get("gstat", ""),
        "gwr_e": round(g["e"], 1) if g else "",
        "gwr_n": round(g["n"], 1) if g else "",
        "maps_url": maps_url(g["e"], g["n"]) if g else "",
    })
    return out


def flatten_parcel(p: dict) -> dict:
    o = p.get("oereb") or {}
    out = {k: p.get(k, "") for k in
           ("bukr", "we", "id", "name", "land", "kanton", "ort", "plz",
            "egrid", "egrid_status", "egrid_matches_building",
            "we_center_source", "we_center_e", "we_center_n",
            "dist_to_we_center_m", "far_flag")}
    out.update({
        "oereb_gemeinde": o.get("gemeinde", ""),
        "oereb_kanton": o.get("kanton", ""),
        "oereb_status": o.get("oereb_status", ""),
        "parcel_e": round(o["e"], 1) if o else "",
        "parcel_n": round(o["n"], 1) if o else "",
        "sap_koord": p.get("sap_koord", ""),
        "maps_url": maps_url(o["e"], o["n"]) if o else "",
    })
    return out


# ───────────────────────────── HTML report ───────────────────────────────

CATEGORY_LABELS = {
    "PARCEL_FAR":           "Parcel far from building cluster",
    "SINGLE_PAIR_FILL":     "Single-pair: E-GRID can be auto-filled",
    "SINGLE_PAIR_MISMATCH": "Single-pair: E-GRID disagrees with GWR",
    "INVALID_EGRID":        "E-GRID not found in ÖREB",
    "INVALID_EGID":         "EGID not found in GWR",
    "GWR_EGRID_NOT_IN_SAP": "Building's GWR parcel missing from WE",
    "MISSING_EGRID":        "Parcel has no / zero E-GRID",
    "MISSING_EGID":         "CH building has no EGID",
    "NONCH_WITH_EGID":      "Non-CH building carries an EGID",
}


def write_html_report(path: str, buildings, parcels, we_rows, findings,
                      threshold: float, sources: dict) -> None:
    """Write a self-contained, interactive single-file HTML report."""
    stats = {
        "buildings": len(buildings),
        "buildings_ch": sum(1 for b in buildings if b["land"] == "CH"),
        "buildings_egid": sum(1 for b in buildings if b["egid_valid"]),
        "buildings_resolved": sum(1 for b in buildings if b["gwr"]),
        "parcels": len(parcels),
        "parcels_egrid": sum(1 for p in parcels if p["egrid_valid"]),
        "parcels_resolved": sum(1 for p in parcels if p["oereb"]),
        "we": len(we_rows),
        "findings": len(findings),
        "confirmed": sum(1 for w in we_rows if w["single_pair_status"] == "confirmed"),
    }
    cc = Counter(f["category"] for f in findings)
    categories = [{"key": k, "label": CATEGORY_LABELS[k], "count": cc[k],
                   "severity": next(f["severity"] for f in findings if f["category"] == k)}
                  for k in CATEGORY_LABELS if cc.get(k)]

    # geo points for the map: parcels flagged "far" + their WE building centre
    geo = []
    for p in parcels:
        if p.get("far_flag") is True and p.get("oereb") and p.get("we_center_e") != "":
            plat, plon = lv95_to_wgs84(p["oereb"]["e"], p["oereb"]["n"])
            clat, clon = lv95_to_wgs84(p["we_center_e"], p["we_center_n"])
            geo.append({"we": p["we"], "id": p["id"], "name": p["name"],
                        "gemeinde": p["oereb"].get("gemeinde", ""),
                        "dist": p["dist_to_we_center_m"],
                        "plat": round(plat, 6), "plon": round(plon, 6),
                        "clat": round(clat, 6), "clon": round(clon, 6)})

    # slim rows for the Buildings / Parcels table tabs (only displayed columns).
    # lat/lon (WGS84) drive the map points + row-click-to-zoom.
    def _ll(api):
        if not api:
            return "", ""
        lat, lon = lv95_to_wgs84(api["e"], api["n"])
        return round(lat, 6), round(lon, 6)

    b_rows = []
    for b in buildings:
        lat, lon = _ll(b["gwr"])
        b_rows.append({
            "we": b["we"], "id": b["id"], "name": b["name"], "kanton": b["kanton"], "land": b["land"],
            "egid": b["egid"], "status": b["egid_status"],
            "gwr_egrid": (b["gwr"] or {}).get("egrid", ""),
            "in_we": b.get("gwr_egrid_in_sap_we", ""),
            "gemeinde": (b["gwr"] or {}).get("gemeinde", ""),
            "lat": lat, "lon": lon,
            "maps": maps_url(b["gwr"]["e"], b["gwr"]["n"]) if b["gwr"] else "",
        })
    p_rows = []
    for p in parcels:
        lat, lon = _ll(p["oereb"])
        p_rows.append({
            "we": p["we"], "id": p["id"], "name": p["name"], "kanton": p["kanton"], "land": p["land"],
            "egrid": p["egrid"], "status": p["egrid_status"],
            "matches": p.get("egrid_matches_building", ""),
            "dist": p.get("dist_to_we_center_m", ""),
            "far": p.get("far_flag", ""),
            "gemeinde": (p["oereb"] or {}).get("gemeinde", ""),
            "lat": lat, "lon": lon,
            "maps": maps_url(p["oereb"]["e"], p["oereb"]["n"]) if p["oereb"] else "",
        })

    data = {
        "stats": stats, "categories": categories, "findings": findings, "geo": geo,
        "buildings": b_rows, "parcels": p_rows, "labels": CATEGORY_LABELS,
        "meta": {"generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
                 "threshold": threshold,
                 "gebaeude": os.path.basename(sources.get("gebaeude", "")),
                 "grundstuecke": os.path.basename(sources.get("grundstuecke", ""))},
    }
    # Embedded as a JS object literal. json.dumps does NOT escape <, >, & — so a
    # SAP value containing "</script>" would terminate the <script> early. Escape
    # those (and the JS line separators U+2028/U+2029) to \uXXXX: identical inside
    # a JS/JSON string, but inert to the HTML parser.
    data_js = (json.dumps(data, ensure_ascii=False)
               .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
               .replace(chr(0x2028), "\\u2028").replace(chr(0x2029), "\\u2029"))
    html = (_HTML_TEMPLATE
            .replace("<!--NAMESVG-->", _SWISS_NAME_SVG)
            .replace("/*__DATA__*/", data_js))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


# Official Swiss Confederation wordmark (assets/swiss-logo-name.svg), inlined so the
# report stays self-contained; injected into the header via the <!--NAMESVG--> token.
_SWISS_NAME_SVG = r'''<svg class="logo__name" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 244 70" role="img" aria-label="Schweizerische Eidgenossenschaft, Confédération suisse, Confederazione Svizzera, Confederaziun svizra"><path d="m15.3 12c.56.35 1.21.56 2.09.56 1.17 0 2.14-.6 2.14-1.95 0-1.87-4.36-2.1-4.36-4.59 0-1.52 1.33-2.48 3.01-2.48.46 0 1.21.07 1.87.32l-.15.86c-.41-.24-1.08-.35-1.72-.35-.98 0-2.06.41-2.06 1.64 0 1.91 4.36 1.92 4.36 4.69 0 1.92-1.65 2.68-3.11 2.68-.93 0-1.65-.19-2.16-.41z"></path><path d="m27.85 7.19c-.46-.2-1.03-.35-1.49-.35-1.68 0-2.62 1.22-2.62 2.9 0 1.58.96 2.9 2.52 2.9.55 0 1.04-.12 1.57-.32l.09.8c-.58.2-1.13.25-1.78.25-2.23 0-3.32-1.71-3.32-3.63 0-2.14 1.38-3.63 3.43-3.63.83 0 1.43.19 1.68.27z"></path><path d="m30.43 3h.86v4.44h.03c.36-.77 1.14-1.33 2.17-1.33 1.87 0 2.37 1.24 2.37 2.95v4.15h-.86v-4.14c0-1.2-.23-2.23-1.65-2.23-1.52 0-2.06 1.45-2.06 2.65v3.72h-.86z"></path><path d="m46.21 13.22h-1.03l-1.9-6.01h-.03l-1.9 6.01h-1.03l-2.23-6.95h.94l1.82 6.01h.03l1.94-6.01h1.03l1.84 6.01h.03l1.92-6.01h.86z"></path><path d="m54.96 9.25c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.44h-4.75c0 1.48.79 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m58.59 6.27h.86v6.95h-.86zm.87-1.86h-.86v-1.14h.86z"></path><path d="m62.04 12.49 4.18-5.49h-4.01v-.73h5.01v.73l-4.18 5.47h4.18v.74h-5.17v-.72z"></path><path d="m74.02 9.25c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.44h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m77.66 7.82c0-.77 0-1.04-.06-1.55h.86v1.33h.03c.32-.78.9-1.49 1.78-1.49.2 0 .45.04.6.09v.9c-.17-.07-.4-.1-.62-.1-1.36 0-1.73 1.52-1.73 2.78v3.43h-.86z"></path><path d="m83.26 6.27h.86v6.95h-.86zm.86-1.86h-.86v-1.14h.86z"></path><path d="m86.81 12.2c.52.26 1.14.44 1.81.44.81 0 1.54-.45 1.54-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.12-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m98.22 7.19c-.46-.2-1.03-.35-1.49-.35-1.68 0-2.62 1.22-2.62 2.9 0 1.58.96 2.9 2.52 2.9.55 0 1.04-.12 1.57-.32l.09.8c-.58.2-1.13.25-1.78.25-2.23 0-3.32-1.71-3.32-3.63 0-2.14 1.38-3.63 3.43-3.63.83 0 1.43.19 1.68.27z"></path><path d="m100.81 3h.86v4.44h.03c.36-.77 1.14-1.33 2.17-1.33 1.87 0 2.37 1.24 2.37 2.95v4.15h-.86v-4.14c0-1.2-.23-2.23-1.65-2.23-1.52 0-2.06 1.45-2.06 2.65v3.72h-.86z"></path><path d="m113.68 9.25c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.44h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m121.85 3.7h4.66v.81h-3.72v3.39h3.53v.81h-3.53v3.66h3.88v.81h-4.82z"></path><path d="m129.62 6.27h.86v6.95h-.86zm.86-1.86h-.86v-1.14h.86z"></path><path d="m136.3 12.64c1.52 0 2.06-1.64 2.06-2.9s-.53-2.9-2.06-2.9c-1.64 0-2.06 1.55-2.06 2.9s.42 2.9 2.06 2.9zm2.91.58h-.86v-1.11h-.03c-.46.88-1.17 1.26-2.17 1.26-1.91 0-2.86-1.58-2.86-3.63 0-2.11.81-3.63 2.86-3.63 1.36 0 2.04 1 2.17 1.33h.03v-4.44h.86z"></path><path d="m144.88 12.48c1.55 0 2.11-1.48 2.11-2.74 0-1.68-.49-2.9-2.06-2.9-1.63 0-2.06 1.55-2.06 2.9 0 1.36.55 2.74 2.01 2.74zm2.97.16c0 1.94-.87 3.52-3.26 3.52-.91 0-1.74-.26-2.1-.36l.07-.86c.53.27 1.29.49 2.04.49 2.2 0 2.4-1.61 2.4-3.56h-.03c-.46 1.01-1.23 1.36-2.11 1.36-2.22 0-2.93-1.94-2.93-3.47 0-2.11.81-3.63 2.86-3.63.93 0 1.52.12 2.17.96h.03v-.8h.86z"></path><path d="m155.21 9.25c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.43 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.76 1.58 2.76 3.45v.44h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m158.85 7.9c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.85v-4.22c0-1.3-.46-2.16-1.65-2.16-1.56 0-2.06 1.38-2.06 2.53v3.84h-.86z"></path><path d="m170.2 12.64c1.49 0 2.3-1.29 2.3-2.9s-.8-2.9-2.3-2.9c-1.49 0-2.3 1.29-2.3 2.9-.01 1.61.79 2.9 2.3 2.9zm0-6.53c2.24 0 3.24 1.74 3.24 3.63s-1 3.63-3.24 3.63-3.24-1.74-3.24-3.63.99-3.63 3.24-3.63"></path><path d="m175.58 12.2c.52.26 1.15.44 1.81.44.81 0 1.54-.45 1.54-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.11-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.08.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m181.95 12.2c.52.26 1.15.44 1.81.44.81 0 1.54-.45 1.54-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.12-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.53-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m193.07 9.25c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.37.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.44h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m196.71 7.9c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.85v-4.22c0-1.3-.46-2.16-1.65-2.16-1.56 0-2.06 1.38-2.06 2.53v3.84h-.86z"></path><path d="m204.81 12.2c.52.26 1.14.44 1.81.44.81 0 1.53-.45 1.53-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.11-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m216.22 7.19c-.46-.2-1.03-.35-1.49-.35-1.68 0-2.62 1.22-2.62 2.9 0 1.58.95 2.9 2.52 2.9.55 0 1.04-.12 1.57-.32l.08.8c-.58.2-1.13.25-1.78.25-2.23 0-3.32-1.71-3.32-3.63 0-2.14 1.38-3.63 3.43-3.63.83 0 1.43.19 1.68.27z"></path><path d="m218.81 3h.85v4.44h.03c.36-.77 1.15-1.33 2.17-1.33 1.87 0 2.37 1.24 2.37 2.95v4.15h-.85v-4.14c0-1.2-.23-2.23-1.65-2.23-1.52 0-2.06 1.45-2.06 2.65v3.72h-.85v-10.21z"></path><path d="m231.35 9.71h-.24c-1.49 0-3.26.15-3.26 1.68 0 .91.65 1.26 1.44 1.26 2.01 0 2.06-1.75 2.06-2.51zm.08 2.39h-.03c-.38.83-1.35 1.28-2.2 1.28-1.97 0-2.29-1.33-2.29-1.96 0-2.33 2.48-2.43 4.27-2.43h.16v-.36c0-1.19-.42-1.78-1.58-1.78-.72 0-1.4.16-2.04.57v-.84c.54-.26 1.43-.48 2.04-.48 1.72 0 2.43.78 2.43 2.59v3.07c0 .56 0 .98.07 1.46h-.84z"></path><path d="m235.9 7h-1.4v-.73h1.4v-.51c0-1.46.06-2.93 1.84-2.93.27 0 .64.04.8.13l-.06.75c-.18-.1-.43-.15-.68-.15-1.17 0-1.04 1.26-1.04 2.1v.6h1.56v.74h-1.56v6.21h-.86z"></path><path d="m243.91 7h-1.58v4.49c0 .62.23 1.14.93 1.14.33 0 .55-.07.79-.16l.06.71c-.2.09-.62.19-1.04.19-1.52 0-1.58-1.04-1.58-2.32v-4.05h-1.36v-.73h1.36v-1.68l.86-.3v1.97h1.58z"></path><path d="m21.96 23.56c-.6-.32-1.46-.41-2.13-.41-2.46 0-3.85 1.74-3.85 4.1 0 2.4 1.35 4.1 3.85 4.1.62 0 1.58-.09 2.13-.41l.06.81c-.52.32-1.58.41-2.17.41-3 0-4.79-1.97-4.79-4.92 0-2.88 1.85-4.92 4.79-4.92.56 0 1.69.1 2.17.35z"></path><path d="m27.86 31.42c1.49 0 2.3-1.29 2.3-2.9s-.8-2.9-2.3-2.9-2.3 1.29-2.3 2.9.8 2.9 2.3 2.9zm0-6.53c2.25 0 3.24 1.74 3.24 3.63 0 1.9-1 3.63-3.24 3.63s-3.24-1.74-3.24-3.63.99-3.63 3.24-3.63"></path><path d="m33.79 26.69c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.86v-4.23c0-1.3-.46-2.16-1.65-2.16-1.57 0-2.06 1.38-2.06 2.53v3.84h-.86v-5.3"></path><path d="m43 25.79h-1.4v-.74h1.4v-.51c0-1.46.06-2.93 1.84-2.93.27 0 .64.04.8.13l-.06.75c-.17-.1-.43-.15-.68-.15-1.17 0-1.04 1.26-1.04 2.1v.6h1.56v.74h-1.56v6.21h-.86z"></path><path d="m50.82 22.37h1.07l-1.72 1.96h-.62zm1.43 5.66c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.79 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m58.47 31.42c1.52 0 2.06-1.64 2.06-2.9s-.53-2.9-2.06-2.9c-1.64 0-2.06 1.55-2.06 2.9.01 1.35.43 2.9 2.06 2.9zm2.92.58h-.86v-1.1h-.03c-.46.88-1.17 1.26-2.17 1.26-1.91 0-2.86-1.58-2.86-3.63 0-2.11.81-3.63 2.86-3.63 1.36 0 2.04 1 2.17 1.33h.03v-4.44h.86z"></path><path d="m67.32 22.37h1.07l-1.72 1.96h-.62zm1.43 5.66c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m72.39 26.6c0-.77 0-1.04-.06-1.55h.86v1.33h.03c.32-.78.9-1.49 1.78-1.49.2 0 .45.04.6.09v.9c-.18-.06-.41-.09-.62-.09-1.36 0-1.73 1.52-1.73 2.78v3.43h-.86z"></path><path d="m81.9 28.5h-.25c-1.49 0-3.26.15-3.26 1.68 0 .91.65 1.26 1.45 1.26 2.01 0 2.06-1.75 2.06-2.51zm.07 2.38h-.03c-.38.83-1.35 1.28-2.2 1.28-1.97 0-2.29-1.33-2.29-1.96 0-2.33 2.48-2.43 4.27-2.43h.16v-.35c0-1.19-.42-1.78-1.58-1.78-.72 0-1.4.16-2.04.57v-.83c.53-.26 1.43-.48 2.04-.48 1.72 0 2.43.78 2.43 2.59v3.07c0 .56 0 .98.07 1.46h-.84z"></path><path d="m88.85 25.79h-1.58v4.49c0 .62.23 1.14.93 1.14.33 0 .55-.07.8-.16l.06.71c-.2.09-.62.19-1.04.19-1.52 0-1.58-1.04-1.58-2.32v-4.06h-1.36v-.74h1.36v-1.68l.86-.3v1.97h1.58v.75"></path><path d="m91.46 25.05h.86v6.95h-.86zm.85-1.85h-.86v-1.14h.86z"></path><path d="m98.25 31.42c1.49 0 2.3-1.29 2.3-2.9s-.8-2.9-2.3-2.9c-1.49 0-2.3 1.29-2.3 2.9s.8 2.9 2.3 2.9zm0-6.53c2.25 0 3.24 1.74 3.24 3.63 0 1.9-1 3.63-3.24 3.63s-3.24-1.74-3.24-3.63.99-3.63 3.24-3.63"></path><path d="m104.17 26.69c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.86v-4.23c0-1.3-.46-2.16-1.65-2.16-1.56 0-2.06 1.38-2.06 2.53v3.84h-.86v-5.3"></path><path d="m116.99 30.99c.52.26 1.14.44 1.81.44.81 0 1.54-.45 1.54-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.12-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m129.3 30.36c0 .53 0 1.07.06 1.64h-.83v-1.24h-.03c-.29.62-.8 1.4-2.25 1.4-1.72 0-2.37-1.14-2.37-2.67v-4.44h.86v4.23c0 1.31.46 2.16 1.65 2.16 1.56 0 2.06-1.38 2.06-2.53v-3.84h.86z"></path><path d="m132.52 25.05h.86v6.95h-.86zm.85-1.85h-.86v-1.14h.86z"></path><path d="m136.07 30.99c.52.26 1.14.44 1.81.44.81 0 1.54-.45 1.54-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.12-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m142.42 30.99c.52.26 1.14.44 1.81.44.81 0 1.53-.45 1.53-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.12-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m153.56 28.03c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.79 2.65 2.29 2.65.63 0 1.54-.26 1.95-.52z"></path><path d="m21.96 42.34c-.6-.32-1.46-.41-2.13-.41-2.46 0-3.85 1.74-3.85 4.1 0 2.4 1.35 4.1 3.85 4.1.62 0 1.58-.09 2.13-.41l.06.81c-.52.32-1.58.41-2.17.41-3 0-4.79-1.97-4.79-4.92 0-2.88 1.85-4.92 4.79-4.92.56 0 1.69.1 2.17.35z"></path><path d="m27.86 50.21c1.49 0 2.3-1.29 2.3-2.9s-.8-2.9-2.3-2.9-2.3 1.29-2.3 2.9.8 2.9 2.3 2.9zm0-6.54c2.25 0 3.24 1.74 3.24 3.63 0 1.9-1 3.63-3.24 3.63s-3.24-1.74-3.24-3.63.99-3.63 3.24-3.63"></path><path d="m33.79 45.47c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.86v-4.23c0-1.3-.46-2.16-1.65-2.16-1.57 0-2.06 1.38-2.06 2.53v3.84h-.86v-5.3"></path><path d="m43 44.57h-1.4v-.74h1.4v-.51c0-1.46.06-2.93 1.84-2.93.27 0 .64.04.8.13l-.06.75c-.17-.1-.43-.15-.68-.15-1.17 0-1.04 1.26-1.04 2.1v.6h1.56v.74h-1.56v6.21h-.86z"></path><path d="m52.25 46.82c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.79 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m58.47 50.21c1.52 0 2.06-1.64 2.06-2.9s-.53-2.9-2.06-2.9c-1.64 0-2.06 1.55-2.06 2.9.01 1.35.43 2.9 2.06 2.9zm2.92.57h-.86v-1.1h-.03c-.46.88-1.17 1.26-2.17 1.26-1.91 0-2.86-1.58-2.86-3.63 0-2.11.81-3.63 2.86-3.63 1.36 0 2.04 1 2.17 1.33h.03v-4.44h.86z"></path><path d="m68.75 46.82c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m72.39 45.38c0-.77 0-1.04-.06-1.55h.86v1.33h.03c.32-.78.9-1.49 1.78-1.49.2 0 .45.04.6.09v.9c-.18-.06-.41-.09-.62-.09-1.36 0-1.73 1.52-1.73 2.78v3.43h-.86z"></path><path d="m81.9 47.28h-.25c-1.49 0-3.26.15-3.26 1.68 0 .91.65 1.26 1.45 1.26 2.01 0 2.06-1.75 2.06-2.51zm.07 2.39h-.03c-.38.83-1.35 1.28-2.2 1.28-1.97 0-2.29-1.33-2.29-1.96 0-2.33 2.48-2.43 4.27-2.43h.16v-.36c0-1.19-.42-1.78-1.58-1.78-.72 0-1.4.16-2.04.57v-.83c.53-.26 1.43-.48 2.04-.48 1.72 0 2.43.78 2.43 2.59v3.07c0 .56 0 .98.07 1.46h-.84z"></path><path d="m85.22 50.06 4.18-5.49h-4.01v-.74h5.01v.74l-4.18 5.47h4.18v.74h-5.17v-.72z"></path><path d="m92.96 43.83h.86v6.95h-.86zm.87-1.85h-.86v-1.14h.86z"></path><path d="m99.77 50.21c1.49 0 2.3-1.29 2.3-2.9s-.8-2.9-2.3-2.9c-1.49 0-2.3 1.29-2.3 2.9-.01 1.61.79 2.9 2.3 2.9zm0-6.54c2.25 0 3.24 1.74 3.24 3.63 0 1.9-1 3.63-3.24 3.63s-3.24-1.74-3.24-3.63c-.01-1.89.98-3.63 3.24-3.63"></path><path d="m105.69 45.47c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.86v-4.23c0-1.3-.46-2.16-1.65-2.16-1.57 0-2.06 1.38-2.06 2.53v3.84h-.86v-5.3"></path><path d="m118.55 46.82c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.43 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m126.74 49.57c.56.35 1.21.56 2.1.56 1.17 0 2.14-.6 2.14-1.95 0-1.87-4.36-2.1-4.36-4.59 0-1.52 1.33-2.48 3.01-2.48.46 0 1.21.07 1.87.32l-.15.86c-.42-.23-1.09-.35-1.73-.35-.98 0-2.06.41-2.06 1.64 0 1.91 4.36 1.92 4.36 4.69 0 1.92-1.65 2.68-3.11 2.68-.93 0-1.65-.19-2.16-.41z"></path><path d="m137.18 50.78h-1.01l-2.36-6.95h.94l1.92 6.01h.03l2.01-6.01h.9z"></path><path d="m141.89 43.83h.86v6.95h-.86zm.85-1.85h-.86v-1.14h.86z"></path><path d="m145.33 50.06 4.18-5.49h-4.01v-.74h5.01v.74l-4.18 5.47h4.18v.74h-5.17v-.72z"></path><path d="m152.44 50.06 4.18-5.49h-4.01v-.74h5.01v.74l-4.18 5.47h4.18v.74h-5.17v-.72z"></path><path d="m164.42 46.82c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.37.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.76 1.58 2.76 3.45v.43h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m168.05 45.38c0-.77 0-1.04-.05-1.55h.85v1.33h.03c.32-.78.9-1.49 1.78-1.49.2 0 .45.04.6.09v.9c-.17-.06-.41-.09-.62-.09-1.36 0-1.73 1.52-1.73 2.78v3.43h-.86z"></path><path d="m177.56 47.28h-.25c-1.49 0-3.26.15-3.26 1.68 0 .91.65 1.26 1.45 1.26 2.01 0 2.06-1.75 2.06-2.51zm.08 2.39h-.03c-.38.83-1.35 1.28-2.2 1.28-1.97 0-2.29-1.33-2.29-1.96 0-2.33 2.48-2.43 4.27-2.43h.16v-.36c0-1.19-.42-1.78-1.58-1.78-.72 0-1.4.16-2.04.57v-.83c.53-.26 1.43-.48 2.04-.48 1.72 0 2.43.78 2.43 2.59v3.07c0 .56 0 .98.07 1.46h-.84z"></path><path d="m21.96 61.12c-.6-.32-1.46-.41-2.13-.41-2.46 0-3.85 1.74-3.85 4.1 0 2.4 1.35 4.1 3.85 4.1.62 0 1.58-.09 2.13-.41l.06.81c-.52.32-1.58.41-2.17.41-3 0-4.79-1.97-4.79-4.92 0-2.88 1.85-4.92 4.79-4.92.56 0 1.69.1 2.17.35z"></path><path d="m27.86 68.99c1.49 0 2.3-1.29 2.3-2.9s-.8-2.9-2.3-2.9-2.3 1.29-2.3 2.9.8 2.9 2.3 2.9zm0-6.53c2.25 0 3.24 1.74 3.24 3.63 0 1.9-1 3.63-3.24 3.63s-3.24-1.74-3.24-3.63.99-3.63 3.24-3.63"></path><path d="m33.79 64.25c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.86v-4.23c0-1.3-.46-2.16-1.65-2.16-1.57 0-2.06 1.38-2.06 2.53v3.84h-.86v-5.3"></path><path d="m43 63.35h-1.4v-.74h1.4v-.51c0-1.46.06-2.93 1.84-2.93.27 0 .64.04.8.13l-.06.75c-.17-.1-.43-.15-.68-.15-1.17 0-1.04 1.26-1.04 2.1v.6h1.56v.74h-1.56v6.21h-.86z"></path><path d="m52.25 65.6c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.79 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m58.47 68.99c1.52 0 2.06-1.64 2.06-2.9s-.53-2.9-2.06-2.9c-1.64 0-2.06 1.55-2.06 2.9.01 1.35.43 2.9 2.06 2.9zm2.92.58h-.86v-1.1h-.03c-.46.88-1.17 1.26-2.17 1.26-1.91 0-2.86-1.58-2.86-3.63 0-2.11.81-3.63 2.86-3.63 1.36 0 2.04 1 2.17 1.33h.03v-4.44h.86z"></path><path d="m68.75 65.6c0-1.22-.49-2.41-1.77-2.41-1.26 0-2.04 1.26-2.04 2.41zm.42 3.75c-.6.25-1.38.38-2.01.38-2.3 0-3.16-1.55-3.16-3.63 0-2.13 1.17-3.63 2.93-3.63 1.96 0 2.77 1.58 2.77 3.45v.43h-4.75c0 1.48.8 2.65 2.29 2.65.62 0 1.54-.26 1.95-.52z"></path><path d="m72.39 64.17c0-.77 0-1.04-.06-1.55h.86v1.33h.03c.32-.78.9-1.49 1.78-1.49.2 0 .45.04.6.09v.9c-.18-.06-.41-.09-.62-.09-1.36 0-1.73 1.52-1.73 2.78v3.43h-.86z"></path><path d="m81.9 66.06h-.25c-1.49 0-3.26.15-3.26 1.68 0 .91.65 1.26 1.45 1.26 2.01 0 2.06-1.75 2.06-2.51zm.07 2.38h-.03c-.38.83-1.35 1.28-2.2 1.28-1.97 0-2.29-1.33-2.29-1.96 0-2.33 2.48-2.43 4.27-2.43h.16v-.35c0-1.19-.42-1.78-1.58-1.78-.72 0-1.4.16-2.04.57v-.83c.53-.26 1.43-.48 2.04-.48 1.72 0 2.43.78 2.43 2.59v3.07c0 .56 0 .98.07 1.46h-.84z"></path><path d="m85.22 68.84 4.18-5.49h-4.01v-.74h5.01v.74l-4.18 5.47h4.18v.74h-5.17v-.72z"></path><path d="m92.96 62.62h.86v6.95h-.86zm.87-1.86h-.86v-1.14h.86z"></path><path d="m102.47 67.93c0 .53 0 1.07.06 1.64h-.83v-1.25h-.03c-.29.62-.8 1.4-2.25 1.4-1.72 0-2.37-1.14-2.37-2.67v-4.44h.86v4.23c0 1.31.46 2.16 1.65 2.16 1.56 0 2.06-1.38 2.06-2.53v-3.84h.86z"></path><path d="m105.69 64.25c0-.53 0-1.07-.06-1.64h.83v1.24h.03c.29-.62.8-1.4 2.24-1.4 1.72 0 2.37 1.14 2.37 2.67v4.44h-.86v-4.23c0-1.3-.46-2.16-1.65-2.16-1.57 0-2.06 1.38-2.06 2.53v3.84h-.86v-5.3"></path><path d="m118.5 68.55c.52.26 1.14.44 1.81.44.81 0 1.54-.45 1.54-1.24 0-1.65-3.33-1.39-3.33-3.4 0-1.38 1.12-1.9 2.26-1.9.36 0 1.1.09 1.72.32l-.09.75c-.45-.2-1.06-.33-1.54-.33-.88 0-1.49.27-1.49 1.16 0 1.29 3.42 1.13 3.42 3.4 0 1.48-1.38 1.97-2.42 1.97-.67 0-1.33-.09-1.95-.33z"></path><path d="m127.8 69.57h-1.01l-2.36-6.95h.94l1.92 6.01h.03l2.01-6.01h.9z"></path><path d="m132.5 62.62h.86v6.95h-.86zm.86-1.86h-.86v-1.14h.86z"></path><path d="m135.95 68.84 4.18-5.49h-4.01v-.74h5.01v.74l-4.18 5.47h4.18v.74h-5.17z"></path><path d="m143.7 64.17c0-.77 0-1.04-.06-1.55h.86v1.33h.03c.32-.78.9-1.49 1.78-1.49.2 0 .45.04.6.09v.9c-.18-.06-.41-.09-.62-.09-1.36 0-1.73 1.52-1.73 2.78v3.43h-.86z"></path><path d="m153.2 66.06h-.25c-1.49 0-3.26.15-3.26 1.68 0 .91.65 1.26 1.45 1.26 2.01 0 2.06-1.75 2.06-2.51zm.08 2.38h-.03c-.38.83-1.35 1.28-2.2 1.28-1.97 0-2.29-1.33-2.29-1.96 0-2.33 2.48-2.43 4.27-2.43h.16v-.35c0-1.19-.42-1.78-1.58-1.78-.72 0-1.4.16-2.04.57v-.83c.53-.26 1.43-.48 2.04-.48 1.72 0 2.43.78 2.43 2.59v3.07c0 .56 0 .98.07 1.46h-.84z"></path></svg>'''

_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Liegenschaften-Inventar – Prüfbericht — BBL</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 44'%3E%3Cpath d='m38.5778 3.2s-7.2-3.2-19.3-3.2c-12.00002 0-19.2000222 3.2-19.2000222 3.2s-.6999998 14.1 2.1000022 22.1c4.8 14 17.20002 18 17.20002 18s12.3-3.9 17.2-18c2.6-8 2-22.1 2-22.1z' fill='%23ff0000'/%3E%3Cpath d='m32.0779 15.4v7.8h-9v9.1h-7.7v-9.1h-8.99997v-7.8h8.99997v-9.09995h7.7v9.09995z' fill='%23fff'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>
  :root{
    /* primary (Swiss red) */
    --red:#d8232a;--red-hover:#bf1f25;--red-strong:#99191e;--red-500:#e53940;--red-100:#fae1e2;
    /* secondary (slate) */
    --ink:#1f2937;--slate-900:#131b22;--slate-800:#1c2834;--slate-700:#263645;--slate-600:#2f4356;--slate-500:#46596b;--slate-400:#596978;
    --surface-2:#dfe4e9;--surface:#f0f4f7;
    /* neutrals / lines */
    --gray:#6b7280;--gray-600:#4b5563;--text-700:#374151;--line:#e5e7eb;--line-strong:#d1d5db;--border-input:#6b7280;
    /* semantic soft-tints (badge -100 bg / -800 text) */
    --warn:#9a3412;--warn-bg:#ffedd5;--ok:#065f46;--ok-bg:#d1fae5;
    /* dataviz encodings (kept off the severity palette) */
    --c-building:#1d4ed8;--c-parcel:#0d8b96;--c-parcel-line:#0f6b75;
    --focus:#8655F6;
  }
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 "Noto Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--surface)}
  .skip-link{position:absolute;left:-9999px}
  .skip-link:focus{left:8px;top:8px;background:#fff;color:var(--ink);padding:8px 12px;border:1px solid var(--line);border-radius:3px;z-index:1100}
  :where(button,[role=button],a[href],input,select,textarea,.bar,.th-sort,.pill-x):focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:3px}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
  /* federal header: flag + Confederation wordmark + office/report title */
  header{background:#fff;border-bottom:1px solid var(--line)}
  .header__bar{display:flex;align-items:flex-start;padding:16px 24px;flex-wrap:wrap;width:100%;max-width:1544px;margin:0 auto}
  .logo__flag{flex-shrink:0;width:32px;height:34px}
  .logo__name{flex-shrink:0;height:50px;width:auto}
  .logo__separator{flex-shrink:0;width:1px;height:56px;background:var(--line-strong);margin:0 20px}
  .header__titles{display:flex;flex-direction:column}
  .header__org{font-weight:700;font-size:.875rem;line-height:1.35}
  header h1{margin:0;font-size:.8125rem;font-weight:400;line-height:1.35;color:var(--slate-500)}
  .filterbtn-wrap{margin-left:auto;align-self:center;display:flex;align-items:center;gap:10px}
  .header__link{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-input);background:#fff;border-radius:3px;padding:8px 14px;font-size:.875rem;color:var(--ink);text-decoration:none;cursor:pointer}
  .header__link:hover{border-color:var(--slate-500);color:var(--red)}
  .header__link svg{display:block}
  .filterbtn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-input);background:#fff;border-radius:3px;padding:8px 14px;font:inherit;font-size:.875rem;color:var(--ink);cursor:pointer}
  .filterbtn:hover{border-color:var(--slate-500);color:var(--red)}
  .filterbtn svg{display:block}
  .filterbadge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--red);color:#fff;font-size:.6875rem;font-weight:700}
  .fp-scrim{position:fixed;inset:0;background:rgba(47,67,86,.4);z-index:90;border:0}
  .filterpanel{position:fixed;top:0;right:0;height:100vh;height:100dvh;width:340px;max-width:90vw;z-index:100;
    background:#fff;border-left:1px solid var(--line);box-shadow:-10px 0 25px -5px rgba(0,0,0,.18);
    display:flex;flex-direction:column}
  /* display:flex above would defeat the [hidden] attribute (equal specificity, later rule) — keep this guard */
  .filterpanel[hidden],.fp-scrim[hidden]{display:none}
  .fp-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);flex:0 0 auto}
  .fp-title{font-weight:700;font-size:1rem}
  .fp-close{appearance:none;border:0;background:none;font-size:24px;line-height:1;color:var(--ink);cursor:pointer;padding:2px 8px;border-radius:3px}
  .fp-close:hover{color:var(--red)}
  .fp-body{flex:1 1 auto;overflow-y:auto;padding:4px 20px}
  .fp-foot{flex:0 0 auto;padding:14px 20px;border-top:1px solid var(--line)}
  .fp-sec{padding:12px 0;border-top:1px solid var(--line)}
  .fp-sec:first-child{border-top:0}
  .fp-h{font-weight:700;font-size:.8125rem;margin-bottom:6px}
  .fp-hint{font-weight:400;color:var(--gray);font-size:.6875rem}
  .fp-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.875rem;cursor:pointer}
  .fp-checks{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
  .filterpanel .reset{display:inline-block;text-decoration:underline;text-underline-offset:2px}
  main{width:100%;max-width:1544px;margin:0 auto;padding:20px 24px 60px}
  @media(min-width:1920px){main,.header__bar{max-width:1676px}}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:16px}
  .card{background:#fff;padding:16px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}
  .card .n{font-size:24px;font-weight:700}
  .card .l{color:var(--gray);font-size:12px;margin-top:2px}
  .card .s{color:var(--gray);font-size:11px;margin-top:6px}
  .panel{background:#fff;padding:16px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}
  .panel h2{margin:0 0 12px;font-size:1rem;font-weight:700;color:var(--ink)}
  .mb{margin-bottom:16px}
  .charts{display:grid;grid-template-columns:1fr 1.8fr;gap:16px;margin-bottom:16px;align-items:start}
  @media(max-width:900px){.charts{grid-template-columns:1fr}}
  .chart-col{display:flex;flex-direction:column;gap:16px}
  /* horizontal bar charts */
  #sevbars .bar-label,#typebars .bar-label{flex:0 0 70px}
  #bars .bar-label{flex:0 0 310px}
  .bar{display:flex;align-items:center;gap:10px;margin:7px 0;cursor:pointer;padding:1px 4px;border-radius:3px;
       appearance:none;border:0;width:100%;text-align:left;background:none;font:inherit;color:inherit}
  .bar:hover .bar-label{text-decoration:underline}
  .bar.sel{background:var(--surface)}
  .bar.sel .bar-label,.bar.sel .bar-n{font-weight:700;color:var(--ink)}
  .bar-label{flex:0 0 240px;font-size:.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar-track{flex:1;background:var(--surface-2);border-radius:3px;height:18px;overflow:hidden}
  .bar-fill{display:block;height:100%;border-radius:3px;min-width:2px}
  .bar-fill.HIGH{background:var(--red)}.bar-fill.MED{background:var(--warn)}.bar-fill.LOW{background:var(--slate-400)}
  .bar-n{flex:0 0 48px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
  #map{height:clamp(460px,60vh,760px);z-index:0}
  .map-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:.75rem;color:var(--gray);margin:8px 0}
  .map-legend i{display:inline-block;vertical-align:middle;margin-right:4px}
  .map-note{color:var(--gray);font-size:.75rem;margin-top:8px}
  .toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
  .toolbar input,.toolbar select{padding:10px 16px;border:1px solid var(--border-input);border-radius:6px;font:inherit;min-height:44px;background:#fff}
  .toolbar input[type=search]{flex:1;min-width:160px}
  .toolbar input::placeholder{color:var(--slate-400)}
  /* CD underline tabs */
  .seg{display:inline-flex;border-bottom:1px solid var(--line)}
  .seg button{border:0;background:none;padding:12px 16px;cursor:pointer;font:inherit;color:var(--ink);position:relative}
  .seg button:first-child{padding-left:0}
  .seg button:hover:not(.on){color:var(--red)}
  .seg button.on::after,.seg button:hover:not(.on)::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--red-500)}
  .seg button.on{font-weight:700}
  .chk{display:inline-flex;align-items:center;gap:5px;font-size:.875rem}
  .filters{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:16px}
  .pill{display:inline-flex;align-items:center;gap:4px;background:var(--surface-2);color:var(--ink);
        border-radius:999px;padding:3px 4px 3px 11px;font-size:.75rem;white-space:nowrap}
  .pill b{font-weight:700}
  .pill .k{color:var(--slate-500);font-weight:400}
  .pill-x{border:0;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:0 4px;border-radius:50%}
  .pill-x:hover{background:#acb4bd}
  .reset{appearance:none;border:0;background:none;margin-left:4px;font:inherit;font-size:.75rem;color:var(--red);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
  .filters .none{color:var(--gray);font-size:.75rem}
  .count{color:var(--gray);font-size:.75rem;margin-left:auto}
  .pager{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px;font-size:.8125rem;color:var(--gray)}
  .pager .pg-left,.pager .pg-right{flex:0 0 auto}
  .pager .pg-mid{display:flex;gap:8px;align-items:center}
  .pager button{border:1px solid var(--border-input);background:#fff;border-radius:3px;padding:8px 16px;cursor:pointer;font:inherit;color:var(--slate-800)}
  .pager button:disabled{color:#828e9a;border-color:#acb4bd;background:transparent;cursor:default}
  .pager select{padding:6px 10px;border:1px solid var(--border-input);border-radius:3px;font:inherit}
  /* table (CD) */
  .tablewrap{max-height:68vh;overflow:auto}
  table{width:100%;border-collapse:collapse;background:#fff;font-size:.875rem;box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1)}
  thead th{position:sticky;top:0;z-index:2;background:var(--surface);text-align:left;padding:12px 16px;border-bottom:1px solid var(--line-strong);
           color:var(--text-700);text-transform:uppercase;font-size:.875rem;white-space:nowrap;vertical-align:top}
  .th-sort{appearance:none;border:0;background:none;font:inherit;color:inherit;text-transform:inherit;cursor:pointer;display:inline-flex;align-items:baseline;gap:2px;text-align:left}
  .th-sort:hover{color:var(--red)}
  tbody td{padding:10px 16px;border-top:1px solid var(--line-strong);vertical-align:top;color:var(--gray-600)}
  tbody tr{cursor:pointer}
  tbody tr:hover,tbody tr.sel{background:var(--surface)}
  .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:700;white-space:nowrap}
  .HIGH{background:var(--red-100);color:var(--red-strong)}.MED{background:var(--warn-bg);color:var(--warn)}.LOW{background:var(--surface-2);color:var(--ink)}
  .st-found{background:var(--ok-bg);color:var(--ok)}.st-notfound,.st-error{background:var(--red-100);color:var(--red-strong)}
  .st-missing{background:var(--warn-bg);color:var(--warn)}.st-foreign,.st-unchecked{background:var(--surface-2);color:var(--ink)}
  .yes{color:var(--ok);font-weight:700}.no{color:var(--red);font-weight:700}
  .mono{font-family:Consolas,ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8125rem}
  .sug{color:var(--ok);font-weight:700}
  a{color:var(--red);text-decoration:underline;text-underline-offset:2px}a:hover{color:var(--red-strong)}
  .footer{border-top:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;padding:14px 24px;font-size:.75rem;color:var(--gray);margin-top:24px}
  .footer-info{display:flex;flex-wrap:wrap;gap:.375rem;align-items:center}
  .footer-links{display:flex;flex-wrap:wrap;gap:1rem}
  .footer a{color:var(--gray);text-decoration:none}
  .footer a:hover{text-decoration:underline}
  .footer-meta{flex:1;text-align:center;color:var(--gray);font-size:.75rem}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.001ms!important;animation-duration:.001ms!important}}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to report</a>
<header>
  <div class="header__bar">
    <svg class="logo__flag" viewBox="0 0 40 44" aria-hidden="true"><path d="m38.5778 3.2s-7.2-3.2-19.3-3.2c-12.00002 0-19.2000222 3.2-19.2000222 3.2s-.6999998 14.1 2.1000022 22.1c4.8 14 17.20002 18 17.20002 18s12.3-3.9 17.2-18c2.6-8 2-22.1 2-22.1z" fill="#ff0000"/><path d="m32.0779 15.4v7.8h-9v9.1h-7.7v-9.1h-8.99997v-7.8h8.99997v-9.09995h7.7v9.09995z" fill="#ffffff"/></svg>
    <span class="logo__separator"></span>
    <!--NAMESVG-->
    <span class="logo__separator"></span>
    <div class="header__titles">
      <span class="header__org">Bundesamt für Bauten und Logistik BBL</span>
      <h1>Liegenschaften-Inventar – Prüfbericht</h1>
    </div>
    <div class="filterbtn-wrap">
      <a class="header__link" href="https://github.com/bbl-dres/geo-check/blob/main/oereb-check/RULE-SET.md" target="_blank" rel="noopener" title="Regelwerk – alle Prüfregeln (öffnet RULE-SET.md auf GitHub)">
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.3h5M5.5 12.6h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Regelwerk
      </a>
      <button type="button" id="filterbtn" class="filterbtn" aria-expanded="false" aria-controls="filterpanel" aria-haspopup="dialog">
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M1.5 2.5h13l-5 6V13l-3 1.5V8.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        Filter<span class="filterbadge" id="filterbadge" hidden></span>
      </button>
    </div>
  </div>
</header>
<div class="fp-scrim" id="fpscrim" hidden></div>
<aside class="filterpanel" id="filterpanel" hidden role="dialog" aria-modal="true" aria-label="Filter">
  <div class="fp-head">
    <span class="fp-title">Filter</span>
    <button type="button" class="fp-close" id="fpclose" aria-label="Filter schliessen">×</button>
  </div>
  <div class="fp-body">
    <div class="fp-sec">
      <div class="fp-h">Schweregrad</div>
      <label class="fp-row"><input type="checkbox" id="fSev_HIGH"> Hoch <span class="fp-hint">· Fehler</span></label>
      <label class="fp-row"><input type="checkbox" id="fSev_MED"> Mittel <span class="fp-hint">· Warnung</span></label>
      <label class="fp-row"><input type="checkbox" id="fSev_LOW"> Niedrig <span class="fp-hint">· Hinweis</span></label>
    </div>
    <div class="fp-sec">
      <div class="fp-h">Typ</div>
      <label class="fp-row"><input type="checkbox" id="fTyp_building"> Gebäude</label>
      <label class="fp-row"><input type="checkbox" id="fTyp_parcel"> Grundstücke</label>
    </div>
    <div class="fp-sec">
      <div class="fp-h">Objektklassen <span class="fp-hint">(angekreuzt = ausgeblendet)</span></div>
      <label class="fp-row"><input type="checkbox" id="fAbgang"> Abgang (ABGA…)</label>
      <label class="fp-row"><input type="checkbox" id="fLoevm"> Löschvermerk (LÖVM…)</label>
      <label class="fp-row"><input type="checkbox" id="fParking"> Parkplätze (…PP…)</label>
      <label class="fp-row"><input type="checkbox" id="fInfra"> Infrastrukturgefässe (GR)</label>
    </div>
    <div class="fp-sec">
      <div class="fp-h">Land</div>
      <label class="fp-row"><input type="checkbox" id="fLand_CH"> Schweiz</label>
      <label class="fp-row"><input type="checkbox" id="fLand_FOREIGN"> Ausland</label>
    </div>
    <div class="fp-sec">
      <div class="fp-h">Kanton</div>
      <div class="fp-checks" id="fKantonList"></div>
    </div>
  </div>
  <div class="fp-foot">
    <button type="button" class="reset" id="fReset">Alle Filter zurücksetzen</button>
  </div>
</aside>
<main id="main">
  <div class="filters" id="filters"></div>
  <div class="cards" id="cards"></div>
  <div class="charts">
    <div class="chart-col">
      <div class="panel">
        <h2>Findings by severity</h2>
        <div id="sevbars"></div>
      </div>
      <div class="panel">
        <h2>Findings by type</h2>
        <div id="typebars"></div>
      </div>
    </div>
    <div class="panel">
      <h2>Findings by category</h2>
      <div id="bars"></div>
      <div class="map-note">Click any bar to filter; click it again to clear.</div>
    </div>
  </div>
  <div class="panel mb">
    <h2>Map — click a table row to zoom; click a parcel to load its ÖREB polygon</h2>
    <div class="map-legend" aria-hidden="true">
      <span><i style="width:10px;height:10px;border-radius:50%;background:var(--c-building)"></i>Building</span>
      <span><i style="width:10px;height:10px;border-radius:50%;background:var(--c-parcel)"></i>Parcel</span>
      <span><i style="width:12px;height:12px;border-radius:50%;background:var(--c-parcel);outline:2px solid var(--c-parcel-line)"></i>Parcel flagged far</span>
      <span><i style="width:18px;border-top:2px dashed var(--slate-400)"></i>Distance to building cluster</span>
    </div>
    <div id="map" role="region" aria-label="Map of flagged parcels and building clusters"></div>
    <div class="map-note" id="mapnote" aria-live="polite"></div>
  </div>
  <div class="panel">
    <div class="toolbar">
      <span class="seg" id="viewseg" role="tablist" aria-label="Record view">
        <button role="tab" data-view="findings" class="on" aria-selected="true">Findings</button>
        <button role="tab" data-view="buildings" aria-selected="false">Buildings</button>
        <button role="tab" data-view="parcels" aria-selected="false">Parcels</button>
      </span>
      <select id="statussel" aria-label="Filter by status"></select>
      <label class="chk" id="farwrap"><input type="checkbox" id="farchk"> far only</label>
      <input type="search" id="q" placeholder="Search…" aria-label="Search table">
    </div>
    <div class="tablewrap" role="tabpanel" aria-label="Records">
      <table><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div class="pager" id="pager"></div>
  </div>
</main>
<footer class="footer">
  <div class="footer-info">
    <span>Datenquelle:</span>
    <a href="https://api3.geo.admin.ch" target="_blank" rel="noopener">geo.admin.ch API</a>
    <span aria-hidden="true">·</span>
    <a href="https://www.housing-stat.ch/de/home.html" target="_blank" rel="noopener">GWR</a>
    <span aria-hidden="true">·</span>
    <a href="https://www.cadastre.ch/de/oereb.html" target="_blank" rel="noopener">ÖREB-Kataster</a>
  </div>
  <div class="footer-meta" id="meta"></div>
  <div class="footer-links">
    <a href="https://github.com/bbl-dres/geo-check" target="_blank" rel="noopener">Quellcode</a>
    <a href="https://www.admin.ch/gov/de/start/rechtliches.html" target="_blank" rel="noopener">Rechtliches</a>
    <a href="https://www.bbl.admin.ch/de/kontakt" target="_blank" rel="noopener">Kontakt</a>
  </div>
</footer>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" onerror="window._nomap=1"></script>
<script>
const DATA = /*__DATA__*/;
const SEVRANK = {HIGH:0, MED:1, LOW:2};
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num = v => (v===""||v==null) ? null : +v;
const GMAP = {}; DATA.geo.forEach(g => GMAP[g.we+"|"+g.id]=g);

// point index for row-click-to-zoom: key "b|we|id" / "p|we|id" -> {lat,lon,egrid,name,far}
const PT = {};
DATA.buildings.forEach(b => { if(b.lat!=="") PT["b|"+b.we+"|"+b.id]={lat:b.lat,lon:b.lon,name:b.name}; });
DATA.parcels.forEach(p => { if(p.lat!=="") PT["p|"+p.we+"|"+p.id]={lat:p.lat,lon:p.lon,egrid:p.egrid,name:p.name,far:p.far===true}; });
let MAP=null, MAPREADY=false;

const statusBadge = s => s ? `<span class="badge st-${s}">${esc(s)}</span>` : "";
const check = v => v===true?'<span class="yes">✓<span class="sr-only"> yes</span></span>'
                 : v===false?'<span class="no">✗<span class="sr-only"> no</span></span>':"";
const mapLink = u => u?`<a href="${u}" target="_blank" rel="noopener">↗<span class="sr-only"> open in maps</span></a>`:"";
const farLink = f => { const g=GMAP[f.we+"|"+f.sap_id];
  return (f.category==="PARCEL_FAR"&&g)?` <a href="https://www.google.com/maps?q=${g.plat},${g.plon}" target="_blank">↗</a>`:""; };

const VIEWS = {
  findings:{data:DATA.findings, sort:"severity", search:["we","sap_id","name","key","detail","gemeinde","suggested_egrid"],
    cols:[
      {k:"severity",t:"Sev",h:f=>`<span class="badge ${f.severity}">${f.severity}</span>`},
      {k:"category",t:"Category",h:f=>esc(DATA.labels[f.category]||f.category)},
      {k:"we",t:"WE",c:"mono"},{k:"sap_id",t:"id",c:"mono"},{k:"name",t:"Name"},
      {k:"key",t:"EGID / E-GRID",c:"mono"},{k:"distance_m",t:"Dist (m)",n:true},
      {k:"suggested_egrid",t:"Suggested E-GRID",c:"mono sug"},{k:"gemeinde",t:"Municipality"},
      {k:"detail",t:"Detail",h:f=>esc(f.detail)+farLink(f)},
    ]},
  buildings:{data:DATA.buildings, sort:"we", search:["we","id","name","egid","gwr_egrid","gemeinde","kanton"],
    cols:[
      {k:"we",t:"WE",c:"mono"},{k:"id",t:"id",c:"mono"},{k:"name",t:"Name"},{k:"kanton",t:"Kt"},
      {k:"egid",t:"EGID",c:"mono"},{k:"status",t:"Status",h:b=>statusBadge(b.status)},
      {k:"gwr_egrid",t:"GWR E-GRID",c:"mono"},{k:"in_we",t:"In WE?",h:b=>check(b.in_we)},
      {k:"gemeinde",t:"Municipality"},{k:"maps",t:"Map",h:b=>mapLink(b.maps)},
    ]},
  parcels:{data:DATA.parcels, sort:"we", search:["we","id","name","egrid","gemeinde","kanton"],
    cols:[
      {k:"we",t:"WE",c:"mono"},{k:"id",t:"id",c:"mono"},{k:"name",t:"Name"},{k:"kanton",t:"Kt"},
      {k:"egrid",t:"E-GRID",c:"mono"},{k:"status",t:"Status",h:p=>statusBadge(p.status)},
      {k:"matches",t:"Matches bldg?",h:p=>check(p.matches)},{k:"dist",t:"Dist (m)",n:true},
      {k:"far",t:"Far",h:p=>p.far===true?'<span class="badge HIGH">FAR</span>':""},
      {k:"gemeinde",t:"Municipality"},{k:"maps",t:"Map",h:p=>mapLink(p.maps)},
    ]},
};

const ST = {view:"findings", q:"", sev:[], cat:"ALL", type:[], status:"ALL", far:false, sort:"severity", dir:1, page:1, pageSize:100,
            exAbgang:true, exLoevm:true, exParking:true, exInfra:true, land:[], kanton:[]};
const PAGE_SIZES = [100,200,500];
const SEV_ALL=["HIGH","MED","LOW"], TYPE_ALL=["building","parcel"], LAND_ALL=["CH","FOREIGN"];
// scope defaults: the four object classes are HIDDEN by default (the user toggles
// them off to reveal); severity/type/land/kanton unfiltered ([] = all).
function scopeDefaults(){ return {exAbgang:true, exLoevm:true, exParking:true, exInfra:true, sev:[], type:[], land:[], kanton:[]}; }
// multi-select toggle. [] means "all"; selecting the full set normalises back to [].
function toggleInc(arr, val, full){
  let cur = arr.length ? arr.slice() : full.slice();
  const i = cur.indexOf(val);
  if(i>=0) cur.splice(i,1); else cur.push(val);
  return cur.length===full.length ? [] : cur;
}

// ---- URL state (hash — works from a local file:// too) ----
function syncURL(){
  const p = new URLSearchParams();
  if(ST.view!=="findings") p.set("view",ST.view);
  if(ST.q) p.set("q",ST.q);
  if(ST.sev.length)p.set("sev",ST.sev.join(","));
  if(ST.cat!=="ALL")p.set("cat",ST.cat);
  if(ST.type.length)p.set("type",ST.type.join(","));
  if(ST.view!=="findings"){ if(ST.status!=="ALL")p.set("status",ST.status); if(ST.view==="parcels"&&ST.far)p.set("far","1"); }
  if(ST.sort!==VIEWS[ST.view].sort) p.set("sort",ST.sort);
  if(ST.dir===-1) p.set("dir","d");
  if(ST.page>1) p.set("pg",ST.page);
  if(ST.pageSize!==100) p.set("ps",ST.pageSize);
  if(!ST.exAbgang)p.set("xa","0"); if(!ST.exLoevm)p.set("xl","0");
  if(!ST.exParking)p.set("xp","0"); if(!ST.exInfra)p.set("xg","0");
  if(ST.land.length)p.set("land",ST.land.join(",")); if(ST.kanton.length)p.set("kt",ST.kanton.join(","));
  const qs = p.toString();
  try{ history.replaceState(null,"", qs?"#"+qs:location.pathname+location.search); }
  catch(e){ if(location.hash.slice(1)!==qs) location.hash=qs; }
}
function loadURL(){
  const p = new URLSearchParams((location.hash||"").replace(/^#/,""));
  if(VIEWS[p.get("view")]) ST.view=p.get("view");
  ST.q = p.get("q")||"";
  ST.sev = (p.get("sev")||"").split(",").filter(v=>SEV_ALL.includes(v));
  if(p.get("cat")) ST.cat=p.get("cat");
  ST.type = (p.get("type")||"").split(",").filter(v=>TYPE_ALL.includes(v));
  if(p.get("status")) ST.status=p.get("status");
  ST.far = p.get("far")==="1";
  ST.sort = p.get("sort")||VIEWS[ST.view].sort;
  ST.dir = p.get("dir")==="d"?-1:1;
  ST.page = Math.max(1, parseInt(p.get("pg")||"1",10)||1);
  const ps = parseInt(p.get("ps")||"100",10);
  ST.pageSize = PAGE_SIZES.includes(ps)?ps:100;
  ST.exAbgang=p.get("xa")!=="0"; ST.exLoevm=p.get("xl")!=="0";
  ST.exParking=p.get("xp")!=="0"; ST.exInfra=p.get("xg")!=="0";
  ST.land=(p.get("land")||"").split(",").filter(v=>LAND_ALL.includes(v));
  ST.kanton=(p.get("kt")||"").split(",").filter(Boolean);
}

// ---- meta + cards ----
const m = DATA.meta;
document.getElementById("meta").textContent =
  `Generated ${m.generated} · ${m.gebaeude||"buildings"} + ${m.grundstuecke||"parcels"} · far-threshold ${m.threshold} m`;
// summary cards follow the active filters (scope on all; the findings filters
// sev/cat drill the building & parcel counts, matching the table tabs).
function renderCards(){
  const drill = ST.sev.length||ST.cat!=="ALL";
  let bKeys=null,pKeys=null;
  if(drill){ bKeys=new Set(); pKeys=new Set();
    DATA.findings.forEach(f=>{ if(!inScope(f)) return;
      if(ST.sev.length&&!ST.sev.includes(f.severity)) return;
      if(ST.cat!=="ALL"&&f.category!==ST.cat) return;
      (f.kind==="building"?bKeys:pKeys).add(f.we+"|"+f.sap_id); }); }
  const inB=DATA.buildings.filter(b=>inScope(b)&&(!bKeys||bKeys.has(b.we+"|"+b.id)));
  const inP=DATA.parcels.filter(p=>inScope(p)&&(!pKeys||pKeys.has(p.we+"|"+p.id)));
  const ff=DATA.findings.filter(f=>inScope(f)&&sevOK(f.severity)&&(ST.cat==="ALL"||f.category===ST.cat)&&typeOK(f.kind));
  const has=s=>s!=="missing"&&s!=="foreign";   // had a valid key we tried to resolve
  const wes=new Set(); inB.forEach(b=>wes.add(b.we)); inP.forEach(p=>wes.add(p.we));
  const ncat=new Set(ff.map(f=>f.category)).size;
  document.getElementById("cards").innerHTML = [
    {n:inB.length, l:"Buildings", s:`${inB.filter(b=>b.land==="CH").length} CH · ${inB.filter(b=>has(b.status)).length} with EGID · ${inB.filter(b=>b.status==="found").length} in GWR`},
    {n:inP.length, l:"Parcels", s:`${inP.filter(p=>has(p.status)).length} with E-GRID · ${inP.filter(p=>p.status==="found").length} in ÖREB`},
    {n:wes.size, l:"Wirtschaftseinheiten", s:`${new Set(ff.map(f=>f.we)).size.toLocaleString()} with findings`},
    {n:ff.length, l:"Findings", s:`across ${ncat} categor${ncat===1?"y":"ies"}`},
  ].map(c=>`<div class="card"><div class="n">${c.n.toLocaleString()}</div><div class="l">${esc(c.l)}</div><div class="s">${esc(c.s)}</div></div>`).join("");
}

// ---- charts (cross-filtered: each chart excludes its own dimension) ----
const SEVNAME = {HIGH:"High", MED:"Medium", LOW:"Low"};
const TYPECOL = {building:"#1d4ed8", parcel:"#0d8b96"};
// scope pre-filter (filter panel): object-class exclusions + land + kanton.
// Applied to findings, charts, both record tables, and the drill-down.
const RE_ABGA=/^ABGA/i, RE_LOEVM=/^L[ÖO]VM/i;
function inScope(r){
  const name=r.name||"";
  const isParcel = (r.kind!==undefined) ? r.kind==="parcel" : (r.egrid!==undefined);
  const id=(r.sap_id!=null?r.sap_id:r.id)||"";
  if(ST.exAbgang && RE_ABGA.test(name)) return false;
  if(ST.exLoevm && RE_LOEVM.test(name)) return false;
  if(ST.exParking && isParcel && /\bPP\b/.test(name)) return false;
  if(ST.exInfra && !isParcel && id==="GR") return false;
  const land=r.land||"";
  if(ST.land.length){ const cat = land==="CH"?"CH":(land?"FOREIGN":""); if(!ST.land.includes(cat)) return false; }
  if(ST.kanton.length && !ST.kanton.includes(r.kanton||"")) return false;
  return true;
}
const sevOK = s => ST.sev.length===0 || ST.sev.includes(s);
const typeOK = k => ST.type.length===0 || ST.type.includes(k);
function findingsMatching(exclude){
  return DATA.findings.filter(f=> inScope(f) &&
    (exclude==="sev"||sevOK(f.severity)) &&
    (exclude==="cat"||ST.cat==="ALL"||f.category===ST.cat) &&
    (exclude==="type"||typeOK(f.kind)));
}
function pickFindingsView(){ if(ST.view!=="findings"){ ST.view="findings"; ST.sort="severity"; ST.dir=1; } }
function renderCharts(){
  // severity (cross-filter excl. severity)
  const sc={HIGH:0,MED:0,LOW:0}; findingsMatching("sev").forEach(f=>sc[f.severity]++);
  const mSv=Math.max(1,sc.HIGH,sc.MED,sc.LOW);
  document.getElementById("sevbars").innerHTML=["HIGH","MED","LOW"].map(s=>{const on=ST.sev.includes(s);
    return `<button type="button" class="bar ${on?"sel":""}" data-sev="${s}" aria-pressed="${on}" aria-label="Filter by severity ${SEVNAME[s]}, ${sc[s]} findings"><span class="bar-label">${SEVNAME[s]}</span><span class="bar-track"><span class="bar-fill ${s}" style="width:${Math.round(sc[s]/mSv*100)}%"></span></span><span class="bar-n">${sc[s].toLocaleString()}</span></button>`;}).join("");
  document.querySelectorAll("#sevbars .bar").forEach(b=>b.onclick=()=>{const v=b.dataset.sev;pickFindingsView();ST.sev=(ST.sev.length===1&&ST.sev[0]===v)?[]:[v];ST.page=1;renderAll();});
  // type (cross-filter excl. type): buildings vs parcels — horizontal bars (blue/teal)
  const tc={building:0,parcel:0}; findingsMatching("type").forEach(f=>{if(tc[f.kind]!=null)tc[f.kind]++;});
  const mT=Math.max(1,tc.building,tc.parcel);
  const TYPENAME={building:"Buildings",parcel:"Parcels"};
  document.getElementById("typebars").innerHTML=["building","parcel"].map(k=>{const on=ST.type.includes(k);
    return `<button type="button" class="bar ${on?"sel":""}" data-type="${k}" aria-pressed="${on}" aria-label="Filter by type ${TYPENAME[k]}, ${tc[k]} findings"><span class="bar-label">${TYPENAME[k]}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(tc[k]/mT*100)}%;background:${TYPECOL[k]}"></span></span><span class="bar-n">${tc[k].toLocaleString()}</span></button>`;}).join("");
  document.querySelectorAll("#typebars .bar").forEach(b=>b.onclick=()=>{const v=b.dataset.type;pickFindingsView();ST.type=(ST.type.length===1&&ST.type[0]===v)?[]:[v];ST.page=1;renderAll();});
  // category (cross-filter excl. category)
  const cc={}; findingsMatching("cat").forEach(f=>cc[f.category]=(cc[f.category]||0)+1);
  const mC=Math.max(1,...DATA.categories.map(c=>cc[c.key]||0));
  document.getElementById("bars").innerHTML=DATA.categories.map(c=>{const n=cc[c.key]||0;
    return `<button type="button" class="bar ${ST.cat===c.key?"sel":""}" data-cat="${c.key}" aria-pressed="${ST.cat===c.key}" aria-label="Filter by category ${esc(c.label)}, ${n} findings"><span class="bar-label">${esc(c.label)}</span><span class="bar-track"><span class="bar-fill ${c.severity}" style="width:${Math.round(n/mC*100)}%"></span></span><span class="bar-n">${n.toLocaleString()}</span></button>`;}).join("");
  document.querySelectorAll("#bars .bar").forEach(b=>b.onclick=()=>{const v=b.dataset.cat;pickFindingsView();ST.cat=(ST.cat===v?"ALL":v);ST.page=1;renderAll();});
}

// ---- controls ----
const elView=document.getElementById("viewseg"), elStatus=document.getElementById("statussel"),
      elFar=document.getElementById("farwrap"), elFarChk=document.getElementById("farchk"),
      elQ=document.getElementById("q");
elView.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{
  if(ST.view===btn.dataset.view) return;
  ST.view=btn.dataset.view; ST.sort=VIEWS[ST.view].sort; ST.dir=1; ST.page=1; renderAll();
});
elStatus.onchange=()=>{ST.status=elStatus.value;ST.page=1;renderAll();};
elFarChk.onchange=()=>{ST.far=elFarChk.checked;ST.page=1;renderAll();};
let qt; elQ.oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>{ST.q=e.target.value.toLowerCase();ST.page=1;renderFilters();renderTable();syncURL();},150);};

// ---- filter drawer (severity · type · object-class exclusions · land · kanton) ----
const elFbtn=document.getElementById("filterbtn"), elFpanel=document.getElementById("filterpanel"),
      elFscrim=document.getElementById("fpscrim"), elFbadge=document.getElementById("filterbadge"),
      elFAbgang=document.getElementById("fAbgang"), elFLoevm=document.getElementById("fLoevm"),
      elFParking=document.getElementById("fParking"), elFInfra=document.getElementById("fInfra"),
      elFKList=document.getElementById("fKantonList");
const KT_ALL=(function(){ const set=new Set();
  DATA.buildings.forEach(b=>{if(b.kanton)set.add(b.kanton);});
  DATA.parcels.forEach(p=>{if(p.kanton)set.add(p.kanton);});
  const ks=[...set].sort();
  elFKList.innerHTML=ks.map(k=>`<label class="fp-row"><input type="checkbox" data-kt value="${esc(k)}"> ${esc(k)}</label>`).join("");
  return ks; })();
function scopeCount(){
  return (ST.exAbgang?1:0)+(ST.exLoevm?1:0)+(ST.exParking?1:0)+(ST.exInfra?1:0)
    +(ST.sev.length?1:0)+(ST.type.length?1:0)+(ST.land.length?1:0)+(ST.kanton.length?1:0);
}
function setChecked(id,on){ const el=document.getElementById(id); if(el) el.checked=on; }
function renderPanel(){
  setChecked("fAbgang",ST.exAbgang); setChecked("fLoevm",ST.exLoevm);
  setChecked("fParking",ST.exParking); setChecked("fInfra",ST.exInfra);
  SEV_ALL.forEach(s=>setChecked("fSev_"+s, ST.sev.length===0||ST.sev.includes(s)));
  TYPE_ALL.forEach(k=>setChecked("fTyp_"+k, ST.type.length===0||ST.type.includes(k)));
  LAND_ALL.forEach(v=>setChecked("fLand_"+v, ST.land.length===0||ST.land.includes(v)));
  elFKList.querySelectorAll("input[data-kt]").forEach(el=>{ el.checked = ST.kanton.length===0||ST.kanton.includes(el.value); });
  const n=scopeCount(); elFbadge.textContent=n; elFbadge.hidden=(n===0);
}
function openPanel(o){
  elFpanel.hidden=!o; elFscrim.hidden=!o;
  elFbtn.setAttribute("aria-expanded", o?"true":"false");
  if(o) document.getElementById("fpclose").focus();
}
elFbtn.onclick=()=>openPanel(elFpanel.hidden);
document.getElementById("fpclose").onclick=()=>{ openPanel(false); elFbtn.focus(); };
elFscrim.onclick=()=>{ openPanel(false); elFbtn.focus(); };
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !elFpanel.hidden){ openPanel(false); elFbtn.focus(); } });
const onScope=()=>{ ST.page=1; renderAll(); };
elFAbgang.onchange=()=>{ST.exAbgang=elFAbgang.checked;onScope();};
elFLoevm.onchange=()=>{ST.exLoevm=elFLoevm.checked;onScope();};
elFParking.onchange=()=>{ST.exParking=elFParking.checked;onScope();};
elFInfra.onchange=()=>{ST.exInfra=elFInfra.checked;onScope();};
SEV_ALL.forEach(s=>{ const el=document.getElementById("fSev_"+s); if(el) el.onchange=()=>{ST.sev=toggleInc(ST.sev,s,SEV_ALL);onScope();}; });
TYPE_ALL.forEach(k=>{ const el=document.getElementById("fTyp_"+k); if(el) el.onchange=()=>{ST.type=toggleInc(ST.type,k,TYPE_ALL);onScope();}; });
LAND_ALL.forEach(v=>{ const el=document.getElementById("fLand_"+v); if(el) el.onchange=()=>{ST.land=toggleInc(ST.land,v,LAND_ALL);onScope();}; });
elFKList.addEventListener("change",e=>{ const t=e.target; if(t&&t.matches("input[data-kt]")){ ST.kanton=toggleInc(ST.kanton,t.value,KT_ALL); onScope(); } });
document.getElementById("fReset").onclick=clearFilters;

function statusOptions(view){
  const order=["found","notfound","missing","foreign","error","unchecked"];
  return [...new Set(VIEWS[view].data.map(r=>r.status).filter(Boolean))]
    .sort((a,b)=>order.indexOf(a)-order.indexOf(b));
}
function renderControls(){
  elView.querySelectorAll("button").forEach(b=>{const on=b.dataset.view===ST.view;b.classList.toggle("on",on);b.setAttribute("aria-selected",on);});
  const fnd=ST.view==="findings", par=ST.view==="parcels";
  elStatus.style.display=fnd?"none":"";
  elFar.style.display=par?"":"none";
  if(!fnd){
    elStatus.innerHTML='<option value="ALL">All statuses</option>'+
      statusOptions(ST.view).map(o=>`<option value="${o}">${o}</option>`).join("");
    elStatus.value=ST.status;
  }
  elFarChk.checked=ST.far;
  if(elQ.value!==ST.q) elQ.value=ST.q;
  elQ.placeholder = fnd?"Search WE, id, name, key, detail…":"Search WE, id, name, E-GRID, municipality…";
}

// "Alle Filter zurücksetzen" returns to the DEFAULT view (the 4 object-class exclusions
// back ON). Because defaults aren't serialised, this also clears the filter parameters
// from the URL hash. Both the pill-row link and the drawer button call this.
function clearFilters(){ Object.assign(ST, scopeDefaults()); ST.cat="ALL"; ST.status="ALL"; ST.far=false; ST.q=""; ST.page=1; renderAll(); }
// active-filter pills — EVERY active filter (findings + drawer scope) shows here; pills remove them
function renderFilters(){
  const el=document.getElementById("filters");
  const pills=[];
  // findings filters are global (drive charts + Findings table + tab drill-down)
  if(ST.sev.length) pills.push({k:"Severity", v:ST.sev.map(s=>SEVNAME[s]||s).join(", "), clr:()=>ST.sev=[]});
  if(ST.cat!=="ALL") pills.push({k:"Category", v:DATA.labels[ST.cat]||ST.cat, clr:()=>ST.cat="ALL"});
  if(ST.type.length) pills.push({k:"Type", v:ST.type.map(t=>t==="building"?"Buildings":"Parcels").join(", "), clr:()=>ST.type=[]});
  // record-tab filters are view-specific
  if(ST.view!=="findings" && ST.status!=="ALL") pills.push({k:"Status", v:ST.status, clr:()=>ST.status="ALL"});
  if(ST.view==="parcels" && ST.far) pills.push({k:"", v:"Only far", clr:()=>ST.far=false});
  if(ST.q) pills.push({k:"Search", v:`“${ST.q}”`, clr:()=>ST.q=""});
  // scope filters (drawer) appear as pills too — every active filter is shown, for consistency
  ST.land.forEach(v=>pills.push({k:"Land", v:v==="CH"?"Schweiz":"Ausland", clr:()=>ST.land=ST.land.filter(x=>x!==v)}));
  ST.kanton.forEach(v=>pills.push({k:"Kanton", v:v, clr:()=>ST.kanton=ST.kanton.filter(x=>x!==v)}));
  if(ST.exAbgang) pills.push({k:"ohne", v:"Abgang", clr:()=>ST.exAbgang=false});
  if(ST.exLoevm) pills.push({k:"ohne", v:"Löschvermerk", clr:()=>ST.exLoevm=false});
  if(ST.exParking) pills.push({k:"ohne", v:"Parkplätze", clr:()=>ST.exParking=false});
  if(ST.exInfra) pills.push({k:"ohne", v:"Infrastrukturgefässe", clr:()=>ST.exInfra=false});
  if(!pills.length){ el.style.display="none"; el.innerHTML=""; return; }
  el.style.display="";
  el.innerHTML = pills.map((p,i)=>
    `<span class="pill">${p.k?`<span class="k">${esc(p.k)}</span> `:""}<b>${esc(p.v)}</b>`+
    `<button type="button" class="pill-x" data-i="${i}" aria-label="Remove filter ${esc((p.k?p.k+" ":"")+p.v)}">×</button></span>`).join("")+
    `<button type="button" class="reset" id="resetf">Alle Filter zurücksetzen</button>`;
  el.querySelectorAll(".pill-x").forEach(b=>b.onclick=()=>{ pills[+b.dataset.i].clr(); ST.page=1; renderAll(); });
  document.getElementById("resetf").onclick=clearFilters;
}

function locFor(r){
  if(ST.view==="findings") return {k:r.kind==="parcel"?"p":"b", we:r.we, id:r.sap_id, egrid:r.kind==="parcel"?(r.key||""):""};
  if(ST.view==="buildings") return {k:"b", we:r.we, id:r.id, egrid:""};
  return {k:"p", we:r.we, id:r.id, egrid:r.egrid||""};
}
function renderTable(){
  const V=VIEWS[ST.view];
  // linked drill-down: when a findings filter (severity/category) is active, the
  // Buildings/Parcels tabs narrow to records that have a matching finding.
  let keyset=null;
  if(ST.view!=="findings" && (ST.sev.length||ST.cat!=="ALL")){
    const kind = ST.view==="buildings"?"building":"parcel";
    keyset=new Set();
    DATA.findings.forEach(f=>{
      if(f.kind!==kind || !inScope(f)) return;
      if(ST.sev.length&&!ST.sev.includes(f.severity)) return;
      if(ST.cat!=="ALL"&&f.category!==ST.cat) return;
      keyset.add(f.we+"|"+f.sap_id);
    });
  }
  let rows=V.data.filter(r=>{
    if(!inScope(r)) return false;                       // filter-panel scope (global)
    if(ST.view==="findings"){
      if(ST.sev.length&&!ST.sev.includes(r.severity))return false;
      if(ST.cat!=="ALL"&&r.category!==ST.cat)return false;
      if(ST.type.length&&!ST.type.includes(r.kind))return false;
    } else {
      if(keyset && !keyset.has(r.we+"|"+r.id))return false;
      if(ST.status!=="ALL"&&r.status!==ST.status)return false;
      if(ST.view==="parcels"&&ST.far&&r.far!==true)return false;
    }
    if(ST.q) return V.search.some(k=>String(r[k]==null?"":r[k]).toLowerCase().includes(ST.q));
    return true;
  });
  const k=ST.sort, dir=ST.dir, col=V.cols.find(c=>c.k===k);
  rows.sort((a,b)=>{
    let x,y;
    if(k==="severity"){x=SEVRANK[a.severity];y=SEVRANK[b.severity];}
    else if(col&&col.n){x=num(a[k])??-1;y=num(b[k])??-1;}
    else{x=String(a[k]==null?"":a[k]).toLowerCase();y=String(b[k]==null?"":b[k]).toLowerCase();}
    return x<y?-dir:x>y?dir:0;
  });
  const total=rows.length, pages=Math.max(1,Math.ceil(total/ST.pageSize));
  if(ST.page>pages) ST.page=pages;
  if(ST.page<1) ST.page=1;
  const start=(ST.page-1)*ST.pageSize, end=Math.min(start+ST.pageSize,total);
  const pageRows=rows.slice(start,end);
  document.getElementById("head").innerHTML=V.cols.map(c=>{
    const sortState=k===c.k?(dir===1?"ascending":"descending"):"none";
    const glyph=k===c.k?(dir===1?" ▲":" ▼"):" ↕";
    return `<th scope="col" aria-sort="${sortState}"><button type="button" class="th-sort" data-k="${c.k}">${c.t}<span aria-hidden="true">${glyph}</span></button></th>`;
  }).join("");
  document.querySelectorAll("#head .th-sort").forEach(b=>b.onclick=()=>{const kk=b.dataset.k;ST.dir=(ST.sort===kk)?-ST.dir:1;ST.sort=kk;ST.page=1;renderTable();syncURL();});
  document.getElementById("rows").innerHTML = pageRows.length ? pageRows.map(r=>{
    const l=locFor(r);
    const cells=V.cols.map(c=>{
      const attr=c.c?` class="${c.c}"`:(c.n?' style="text-align:right"':"");
      const val=c.h?c.h(r):(c.n?(num(r[c.k])!=null?(+r[c.k]).toLocaleString():""):esc(r[c.k]));
      return `<td${attr}>${val}</td>`;
    }).join("");
    return `<tr data-k="${l.k}" data-we="${esc(l.we)}" data-id="${esc(l.id)}" data-egrid="${esc(l.egrid)}">${cells}</tr>`;
  }).join("")
   : `<tr><td colspan="${V.cols.length}" style="padding:24px;text-align:center;color:var(--gray);background:var(--surface)">No rows match the current filters. <button type="button" class="reset" id="resetf2">Reset filters</button></td></tr>`;
  const r2=document.getElementById("resetf2"); if(r2) r2.onclick=clearFilters;
  // pager — count (left) · page nav (middle) · page size (right); consistent across tabs
  const left = total ? `${(start+1).toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}` : "0 of 0";
  document.getElementById("pager").innerHTML =
    `<span class="pg-left">${left}</span>`+
    `<span class="pg-mid">`+
      `<button id="pgprev" ${ST.page<=1?"disabled":""}>‹ prev</button>`+
      `<span>page ${ST.page} / ${pages}</span>`+
      `<button id="pgnext" ${ST.page>=pages?"disabled":""}>next ›</button>`+
    `</span>`+
    `<span class="pg-right">Rows: <select id="pgsize" aria-label="Rows per page">`+
      PAGE_SIZES.map(s=>`<option value="${s}" ${s===ST.pageSize?"selected":""}>${s}</option>`).join("")+
    `</select></span>`;
  const go=n=>{ST.page=Math.min(pages,Math.max(1,n));renderTable();syncURL();
    const tw=document.querySelector(".tablewrap"); if(tw)tw.scrollTop=0;};
  document.getElementById("pgprev").onclick=()=>go(ST.page-1);
  document.getElementById("pgnext").onclick=()=>go(ST.page+1);
  document.getElementById("pgsize").onchange=e=>{ST.pageSize=+e.target.value;ST.page=1;renderTable();syncURL();};
  updateMap(rows);   // map follows the (full, unpaginated) filtered set
}

function renderAll(){ renderControls(); renderPanel(); renderCards(); renderCharts(); renderFilters(); renderTable(); syncURL(); }

loadURL();
renderAll();
window.addEventListener("hashchange",()=>{loadURL();renderAll();});

// row click → zoom to that element on the map
document.getElementById("rows").addEventListener("click", e=>{
  if(e.target.closest("a")) return;                  // let ↗ links open normally
  const tr=e.target.closest("tr"); if(!tr||!tr.dataset.k) return;
  document.querySelectorAll("#rows tr.sel").forEach(x=>x.classList.remove("sel"));
  tr.classList.add("sel");
  focusOnMap(tr.dataset.k, tr.dataset.we, tr.dataset.id, tr.dataset.egrid);
});

// ---- map (MapLibre GL + grey CARTO Positron basemap) ----
const MAPNOTE = document.getElementById("mapnote");
const OEREB_FIND = "https://api3.geo.admin.ch/rest/services/ech/MapServer/find";
let focusPopup=null;
const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);

function bboxOf(geom){
  let a=180,b=90,c=-180,d=-90;
  const walk=co=>{ if(typeof co[0]==="number"){a=Math.min(a,co[0]);c=Math.max(c,co[0]);b=Math.min(b,co[1]);d=Math.max(d,co[1]);} else co.forEach(walk); };
  if(geom&&geom.coordinates) walk(geom.coordinates);
  return [[a,b],[c,d]];
}
function clearPolygon(){ if(MAP&&MAP.getSource("sel")) MAP.getSource("sel").setData({type:"FeatureCollection",features:[]}); }
async function loadPolygon(egrid){
  if(!MAP||!MAPREADY||!egrid) return;
  try{
    const u = OEREB_FIND+"?"+new URLSearchParams({layer:"ch.swisstopo-vd.stand-oerebkataster",
      searchText:egrid, searchField:"egris_egrid", contains:"false",
      returnGeometry:"true", geometryFormat:"geojson", sr:"4326"});
    const res = ((await (await fetch(u)).json()).results)||[];
    const want = egrid.toUpperCase();
    const hit = res.find(r=>String((r.attributes||r.properties||{}).egris_egrid||"").toUpperCase()===want)||res[0];
    if(!hit||!hit.geometry){ clearPolygon(); return; }
    MAP.getSource("sel").setData({type:"Feature",geometry:hit.geometry,properties:{}});
    MAP.fitBounds(bboxOf(hit.geometry),{padding:60,maxZoom:18,duration:RM?0:600});
  }catch(err){ clearPolygon(); }
}
function focusOnMap(k,we,id,egrid){
  const pt = PT[k+"|"+we+"|"+id];
  if(!pt){ if(MAPNOTE) MAPNOTE.textContent="No map location for this row (not resolved in GWR/ÖREB)."; return; }
  if(!MAP||!MAPREADY) return;
  if(focusPopup) focusPopup.remove();
  focusPopup = new maplibregl.Popup({offset:10}).setLngLat([pt.lon,pt.lat])
    .setHTML(`<b>${k==="p"?"Parcel":"Building"} ${esc(we)} · ${esc(id)}</b><br>${esc(pt.name||"")}`).addTo(MAP);
  MAP.flyTo({center:[pt.lon,pt.lat], zoom:17, duration:RM?0:700});
  if(k==="p" && egrid) loadPolygon(egrid); else clearPolygon();
}

let lastMapSig="";
function fitFeats(feats){
  let a=180,b=90,c=-180,d=-90;
  feats.forEach(f=>{const[x,y]=f.geometry.coordinates;a=Math.min(a,x);c=Math.max(c,x);b=Math.min(b,y);d=Math.max(d,y);});
  if(a<=c) MAP.fitBounds([[a,b],[c,d]],{padding:40,maxZoom:16,duration:RM?0:500});
}
// map follows the current view's filtered rows
function updateMap(rows){
  if(!MAP||!MAPREADY) return;
  const feats=[], seen=new Set();
  rows.forEach(r=>{
    const l=locFor(r), key=l.k+"|"+l.we+"|"+l.id;
    if(seen.has(key)) return;
    const pt=PT[key]; if(!pt) return;
    seen.add(key);
    feats.push({type:"Feature",geometry:{type:"Point",coordinates:[pt.lon,pt.lat]},
      properties:{k:l.k,we:l.we,id:l.id,name:pt.name||"",egrid:pt.egrid||"",far:!!pt.far,label:l.id}});
  });
  MAP.getSource("pts").setData({type:"FeatureCollection",features:feats});
  const conn=DATA.geo.filter(g=>seen.has("p|"+g.we+"|"+g.id)).map(g=>({type:"Feature",
    geometry:{type:"LineString",coordinates:[[g.clon,g.clat],[g.plon,g.plat]]},properties:{}}));
  MAP.getSource("conn").setData({type:"FeatureCollection",features:conn});
  if(MAPNOTE) MAPNOTE.textContent =
    `${feats.length.toLocaleString()} located element(s) in this view · blue = buildings, teal = parcels · click a parcel for its ÖREB polygon`;
  const sig=ST.view+":"+feats.length;
  if(feats.length && sig!==lastMapSig){ lastMapSig=sig; fitFeats(feats); }
}

(function(){
  if(window._nomap || typeof maplibregl==="undefined"){
    document.getElementById("map").style.display="none";
    MAPNOTE.textContent="Map unavailable (needs the MapLibre CDN / internet).";
    return;
  }
  MAP = new maplibregl.Map({container:"map",
    style:"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center:[8.23,46.8], zoom:7});
  MAP.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
  MAP.on("load",()=>{
    MAP.addSource("pts",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    MAP.addSource("conn",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    MAP.addSource("sel",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    MAP.addLayer({id:"conn",type:"line",source:"conn",
      paint:{"line-color":"#596978","line-width":1,"line-dasharray":[2,2],"line-opacity":.5}});
    MAP.addLayer({id:"sel-fill",type:"fill",source:"sel",paint:{"fill-color":"#0d8b96","fill-opacity":.25}});
    MAP.addLayer({id:"sel-line",type:"line",source:"sel",paint:{"line-color":"#0f6b75","line-width":2}});
    MAP.addLayer({id:"buildings",type:"circle",source:"pts",filter:["==",["get","k"],"b"],
      paint:{"circle-color":"#1d4ed8","circle-stroke-color":"#fff","circle-stroke-width":.5,
        "circle-radius":["interpolate",["linear"],["zoom"],6,2,12,4,16,6]}});
    MAP.addLayer({id:"parcels",type:"circle",source:"pts",filter:["==",["get","k"],"p"],
      paint:{"circle-color":"#0d8b96","circle-stroke-color":"#fff",
        "circle-stroke-width":["case",["get","far"],1.5,.5],
        "circle-radius":["interpolate",["linear"],["zoom"],
          6,["case",["get","far"],4,2],12,["case",["get","far"],7,4],16,["case",["get","far"],10,6]]}});
    MAP.addLayer({id:"labels",type:"symbol",source:"pts",minzoom:14,
      layout:{"text-field":["get","label"],"text-size":11,"text-offset":[0,1.1],"text-anchor":"top"},
      paint:{"text-color":"#374151","text-halo-color":"#fff","text-halo-width":1.2}});
    ["buildings","parcels"].forEach(layer=>{
      MAP.on("click",layer,e=>{ const p=e.features[0].properties;
        new maplibregl.Popup({offset:10}).setLngLat(e.lngLat)
          .setHTML(`<b>${p.k==="p"?"Parcel":"Building"} ${esc(p.we)} · ${esc(p.id)}</b><br>${esc(p.name||"")}`).addTo(MAP);
        if(p.k==="p"&&p.egrid) loadPolygon(p.egrid); });
      MAP.on("mouseenter",layer,()=>MAP.getCanvas().style.cursor="pointer");
      MAP.on("mouseleave",layer,()=>MAP.getCanvas().style.cursor="");
    });
    MAPREADY=true;
    renderTable();   // populate the map with the current filtered rows
  });
})();
</script>
</body>
</html>
"""


# ───────────────────────────── console report ────────────────────────────


def report(buildings, parcels, we_rows, findings, threshold) -> None:
    by_cat = defaultdict(int)
    for f in findings:
        by_cat[f["category"]] += 1

    print("\n" + "=" * 70)
    print("  BBL OEREB-CHECK — SUMMARY")
    print("=" * 70)
    print(f"  Buildings: {len(buildings):>5}   "
          f"(CH {sum(1 for b in buildings if b['land']=='CH')}, "
          f"with EGID {sum(1 for b in buildings if b['egid_valid'])}, "
          f"resolved in GWR {sum(1 for b in buildings if b['gwr'])})")
    print(f"  Parcels:   {len(parcels):>5}   "
          f"(with E-GRID {sum(1 for p in parcels if p['egrid_valid'])}, "
          f"resolved in OEREB {sum(1 for p in parcels if p['oereb'])})")
    print(f"  Wirtschaftseinheiten: {len(we_rows)}")

    print("\n  Findings by category:")
    labels = {
        "PARCEL_FAR":           f"parcels > {threshold:g} m from their building cluster",
        "SINGLE_PAIR_FILL":     "single-pair WEs: parcel E-GRID can be auto-filled",
        "SINGLE_PAIR_MISMATCH": "single-pair WEs: parcel E-GRID disagrees with GWR",
        "INVALID_EGRID":        "E-GRIDs not found in OEREB (stale/wrong)",
        "INVALID_EGID":         "EGIDs not found in GWR (stale/wrong)",
        "GWR_EGRID_NOT_IN_SAP": "buildings whose GWR parcel is missing from the WE",
        "MISSING_EGRID":        "parcels with no / zero E-GRID",
        "MISSING_EGID":         "CH buildings with no EGID",
        "NONCH_WITH_EGID":      "non-CH buildings that carry an EGID",
    }
    for cat, label in labels.items():   # dict preserves the display order above
        if by_cat.get(cat):
            print(f"    {by_cat[cat]:>5}  {label}")

    confirmed = sum(1 for w in we_rows if w["single_pair_status"] == "confirmed")
    if confirmed:
        print(f"\n  {confirmed} single-pair WEs confirmed correct (E-GRID matches GWR)")

    far = sorted([f for f in findings if f["category"] == "PARCEL_FAR"],
                 key=lambda r: -r["distance_m"])
    if far:
        print(f"\n  Top parcels 'way off' (WE / SAP-id / distance / location):")
        for f in far[:15]:
            print(f"    WE {f['we']:<6} parcel {f['sap_id']:<4} "
                  f"{f['distance_m']:>8} m   {f['ort']}")


# ───────────────────────────── main ──────────────────────────────────────


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # avoid console codepage errors
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="Validate BBL SAP EGID/E-GRID keys against swisstopo.")
    ap.add_argument("--data-dir", default=DATA_DIR, help="folder with the two SAP .txt exports")
    ap.add_argument("--gebaeude", default=None, help="explicit path to the Gebaeude export")
    ap.add_argument("--grundstuecke", default=None, help="explicit path to the Grundstuecke export")
    ap.add_argument("--out", default=None, help="output folder (default: the data-dir itself)")
    ap.add_argument("--threshold", type=float, default=DISTANCE_THRESHOLD,
                    help="metres; parcel farther than this from its WE cluster is flagged")
    ap.add_argument("--we", default="", help="comma-separated Wirtschaftseinheiten to limit to")
    ap.add_argument("--workers", type=int, default=MAX_WORKERS,
                    help=f"concurrent API requests (default {MAX_WORKERS})")
    ap.add_argument("--offline", action="store_true", help="analyse from cache only, no network")
    args = ap.parse_args()

    geb_path = args.gebaeude or find_report(args.data_dir, ["geb"], "gebaeude")
    gst_path = args.grundstuecke or find_report(args.data_dir, ["grundst"], "grundstuecke")
    out_dir = args.out or args.data_dir

    print("Parsing SAP reports ...")
    print(f"  buildings: {geb_path}")
    print(f"  parcels:   {gst_path}")
    buildings = parse_sap_report(geb_path, BUILDING_COLS)
    parcels = parse_sap_report(gst_path, PARCEL_COLS)
    print(f"  {len(buildings)} buildings, {len(parcels)} parcels")

    if args.we:
        wanted = {w.strip() for w in args.we.split(",") if w.strip()}
        buildings = [b for b in buildings if b["we"] in wanted]
        parcels = [p for p in parcels if p["we"] in wanted]
        print(f"  limited to WE {sorted(wanted)}: "
              f"{len(buildings)} buildings, {len(parcels)} parcels")

    egids = {b["egid"] for b in buildings if valid_egid(b["egid"])}
    egrids = {p["egrid"] for p in parcels if valid_egrid(p["egrid"])}

    client = GeoAdmin(os.path.join(out_dir,"api_cache.json"), offline=args.offline)
    if not args.offline:
        print("Querying swisstopo (GWR + OEREB) ...")
        fetch_all(client, egids, egrids, args.workers)
    else:
        print("Offline mode: using cached API responses only")

    print("Analysing ...")
    buildings, parcels, we_rows, findings = analyse(buildings, parcels, client, args.threshold)

    b_fields = ["bukr", "we", "id", "name", "land", "kanton", "ort", "plz",
                "strasse", "hausnr", "egid", "egid_status", "gwr_egrid",
                "gwr_egrid_in_sap_we", "gwr_gemeinde", "gwr_kanton", "gwr_gstat",
                "gwr_e", "gwr_n", "maps_url"]
    p_fields = ["bukr", "we", "id", "name", "land", "kanton", "ort", "plz",
                "egrid", "egrid_status", "egrid_matches_building", "oereb_gemeinde",
                "oereb_kanton", "oereb_status", "parcel_e", "parcel_n", "sap_koord",
                "we_center_source", "we_center_e", "we_center_n",
                "dist_to_we_center_m", "far_flag", "maps_url"]
    we_fields = ["we", "n_buildings", "n_buildings_ch", "n_buildings_with_egid",
                 "n_buildings_resolved", "n_parcels", "n_parcels_with_egrid",
                 "n_parcels_resolved", "n_parcels_far", "max_parcel_dist_m",
                 "center_source", "n_gwr_egrids", "n_missing_parcels",
                 "missing_parcel_egrids", "is_single_pair", "single_pair_status",
                 "single_pair_suggested_egrid"]
    f_fields = ["severity", "category", "we", "kind", "sap_id", "name", "key",
                "detail", "suggested_egrid", "distance_m", "gemeinde", "ort", "land", "kanton"]

    write_csv(os.path.join(out_dir,"buildings_enriched.csv"),
              [flatten_building(b) for b in buildings], b_fields)
    write_csv(os.path.join(out_dir,"parcels_enriched.csv"),
              [flatten_parcel(p) for p in parcels], p_fields)
    write_csv(os.path.join(out_dir,"we_summary.csv"), we_rows, we_fields)
    write_csv(os.path.join(out_dir,"findings.csv"), findings, f_fields)
    write_html_report(os.path.join(out_dir, "report.html"), buildings, parcels,
                      we_rows, findings, args.threshold,
                      {"gebaeude": geb_path, "grundstuecke": gst_path})

    report(buildings, parcels, we_rows, findings, args.threshold)
    print(f"\n  Output written to: {out_dir}")
    print("    findings.csv, report.html, buildings_enriched.csv, "
          "parcels_enriched.csv, we_summary.csv")


if __name__ == "__main__":
    main()
