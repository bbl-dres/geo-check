/**
 * GWR API calls, batching, and match scoring.
 * Rows use canonical field names (internal_id, egid, street, etc.) directly.
 */
import { stringSimilarity, haversineMeters } from "./utils.js";

const GWR_API = "https://api3.geo.admin.ch/rest/services/ech/MapServer/find";
const BATCH_DELAY = 100;
const MAX_CONCURRENT = 5;

let cancelled = false;

/**
 * Process all rows: look up EGID in GWR, compute match scores.
 */
export async function processRows(rows, onProgress) {
  cancelled = false;
  const results = [];
  let matched = 0, notFound = 0, skipped = 0;
  let processed = 0;

  for (let i = 0; i < rows.length; i += MAX_CONCURRENT) {
    if (cancelled) break;
    const batch = rows.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(batch.map(processOne));

    for (const result of batchResults) {
      results.push(result);
      processed++;
      if (result.gwr_match === "matched") matched++;
      else if (result.gwr_match === "not_found") notFound++;
      else skipped++;
    }

    onProgress({ processed, total: rows.length, matched, notFound, skipped });

    if (i + MAX_CONCURRENT < rows.length && !cancelled) {
      await sleep(BATCH_DELAY);
    }
  }

  return results;
}

export function cancelProcessing() {
  cancelled = true;
}

async function processOne(row) {
  const result = { ...row };
  const egidRaw = val(row, "egid");

  if (!egidRaw || !/^\d+$/.test(egidRaw)) {
    setGwrEmpty(result);
    result.gwr_match = "skipped";
    result.match_score = "";
    return result;
  }

  try {
    const gwrData = await lookupEgid(egidRaw);
    if (!gwrData) {
      setGwrEmpty(result);
      result.gwr_match = "not_found";
      result.match_score = 0;
      return result;
    }

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
    result.gwr_match = "matched";

    computeMatchScore(result, row);
    return result;
  } catch (err) {
    console.error(`GWR lookup failed for EGID ${egidRaw}:`, err);
    setGwrEmpty(result);
    result.gwr_match = "not_found";
    result.match_score = 0;
    return result;
  }
}

async function lookupEgid(egid) {
  const params = new URLSearchParams({
    layer: "ch.bfs.gebaeude_wohnungs_register",
    searchText: egid,
    searchField: "egid",
    returnGeometry: "true",
    contains: "false",
    sr: "4326"
  });

  const resp = await fetch(`${GWR_API}?${params}`);
  if (!resp.ok) return null;

  let data;
  try {
    data = await resp.json();
  } catch {
    return null;
  }
  if (!data.results || data.results.length === 0) return null;
  return data.results[0];
}

function setGwrEmpty(result) {
  const fields = [
    "gwr_egid", "gwr_egrid", "gwr_street", "gwr_street_number",
    "gwr_zip", "gwr_city", "gwr_municipality", "gwr_municipality_nr",
    "gwr_region", "gwr_building_type", "gwr_building_class", "gwr_status",
    "gwr_year_built", "gwr_construction_period", "gwr_area", "gwr_floors",
    "gwr_dwellings", "gwr_latitude", "gwr_longitude",
    "gwr_coord_e", "gwr_coord_n", "gwr_coord_source",
    "gwr_demolition_year", "gwr_plot_nr", "gwr_building_name",
    "gwr_heating_type", "gwr_heating_energy",
    "gwr_hot_water_type", "gwr_hot_water_energy"
  ];
  for (const f of fields) result[f] = "";
  result.match_street = "";
  result.match_street_number = "";
  result.match_zip = "";
  result.match_city = "";
  result.match_region = "";
  result.match_building_type = "";
  result.match_coordinates = "";
}

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
