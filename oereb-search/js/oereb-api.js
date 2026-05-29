/* ── Shared ÖREB API + geometry helpers ──────────────────────────────────
   Side-effect-free module used by both the search mask (app.js) and the
   batch CSV mode (batch.js). Single source of truth for the swisstopo
   endpoints, fetch plumbing, area math, and the LV95→WGS84 reprojection. */

export const API_BASE = "https://api3.geo.admin.ch/rest/services/ech/MapServer";
export const LAYER = "ch.swisstopo-vd.stand-oerebkataster";
export const FETCH_TIMEOUT = 10_000; // 10s

// i18n status field mapping (per UI language)
export const STATUS_FIELD = { de: "oereb_status_de", fr: "oereb_status_fr", it: "oereb_status_it" };

// ── Fetch with timeout (single attempt) ──
// Used by the interactive search mask, where one slow request just fails.
export function fetchWithTimeout(url, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  // If an external signal is provided, forward its abort
  if (signal) {
    if (signal.aborted) { controller.abort(); clearTimeout(timeout); }
    else signal.addEventListener("abort", () => { controller.abort(); clearTimeout(timeout); });
  }

  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

// ── Fetch with timeout + retry (exponential backoff) ──
// Used by batch mode, which hits the API many times: retries on 429/5xx and
// network/timeout errors, honours `Retry-After`, and propagates an external
// abort (the user's Cancel button) without retrying.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, { signal, retries = 3, timeout = FETCH_TIMEOUT, baseDelay = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);

      if (resp.ok) return resp;

      if (resp.status === 429 || resp.status >= 500) {
        const retryAfter = resp.headers.get("Retry-After");
        const delay = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
          : baseDelay * 2 ** attempt;
        lastError = new Error(`HTTP ${resp.status}`);
        if (attempt < retries) { await sleep(delay); continue; }
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (signal?.aborted) throw err; // external cancel → propagate, don't retry
      lastError = err.name === "AbortError" ? new Error("Request timeout") : err;
      if (attempt < retries) { await sleep(baseDelay * 2 ** attempt); continue; }
    }
  }
  throw lastError;
}

// ── Exact lookup by EGRID, geometry included (one request) ──
// Returns a normalized { attributes, geometry, featureId } in LV95 (EPSG:2056)
// so callers can shoelace the area, or null if not found. Note: with
// `geometryFormat=geojson` the find service nests fields under `properties`
// (not `attributes`), so we normalize both shapes here.
export async function findByEgrid(egrid, { signal } = {}) {
  const params = new URLSearchParams({
    layer: LAYER,
    searchText: egrid,
    searchField: "egris_egrid",
    contains: "false", // exact match
    returnGeometry: "true",
    geometryFormat: "geojson",
    sr: "2056",
  });

  const resp = await fetchWithRetry(`${API_BASE}/find?${params}`, { signal });
  const data = await resp.json();
  const results = data.results || [];
  if (!results.length) return null;

  const attrsOf = (r) => r.attributes || r.properties || {};

  // `contains=false` already constrains to exact, but guard against partial
  // matches by preferring the result whose EGRID equals the query.
  const want = egrid.trim().toUpperCase();
  const match = results.find((r) => (attrsOf(r).egris_egrid || "").toUpperCase() === want) || results[0];

  return { attributes: attrsOf(match), geometry: match.geometry || null, featureId: match.featureId };
}

// ── ÖREB status → active? (locale-aware) ──
export function isStatusActive(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("eingeführt") || s.includes("introduit") || s.includes("introdotto");
}

// ── Area calculation ──

/**
 * Compute 2D area of a GeoJSON Polygon/MultiPolygon using the shoelace formula.
 * Expects coordinates in a projected CRS (LV95 / EPSG:2056) so units are meters.
 * Returns area in m², or null if geometry is missing.
 */
export function computeArea(geometry) {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === "Polygon") {
    return polygonArea(coordinates);
  }
  if (type === "MultiPolygon") {
    return coordinates.reduce((sum, poly) => sum + polygonArea(poly), 0);
  }
  return null;
}

/** Shoelace area for a polygon (outer ring minus holes). */
export function polygonArea(rings) {
  let area = ringArea(rings[0]); // outer ring
  for (let i = 1; i < rings.length; i++) {
    area -= ringArea(rings[i]);  // subtract holes
  }
  return Math.abs(area);
}

/** Shoelace formula for a single ring. */
function ringArea(coords) {
  let sum = 0;
  for (let i = 0, n = coords.length; i < n; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// ── Reprojection: LV95 (EPSG:2056) → WGS84 (EPSG:4326) ────────────────────
// swisstopo's official approximate formula (CH1903+/LV95 → WGS84), accurate to
// a few cm — fine for the GeoJSON export, while the area above stays exact
// because it is computed on the native LV95 coordinates before reprojection.
// https://www.swisstopo.admin.ch/en/coordinates-and-grids#Documents

/** Convert a single [E, N] LV95 coordinate to [lng, lat] WGS84. */
export function lv95ToWgs84([E, N]) {
  // Auxiliary values (LV95 → LV03 false-origin offsets, then scaled)
  const y = (E - 2_600_000) / 1_000_000;
  const x = (N - 1_200_000) / 1_000_000;

  const lng =
    2.6779094 +
    4.728982 * y +
    0.791484 * y * x +
    0.1306 * y * x * x -
    0.0436 * y * y * y;

  const lat =
    16.9023892 +
    3.238272 * x -
    0.270978 * y * y -
    0.002528 * x * x -
    0.0447 * y * y * x -
    0.0140 * x * x * x;

  // Results are in units of 10000"; convert to decimal degrees.
  return [(lng * 100) / 36, (lat * 100) / 36];
}

/** Deep-map a GeoJSON geometry's coordinates through `fn` (e.g. lv95ToWgs84). */
export function reprojectGeometry(geom, fn) {
  if (!geom || !geom.coordinates) return null;
  const map = (c) => (typeof c[0] === "number" ? fn(c) : c.map(map));
  return { type: geom.type, coordinates: map(geom.coordinates) };
}

// ── HTML escape (shared by both renderers) ──
export function esc(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}
