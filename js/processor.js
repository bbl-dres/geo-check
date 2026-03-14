/**
 * GWR API calls, batching, and match scoring.
 * Uses the feature endpoint with batch lookups and EGID caching.
 *
 * Batch strategy:
 *   1. Collect unique EGIDs per batch (up to BATCH_SIZE)
 *   2. Try the multi-feature endpoint (single HTTP request for all)
 *   3. If it 404s (one or more missing), fall back to individual requests
 *   4. Cache all results so duplicate EGIDs skip the network entirely
 */
import { stringSimilarity, haversineMeters } from "./utils.js";

const GWR_FEATURE_API = "https://api3.geo.admin.ch/rest/services/api/MapServer/ch.bfs.gebaeude_wohnungs_register";
const BATCH_SIZE = 50;
const BATCH_DELAY = 300;      // ms between batches — keeps us well within fair use
const FALLBACK_CONCURRENT = 5; // concurrency limit for individual fallback requests

let cancelled = false;

/** EGID → feature data (or null for not found). Cleared each run. */
const egidCache = new Map();

/** Frozen template for empty GWR fields — spread instead of iterating */
const GWR_EMPTY = Object.freeze({
  gwr_egid: "", gwr_egrid: "", gwr_street: "", gwr_street_number: "",
  gwr_zip: "", gwr_city: "", gwr_municipality: "", gwr_municipality_nr: "",
  gwr_region: "", gwr_building_type: "", gwr_building_class: "", gwr_status: "",
  gwr_year_built: "", gwr_construction_period: "", gwr_area: "", gwr_floors: "",
  gwr_dwellings: "", gwr_latitude: "", gwr_longitude: "",
  gwr_coord_e: "", gwr_coord_n: "", gwr_coord_source: "",
  gwr_demolition_year: "", gwr_plot_nr: "", gwr_building_name: "",
  gwr_heating_type: "", gwr_heating_energy: "",
  gwr_hot_water_type: "", gwr_hot_water_energy: "",
  match_street: "", match_street_number: "", match_zip: "", match_city: "",
  match_region: "", match_building_type: "", match_coordinates: "",
});

/**
 * Process all rows: look up EGIDs in GWR (batched), compute match scores.
 */
export async function processRows(rows, onProgress) {
  cancelled = false;
  egidCache.clear();

  const results = [];
  let matched = 0, notFound = 0, skipped = 0;
  let processed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    if (cancelled) break;
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Partition: rows with valid EGIDs vs rows to skip
    const toSkip = [];
    const toLookup = [];
    for (const row of batch) {
      const egidRaw = val(row, "egid");
      if (!egidRaw || !/^\d+$/.test(egidRaw)) {
        toSkip.push(row);
      } else {
        toLookup.push({ row, egid: egidRaw });
      }
    }

    // Handle skipped rows (no valid EGID)
    for (const row of toSkip) {
      const result = { ...row, ...GWR_EMPTY, gwr_match: "skipped", match_score: "" };
      results.push(result);
      processed++;
      skipped++;
    }

    // Batch-lookup unique uncached EGIDs
    const uniqueEgids = [...new Set(toLookup.map((r) => r.egid))];
    const uncached = uniqueEgids.filter((e) => !egidCache.has(e));
    if (uncached.length > 0) {
      await batchLookup(uncached);
    }

    // Build results from cache
    for (const { row, egid } of toLookup) {
      const gwrData = egidCache.get(egid);
      const result = { ...row };

      if (!gwrData) {
        Object.assign(result, GWR_EMPTY);
        result.gwr_match = "not_found";
        result.match_score = 0;
        notFound++;
      } else {
        mapGwrAttributes(result, gwrData);
        result.gwr_match = "matched";
        computeMatchScore(result, row);
        matched++;
      }

      results.push(result);
      processed++;
    }

    onProgress({ processed, total: rows.length, matched, notFound, skipped });

    if (i + BATCH_SIZE < rows.length && !cancelled) {
      await sleep(BATCH_DELAY);
    }
  }

  return results;
}

export function cancelProcessing() {
  cancelled = true;
}

/* ── API lookup ── */

/**
 * Look up a list of EGIDs using the batch feature endpoint.
 * Falls back to individual requests if the batch returns 404
 * (which happens when any single EGID doesn't exist).
 */
async function batchLookup(egids) {
  // Try batch endpoint: single HTTP request for all EGIDs
  const featureIds = egids.map((e) => `${e}_0`).join(",");
  try {
    const resp = await fetch(`${GWR_FEATURE_API}/${featureIds}?returnGeometry=true&sr=4326`);
    if (resp.ok) {
      const data = await resp.json();
      // Single: { feature: {...} }  Multi: { type: "FeatureCollection", features: [...] }
      const features = data.features || (data.feature ? [data.feature] : []);
      for (const f of features) {
        egidCache.set(String(f.attributes.egid), f);
      }
      // Mark any EGIDs absent from the response as not found
      for (const egid of egids) {
        if (!egidCache.has(egid)) egidCache.set(egid, null);
      }
      return;
    }
    // 404 or other HTTP error — fall through to individual lookups
  } catch {
    // Network error — fall through
  }

  // Fallback: individual feature requests with concurrency limit
  for (let j = 0; j < egids.length; j += FALLBACK_CONCURRENT) {
    if (cancelled) break;
    const chunk = egids.slice(j, j + FALLBACK_CONCURRENT);
    await Promise.all(chunk.map(async (egid) => {
      if (egidCache.has(egid)) return;
      try {
        const resp = await fetch(`${GWR_FEATURE_API}/${egid}_0?returnGeometry=true&sr=4326`);
        if (resp.ok) {
          const data = await resp.json();
          egidCache.set(egid, data.feature || null);
        } else {
          egidCache.set(egid, null);
        }
      } catch {
        egidCache.set(egid, null);
      }
    }));
  }
}

