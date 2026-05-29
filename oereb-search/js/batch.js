/* ── Batch CSV mode ────────────────────────────────────────────────────────
   Upload a CSV → look up each EGRID against the ÖREB layer → the FOUND parcels
   render in the SHARED results/detail panels (identical to the search mask;
   it's the same view, just a different input method) → download CSV / GeoJSON.

   The downloads preserve every input column with an `IN_` prefix and every
   looked-up field with an `OUT_` prefix, so no joins are needed downstream. */

import { getLang, t } from "./i18n.js";
import {
  STATUS_FIELD, findByEgrid, isStatusActive, computeArea,
  reprojectGeometry, lv95ToWgs84, esc,
} from "./oereb-api.js";
import { parseCSV, downloadCSV, downloadGeoJSON } from "./csv.js";

const CONCURRENCY = 5;
const LARGE_FILE = 1000;       // soft warning threshold
const DEMO_URL = "examples/oereb-beispiel.csv";
const EGRID_RE = /^CH[0-9A-Za-z]{12}$/;

// Fixed OUT_ column set + order (full set per the plan) — used in the downloads.
const OUT_COLUMNS = [
  "OUT_RESULT", "OUT_MESSAGE", "OUT_EGRID", "OUT_NUMMER", "OUT_GEMEINDE",
  "OUT_BFS_NR", "OUT_KANTON", "OUT_PLZ", "OUT_ORT", "OUT_ART",
  "OUT_FLAECHE_M2", "OUT_OEREB_STATUS", "OUT_OEREB_AKTIV",
  "OUT_EMAIL", "OUT_TELEFON", "OUT_EXTRACT_PDF", "OUT_EXTRACT_URL",
  "OUT_GEOPORTAL", "OUT_WEBSERVICE",
];

// ── State ──
let parsed = null;        // { headers, rows, delimiter }
let fileName = "";
let egridCol = "";        // chosen input column holding the EGRID
let results = [];         // full IN_/OUT_ rows (+ hidden _geometry/_feature) for download
let columns = [];         // [IN_*, ...OUT_COLUMNS]
let viewResults = [];     // found parcels { featureId, attributes } for the shared view
let lastSummary = "";
let batchState = "upload";
let cancelled = false;
let abortController = null;
let deps = {};            // { showResults, clearResults } injected by app.js
let lastFocused = null;   // element to restore focus to when the modal closes

// ── DOM refs (resolved in initBatch) ──
let el = {};

