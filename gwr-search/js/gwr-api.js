/* ── Shared GWR API + geometry helpers ─────────────────────────────────────
   Side-effect-free module used by both the search mask (app.js) and the batch
   CSV mode (batch.js). Single source of truth for the swisstopo endpoint, the
   fetch plumbing, and the LV95→WGS84 reprojection.

   GWR features are POINTS (one per building entrance), so — unlike the sibling
   ÖREB tool — `find` returns the geometry inline and there is no polygon area
   to compute: the building footprint is the `garea` attribute. */

export const API_BASE = "https://api3.geo.admin.ch/rest/services/ech/MapServer";
export const LAYER = "ch.bfs.gebaeude_wohnungs_register";
export const FETCH_TIMEOUT = 10_000; // 10s

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

// ── Normalize a `find` point geometry to [E, N] (LV95) ──
// The MapServer `find` op returns Esri-style `{ x, y }`; guard for the GeoJSON
// `{ coordinates: [...] }` shape too, so the rest of the code only sees [E, N].
export function normalizePoint(geometry) {
  if (!geometry) return null;
  if (typeof geometry.x === "number") return [geometry.x, geometry.y];
  if (Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return null;
}

// ── Exact lookup by EGID, geometry included (one request) ──
// Returns a normalized { attributes, geometry: [E,N] | null, featureId } in
// LV95 (EPSG:2056), or null if not found. A building can have several entrance
// features (`{egid}_0`, `{egid}_1`, …); we prefer the main `_0` feature.
export async function findByEgid(egid, { signal } = {}) {
  const params = new URLSearchParams({
    layer: LAYER,
    searchText: String(egid).trim(),
    searchField: "egid",
    contains: "false", // exact match
    returnGeometry: "true",
    sr: "2056",
  });

  const resp = await fetchWithRetry(`${API_BASE}/find?${params}`, { signal });
  const data = await resp.json();
  const results = data.results || [];
  if (!results.length) return null;

  const want = String(egid).trim();
  const exact = results.filter((r) => String((r.attributes || {}).egid) === want);
  const pool = exact.length ? exact : results;
  const match = pool.find((r) => String(r.featureId ?? r.id).endsWith("_0")) || pool[0];

  return {
    attributes: match.attributes || {},
    geometry: normalizePoint(match.geometry),
    featureId: match.featureId ?? match.id,
  };
}

// ── Building status → "existing"? ──
// GSTAT 1004 = "Gebäude bestehend" — the everyday "this building exists" case.
export function isExisting(gstat) {
  return String(gstat) === "1004";
}

// ── Reprojection: LV95 (EPSG:2056) → WGS84 (EPSG:4326) ────────────────────
// swisstopo's official approximate formula (CH1903+/LV95 → WGS84), accurate to
// a few cm — fine for the GeoJSON export.
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

/** Build a GeoJSON Point (WGS84) from an LV95 [E, N], or null. */
export function pointToWgs84GeoJSON(en) {
  if (!en) return null;
  return { type: "Point", coordinates: lv95ToWgs84(en) };
}

// ── HTML escape (shared by both renderers) ──
export function esc(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}
