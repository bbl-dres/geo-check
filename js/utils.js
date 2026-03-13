/**
 * String similarity and helper utilities
 */

/** Levenshtein distance between two strings */
export function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/** Normalized string similarity (0–1) using Levenshtein */
export function stringSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/** Normalize address string for comparison */
export function normalizeAddress(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/strasse/g, "str.")
    .replace(/straße/g, "str.")
    .replace(/gasse/g, "g.")
    .replace(/\s+/g, " ");
}

/** Haversine distance in meters between two WGS84 points */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

/** Format a number with locale grouping */
export function formatNumber(n) {
  return Number(n).toLocaleString("de-CH");
}

/** Score color class based on match score */
export function scoreClass(score) {
  if (score == null) return "score-none";
  if (score >= 80) return "score-good";
  if (score >= 50) return "score-partial";
  return "score-poor";
}

/** Confidence label from match score */
export function confidenceLabel(score) {
  if (score == null || score === "") return "—";
  const n = Number(score);
  if (n >= 80) return "Hoch";
  if (n >= 50) return "Mittel";
  return "Tief";
}

/** Read a CSS custom property from :root */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Score color for map markers (reads from CSS tokens) */
export function scoreColor(score) {
  if (score == null) return cssVar("--color-none") || "#9ca3af";
  if (score >= 80) return cssVar("--color-good") || "#22c55e";
  if (score >= 50) return cssVar("--color-partial") || "#eab308";
  return cssVar("--color-poor") || "#ef4444";
}