export function initBatch(hooks) {
  deps = hooks || {};
  el = {
    upload: document.getElementById("batch-upload"),
    mapping: document.getElementById("batch-mapping"),
    processing: document.getElementById("batch-processing"),
    done: document.getElementById("batch-done"),
    dropzone: document.getElementById("batch-dropzone"),
    fileInput: document.getElementById("batch-file-input"),
    error: document.getElementById("batch-error"),
    demoRun: document.getElementById("batch-demo-run"),
    fileChip: document.getElementById("batch-file-chip"),
    fileNameEl: document.getElementById("batch-file-name"),
    fileClear: document.getElementById("batch-file-clear"),
    mappingInfo: document.getElementById("batch-mapping-info"),
    mappingColumns: document.getElementById("batch-mapping-columns"),
    egridSelect: document.getElementById("batch-egrid-col"),
    processBtn: document.getElementById("batch-process"),
    mappingBack: document.getElementById("batch-mapping-back"),
    progressBar: document.getElementById("batch-progressbar"),
    progressFill: document.getElementById("batch-progress-fill"),
    progressCount: document.getElementById("batch-progress-count"),
    cancelBtn: document.getElementById("batch-cancel"),
    dlCsv: document.getElementById("batch-dl-csv"),
    dlGeojson: document.getElementById("batch-dl-geojson"),
    downloadBtn: document.getElementById("results-download"),
    modal: document.getElementById("download-modal"),
    modalClose: document.getElementById("download-modal-close"),
  };

  // Drag & drop + picker (the whole zone is the button — no separate browse btn)
  el.dropzone.addEventListener("click", () => el.fileInput.click());
  el.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.fileInput.click(); }
  });
  el.dropzone.addEventListener("dragover", (e) => { e.preventDefault(); el.dropzone.classList.add("drag-over"); });
  el.dropzone.addEventListener("dragleave", () => el.dropzone.classList.remove("drag-over"));
  el.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    el.dropzone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  el.fileInput.addEventListener("change", () => {
    if (el.fileInput.files.length) handleFile(el.fileInput.files[0]);
  });

  // The "download sample" link is a native <a download>; this one loads + runs.
  el.demoRun.addEventListener("click", onDemoRun);

  // Flow controls
  el.fileClear.addEventListener("click", resetBatch);
  el.processBtn.addEventListener("click", startProcessing);
  el.mappingBack.addEventListener("click", resetBatch);
  el.cancelBtn.addEventListener("click", cancelBatch);

  // Download: a single trigger in the results header opens a focus modal with
  // the export options (full IN_/OUT_ data, including not-found/error rows).
  el.downloadBtn.addEventListener("click", openDownloadModal);
  el.modalClose.addEventListener("click", closeDownloadModal);
  el.modal.addEventListener("click", (e) => { if (e.target === el.modal) closeDownloadModal(); });
  el.modal.addEventListener("keydown", trapModalTab);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modal.hidden) closeDownloadModal();
  });
  el.dlCsv.addEventListener("click", () => { downloadCSV(columns, results, exportName("csv")); closeDownloadModal(); });
  el.dlGeojson.addEventListener("click", () => { downloadGeoJSON(results, exportName("geojson")); closeDownloadModal(); });

  // Keep dynamic (non-data-i18n) text in sync on language change
  window.addEventListener("langchange", () => {
    if (batchState === "mapping") refreshMappingText();
    else if (batchState === "done") {
      lastSummary = summaryText();
      const count = document.getElementById("results-count");
      if (count) count.textContent = lastSummary;
    }
  });

  return { rerender };
}

// Re-point the shared results/detail panels at the batch data when the batch
// tab is (re)activated.
function rerender() {
  if (batchState === "done") deps.showResults?.(viewResults, lastSummary);
  else deps.clearResults?.();
}

// ── Download modal (focus dialog) ──
function openDownloadModal() {
  lastFocused = document.activeElement;
  el.modal.hidden = false;
  el.dlCsv.focus();
}

function closeDownloadModal() {
  if (el.modal.hidden) return;
  el.modal.hidden = true;
  lastFocused?.focus?.();
}

// Keep Tab focus inside the modal while it's open.
function trapModalTab(e) {
  if (e.key !== "Tab") return;
  const focusables = [el.modalClose, el.dlCsv, el.dlGeojson];
  const i = focusables.indexOf(document.activeElement);
  if (i === -1) return;
  e.preventDefault();
  const next = e.shiftKey
    ? (i - 1 + focusables.length) % focusables.length
    : (i + 1) % focusables.length;
  focusables[next].focus();
}

// ── State transitions ──
function setState(state) {
  batchState = state;
  el.upload.hidden = state !== "upload";
  el.mapping.hidden = state !== "mapping";
  el.processing.hidden = state !== "processing";
  el.done.hidden = state !== "done";
  el.fileChip.hidden = state === "upload";
}

function resetBatch() {
  cancelBatch();
  closeDownloadModal();
  parsed = null;
  results = [];
  columns = [];
  viewResults = [];
  egridCol = "";
  fileName = "";
  el.fileInput.value = "";
  hideError();
  setState("upload");
  deps.clearResults?.();
}

