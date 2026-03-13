/**
 * App state machine: upload → processing → results
 */
import { initUpload } from "./upload.js";
import { processRows, cancelProcessing } from "./processor.js";
import { initMap, plotResults, highlightMarker, resizeMap } from "./map.js";
import { initTable, populateTable, highlightRow } from "./table.js";
import { downloadCSV, downloadXLSX, downloadGeoJSON } from "./export.js";
import { formatNumber } from "./utils.js";

let processedResults = [];
let tableOpen = true;

document.addEventListener("DOMContentLoaded", () => {
  initUpload(onStartProcessing);

  // Cancel button
  document.getElementById("btn-cancel").addEventListener("click", () => {
    cancelProcessing();
  });

  // Table toggle
  document.getElementById("table-toggle").addEventListener("click", () => {
    tableOpen = !tableOpen;
    document.getElementById("results-table-container").classList.toggle("collapsed", !tableOpen);
    document.getElementById("table-toggle").classList.toggle("collapsed", !tableOpen);
    setTimeout(() => resizeMap(), 280);
  });

  // Reset to landing page
  function resetToUpload() {
    cancelProcessing();
    processedResults = [];
    showState("upload");
    document.getElementById("btn-new").hidden = true;
    document.getElementById("btn-download").hidden = true;
    document.getElementById("file-input").value = "";
    const err = document.getElementById("upload-error");
    if (err) { err.hidden = true; err.innerHTML = ""; }
  }

  document.getElementById("btn-new").addEventListener("click", resetToUpload);
  document.querySelector(".header-left").addEventListener("click", resetToUpload);
  document.querySelector(".header-left").style.cursor = "pointer";

  // Download modal
  const dlOverlay = document.getElementById("download-overlay");
  document.getElementById("btn-download").addEventListener("click", () => {
    dlOverlay.hidden = false;
  });
  document.getElementById("dl-close").addEventListener("click", () => {
    dlOverlay.hidden = true;
  });
  dlOverlay.addEventListener("click", (e) => {
    if (e.target === dlOverlay) dlOverlay.hidden = true;
  });
  document.getElementById("dl-csv").addEventListener("click", () => {
    downloadCSV(processedResults);
    dlOverlay.hidden = true;
  });
  document.getElementById("dl-xlsx").addEventListener("click", () => {
    downloadXLSX(processedResults);
    dlOverlay.hidden = true;
  });
  document.getElementById("dl-geojson").addEventListener("click", () => {
    downloadGeoJSON(processedResults);
    dlOverlay.hidden = true;
  });
});

function showState(state) {
  document.querySelectorAll(".app-state").forEach((el) => {
    el.hidden = el.id !== `state-${state}`;
  });
  if (state === "results") {
    setTimeout(() => resizeMap(), 100);
  }
}

async function onStartProcessing(parsedData) {
  showState("processing");

  const startTime = Date.now();

  processedResults = await processRows(parsedData.rows, (progress) => {
    updateProgress(progress, startTime);
  });

  showResults();
}

function updateProgress(progress, startTime) {
  const { processed, total, matched, notFound, skipped } = progress;
  const pct = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;

  document.getElementById("progress-bar-fill").style.width = `${pct}%`;
  document.getElementById("progress-text").textContent =
    `Gebäude ${formatNumber(processed)} von ${formatNumber(total)} — ${pct}%`;

  const elapsed = Date.now() - startTime;
  const perItem = processed > 0 ? elapsed / processed : 0;
  const remaining = perItem * (total - processed);
  const etaSeconds = Math.ceil(remaining / 1000);
  const etaMin = Math.floor(etaSeconds / 60);
  const etaSec = etaSeconds % 60;
  document.getElementById("progress-eta").textContent =
    processed < total ? `~${etaMin}m ${etaSec}s verbleibend` : "Wird abgeschlossen...";

  document.getElementById("progress-stats").textContent =
    `Gefunden: ${matched} · Nicht gefunden: ${notFound} · Übersprungen: ${skipped}`;
}

function showResults() {
  showState("results");

  // Summary
  const total = processedResults.length;
  const matched = processedResults.filter((r) => r.gwr_match === "matched").length;
  const notFound = processedResults.filter((r) => r.gwr_match === "not_found").length;
  const skipped = processedResults.filter((r) => r.gwr_match === "skipped").length;
  const scores = processedResults.filter((r) => r.match_score !== "" && r.match_score != null).map((r) => Number(r.match_score));
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  document.getElementById("summary-bar").innerHTML =
    `<strong>${formatNumber(total)}</strong> Gebäude · ` +
    `<strong>${Math.round((matched / total) * 100)}%</strong> gefunden · ` +
    `Ø Score: <strong>${avgScore}%</strong> · ` +
    `${notFound} nicht gefunden · ${skipped} übersprungen`;

  // Reset table state
  tableOpen = true;
  document.getElementById("results-table-container").classList.remove("collapsed");
  document.getElementById("table-toggle").classList.remove("collapsed");

  // Initialize table first (synchronous)
  initTable(document.getElementById("results-table-container"), (index) => {
    highlightMarker(index);
  });

  // Wire export buttons (now inside the table toolbar)
  document.getElementById("btn-csv").addEventListener("click", () => downloadCSV(processedResults));
  document.getElementById("btn-xlsx").addEventListener("click", () => downloadXLSX(processedResults));
  document.getElementById("btn-geojson").addEventListener("click", () => downloadGeoJSON(processedResults));

  populateTable(processedResults);

  // Show header buttons
  document.getElementById("btn-download").hidden = false;
  document.getElementById("btn-new").hidden = false;

  // Initialize map after DOM reflow so the container has dimensions
  requestAnimationFrame(() => {
    initMap("results-map", (index) => {
      highlightRow(index);
    });
    plotResults(processedResults);
  });
}