/* ── Attribute mapping ── */

/** Map GWR API feature attributes onto the result row */
function mapGwrAttributes(result, gwrData) {
  const attr = gwrData.attributes;
  result.gwr_egid = String(attr.egid ?? "");
  result.gwr_egrid = attr.egrid || "";
  result.gwr_street = Array.isArray(attr.strname) ? attr.strname[0] || "" : String(attr.strname ?? "");
  result.gwr_street_number = String(attr.deinr ?? "");
  result.gwr_zip = String(attr.dplz4 ?? "");
  result.gwr_city = attr.dplzname || "";
  result.gwr_municipality = attr.ggdename || "";
  result.gwr_municipality_nr = String(attr.ggdenr ?? "");
  result.gwr_region = attr.gdekt || "";
  result.gwr_building_type = String(attr.gkat ?? "");
  result.gwr_building_class = String(attr.gklas ?? "");
  result.gwr_status = String(attr.gstat ?? "");
  result.gwr_year_built = String(attr.gbauj ?? "");
  result.gwr_construction_period = String(attr.gbaup ?? "");
  result.gwr_area = String(attr.garea ?? "");
  result.gwr_floors = String(attr.gastw ?? "");
  result.gwr_dwellings = String(attr.ganzwhg ?? "");
  result.gwr_latitude = gwrData.geometry ? String(gwrData.geometry.y) : "";
  result.gwr_longitude = gwrData.geometry ? String(gwrData.geometry.x) : "";
  result.gwr_coord_e = String(attr.gkode ?? "");
  result.gwr_coord_n = String(attr.gkodn ?? "");
  result.gwr_coord_source = String(attr.gksce ?? "");
  result.gwr_demolition_year = String(attr.gabbj ?? "");
  result.gwr_plot_nr = String(attr.lparz ?? "");
  result.gwr_building_name = attr.gbez || "";
  result.gwr_heating_type = String(attr.gwaerzh1 ?? "");
  result.gwr_heating_energy = String(attr.genh1 ?? "");
  result.gwr_hot_water_type = String(attr.gwaerzw1 ?? "");
  result.gwr_hot_water_energy = String(attr.genw1 ?? "");
}

/* ── Match scoring ── */

function computeMatchScore(result, inputRow) {
  const comparisons = [
    { field: "street", weight: 20, type: "similarity" },
    { field: "street_number", weight: 10, type: "exact" },
    { field: "zip", weight: 15, type: "exact" },
    { field: "city", weight: 15, type: "similarity" },
    { field: "region", weight: 10, type: "exact_ci" },
    { field: "building_type", weight: 10, type: "exact" },
    { field: "coordinates", weight: 20, type: "distance" }
  ];

  let totalWeight = 0;
  let weightedScore = 0;

  for (const comp of comparisons) {
    if (comp.type === "distance") {
      const inputLat = parseFloat(val(inputRow, "latitude"));
      const inputLon = parseFloat(val(inputRow, "longitude"));
      const gwrLat = parseFloat(result.gwr_latitude);
      const gwrLon = parseFloat(result.gwr_longitude);

      if (isNaN(inputLat) || isNaN(inputLon) || isNaN(gwrLat) || isNaN(gwrLon)) {
        result.match_coordinates = "empty";
        continue;
      }

      const dist = haversineMeters(inputLat, inputLon, gwrLat, gwrLon);
      let score;
      if (dist < 50) score = 1;
      else if (dist > 500) score = 0;
      else score = 1 - (dist - 50) / 450;

      totalWeight += comp.weight;
      weightedScore += score * comp.weight;
      result.match_coordinates = dist < 50 ? "exact" : dist < 200 ? "similar" : "mismatch";
    } else {
      const inputVal = val(inputRow, comp.field);
      const gwrVal = result[`gwr_${comp.field}`] || "";

      if (!inputVal) {
        result[`match_${comp.field}`] = "empty";
        continue;
      }

      totalWeight += comp.weight;
      let score;

      if (comp.type === "exact") {
        score = String(inputVal) === String(gwrVal).trim() ? 1 : 0;
        result[`match_${comp.field}`] = score === 1 ? "exact" : "mismatch";
      } else if (comp.type === "exact_ci") {
        score = String(inputVal).toLowerCase() === String(gwrVal).trim().toLowerCase() ? 1 : 0;
        result[`match_${comp.field}`] = score === 1 ? "exact" : "mismatch";
      } else {
        score = stringSimilarity(inputVal, gwrVal);
        result[`match_${comp.field}`] = score === 1 ? "exact" : score >= 0.7 ? "similar" : "mismatch";
      }

      weightedScore += score * comp.weight;
    }
  }

  result.match_score = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : "";
}

/** Read a field from a row (canonical field name, already lowercase) */
function val(row, field) {
  return String(row[field] ?? "").trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