// ── Upload ──
async function handleFile(file) {
  hideError();
  fileName = file.name;
  try {
    const text = await file.text();
    parsed = parseCSV(text);
    if (!parsed.headers.length || !parsed.rows.length) {
      showError(t("batch.error.empty"));
      return;
    }
    showMapping();
  } catch {
    showError(t("batch.error.read"));
  }
}

async function onDemoRun(e) {
  e.preventDefault();
  hideError();
  try {
    const text = await (await fetch(DEMO_URL)).text();
    fileName = "oereb-beispiel.csv";
    parsed = parseCSV(text);
    showMapping();
    startProcessing(); // EGRID column auto-detected in showMapping
  } catch {
    showError(t("batch.error.demo"));
  }
}

// ── Mapping ──
function showMapping() {
  el.fileNameEl.textContent = fileName;

  // Populate column dropdown; auto-select a column literally named "egrid".
  const auto = parsed.headers.find((h) => /^egrid$/i.test(h.trim())) || "";
  egridCol = auto || parsed.headers[0] || "";
  el.egridSelect.innerHTML = parsed.headers
    .map((h) => `<option value="${esc(h)}"${h === egridCol ? " selected" : ""}>${esc(h)}</option>`)
    .join("");

  refreshMappingText();
  setState("mapping");
  deps.clearResults?.();
}

function refreshMappingText() {
  const delimName = { ";": "«;»", ",": "«,»", "\t": "Tab" }[parsed.delimiter] || parsed.delimiter;
  let info = t("batch.mapping.info", {
    rows: parsed.rows.length,
    cols: parsed.headers.length,
    delim: delimName,
  });
  if (parsed.rows.length > LARGE_FILE) info += " " + t("batch.mapping.large");
  el.mappingInfo.textContent = info;
  el.mappingColumns.textContent = parsed.headers.join(" · ");
  el.processBtn.textContent = t("batch.process", { n: parsed.rows.length });
}

// ── Processing ──
function startProcessing() {
  egridCol = el.egridSelect.value;
  if (!egridCol) { showError(t("batch.error.nocol")); return; }
  hideError();
  cancelled = false;
  renderProgress(0, parsed.rows.length);
  el.cancelBtn.disabled = false;
  setState("processing");
  deps.clearResults?.();
  runBatch();
}

function cancelBatch() {
  cancelled = true;
  abortController?.abort();
}

async function runBatch() {
  const { headers, rows } = parsed;
  const lang = getLang();
  const total = rows.length;

  abortController = new AbortController();
  const { signal } = abortController;
  const cache = new Map();
  const out = new Array(total);
  let completed = 0;

  const queue = rows.map((row, i) => ({ row, i }));

  const worker = async () => {
    while (queue.length && !cancelled) {
      const { row, i } = queue.shift();
      try {
        out[i] = await processOne(row, headers, lang, signal, cache);
      } catch (err) {
        if (cancelled || signal.aborted) return; // user cancelled
        out[i] = makeRow(row, headers, { OUT_RESULT: "error", OUT_MESSAGE: err.message || "error" });
      }
      completed++;
      renderProgress(completed, total);
    }
  };

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, total); i++) workers.push(worker());
  await Promise.all(workers);

  if (cancelled) { setState("mapping"); deps.clearResults?.(); return; } // back to mapping

  results = out.filter(Boolean);
  columns = [...headers.map((h) => `IN_${h}`), ...OUT_COLUMNS];
  viewResults = results.filter((r) => r.OUT_RESULT === "found").map((r) => r._feature);
  lastSummary = summaryText();

  setState("done");
  deps.showResults?.(viewResults, lastSummary);
}

/** Build a row object: IN_<headers> then a full OUT_ set, with overrides. */
function makeRow(inputRow, headers, overrides = {}) {
  const row = {};
  for (const h of headers) row[`IN_${h}`] = inputRow[h] ?? "";
  for (const c of OUT_COLUMNS) row[c] = "";
  return Object.assign(row, overrides);
}

