/**
 * Export: CSV, XLSX, GeoJSON
 */
import { t } from "./i18n.js";

/**
 * Download processed results as CSV (semicolon-delimited, UTF-8 BOM)
 */
export function downloadCSV(results, filename = "geo-check-results.csv") {
  if (!results.length) return;
  const headers = Object.keys(results[0]).filter((k) => !k.startsWith("_"));
  const BOM = "\uFEFF";
  const lines = [headers.join(";")];

  for (const row of results) {
    const vals = headers.map((h) => {
      const v = String(row[h] ?? "").replace(/"/g, '""');
      return v.includes(";") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
    });
    lines.push(vals.join(";"));
  }

  const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  saveBlob(blob, filename);
}

/**
 * Download processed results as Excel (.xlsx)
 */
export async function downloadXLSX(results, filename = "geo-check-results.xlsx") {
  if (!results.length) return;
  try {
    await ensureXLSX();
  } catch {
    alert(t("export.xlsxError"));
    return;
  }

  const headers = Object.keys(results[0]).filter((k) => !k.startsWith("_"));
  const data = results.map((row) => {
    const obj = {};
    for (const h of headers) obj[h] = row[h] ?? "";
    return obj;
  });

  const wb = XLSX.utils.book_new();

  // Sheet 1: Results
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Results");

  // Sheet 2: Summary
  const stats = computeStats(results);
  const summaryData = [
    { [t("export.colMetric")]: t("export.statTotal"), [t("export.colValue")]: stats.total },
    { [t("export.colMetric")]: t("export.statFound"), [t("export.colValue")]: stats.matched },
    { [t("export.colMetric")]: t("export.statNotFound"), [t("export.colValue")]: stats.notFound },
    { [t("export.colMetric")]: t("export.statSkipped"), [t("export.colValue")]: stats.skipped },
    { [t("export.colMetric")]: t("export.statAvgScore"), [t("export.colValue")]: stats.avgScore + "%" },
    { [t("export.colMetric")]: t("export.statHigh"), [t("export.colValue")]: stats.good },
    { [t("export.colMetric")]: t("export.statMedium"), [t("export.colValue")]: stats.partial },
    { [t("export.colMetric")]: t("export.statLow"), [t("export.colValue")]: stats.poor }
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws2, t("export.summarySheet"));

  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveBlob(blob, filename);
}

/**
 * Download as GeoJSON
 */
export function downloadGeoJSON(results, filename = "geo-check-results.geojson") {
  const features = [];
  for (const row of results) {
    const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude);
    const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;

    const props = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k.startsWith("_")) props[k] = v;
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: props
    });
  }

  const geojson = { type: "FeatureCollection", features };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
  saveBlob(blob, filename);
}


function computeStats(results) {
  let matched = 0, notFound = 0, skipped = 0, good = 0, partial = 0, poor = 0;
  let scoreSum = 0, scoreCount = 0;

  for (const r of results) {
    if (r.gwr_match === "matched") matched++;
    else if (r.gwr_match === "not_found") notFound++;
    else skipped++;

    if (r.match_score !== "" && r.match_score != null) {
      const s = Number(r.match_score);
      scoreSum += s;
      scoreCount++;
      if (s >= 80) good++;
      else if (s >= 50) partial++;
      else poor++;
    }
  }

  return {
    total: results.length,
    matched,
    notFound,
    skipped,
    avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
    good,
    partial,
    poor
  };
}

function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function ensureXLSX() {
  if (window.XLSX) return;
  await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