async function processOne(inputRow, headers, lang, signal, cache) {
  const rawEgrid = (inputRow[egridCol] || "").trim();

  if (!rawEgrid) return makeRow(inputRow, headers, { OUT_RESULT: "error", OUT_MESSAGE: "empty EGRID" });
  if (!EGRID_RE.test(rawEgrid)) {
    return makeRow(inputRow, headers, { OUT_RESULT: "error", OUT_MESSAGE: "invalid EGRID format" });
  }

  // Cache the in-flight promise (not the resolved value) so concurrent workers
  // hitting the same EGRID share one request rather than racing past cache.has.
  // Evict failed lookups so a later duplicate of the same EGRID can retry.
  const key = rawEgrid.toUpperCase();
  if (!cache.has(key)) {
    cache.set(key, findByEgrid(rawEgrid, { signal }).catch((err) => {
      cache.delete(key);
      throw err;
    }));
  }
  const feature = await cache.get(key);

  if (!feature) {
    return makeRow(inputRow, headers, { OUT_RESULT: "not_found", OUT_MESSAGE: "EGRID not found in ÖREB cadastre" });
  }

  const geomLV95 = feature.geometry;
  const area = computeArea(geomLV95);
  const row = makeRow(inputRow, headers, mapAttributes(feature.attributes || {}, area, lang));
  row._feature = { featureId: feature.featureId, attributes: feature.attributes };
  if (geomLV95) row._geometry = reprojectGeometry(geomLV95, lv95ToWgs84);
  return row;
}

/** Map ÖREB attributes → OUT_ fields. */
function mapAttributes(a, areaM2, lang) {
  const statusText = a[STATUS_FIELD[lang] || STATUS_FIELD.de] || "";
  return {
    OUT_RESULT: "found",
    OUT_MESSAGE: "",
    OUT_EGRID: a.egris_egrid || "",
    OUT_NUMMER: a.number ?? "",
    OUT_GEMEINDE: a.gemeindename || "",
    OUT_BFS_NR: a.bfs_nr ?? "",
    OUT_KANTON: a.kanton || "",
    OUT_PLZ: a.plz ?? "",
    OUT_ORT: a.ort || "",
    OUT_ART: a.realestate_type || "",
    OUT_FLAECHE_M2: areaM2 != null ? Math.round(areaM2 * 10) / 10 : "",
    OUT_OEREB_STATUS: statusText,
    OUT_OEREB_AKTIV: isStatusActive(statusText) ? "true" : "false",
    OUT_EMAIL: a.email || "",
    OUT_TELEFON: a.telefon || "",
    OUT_EXTRACT_PDF: a.oereb_extract_pdf || "",
    OUT_EXTRACT_URL: a.oereb_extract_url || "",
    OUT_GEOPORTAL: a.url_oereb || "",
    OUT_WEBSERVICE: a.oereb_webservice || "",
  };
}

function summaryText() {
  const counts = { found: 0, not_found: 0, error: 0 };
  for (const r of results) counts[r.OUT_RESULT] = (counts[r.OUT_RESULT] || 0) + 1;
  return t("batch.summary", {
    found: counts.found,
    notfound: counts.not_found,
    error: counts.error,
    total: results.length,
  });
}

function renderProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.progressFill.style.width = pct + "%";
  el.progressCount.textContent = `${done} / ${total}`;
  if (el.progressBar) {
    el.progressBar.setAttribute("aria-valuenow", String(pct));
    el.progressBar.setAttribute("aria-valuetext", `${done} / ${total}`);
  }
}

// ── Helpers ──
function exportName(ext) {
  const base = fileName.replace(/\.[^.]+$/, "") || "oereb";
  return `${base}_oereb.${ext}`;
}

function showError(msg) {
  el.error.textContent = msg;
  el.error.hidden = false;
}

function hideError() {
  el.error.textContent = "";
  el.error.hidden = true;
}
