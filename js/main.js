/**
 * App state machine: upload → processing → results
 */
import { initUpload } from "./upload.js";
import { processRows, cancelProcessing } from "./processor.js";
import { initMap, plotResults, highlightMarker, resizeMap, onSummaryToggle, setSummaryToggleVisible } from "./map.js";
import { initTable, populateTable, highlightRow } from "./table.js";
import { downloadCSV, downloadXLSX, downloadGeoJSON } from "./export.js";
import { formatNumber, scoreColor, confidenceLabel } from "./utils.js";

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
    if (err) { err.hidden = true; err.textContent = ""; }
  }

  document.getElementById("btn-new").addEventListener("click", resetToUpload);
  const headerLeft = document.querySelector(".header-left");
  headerLeft.addEventListener("click", resetToUpload);
  headerLeft.style.cursor = "pointer";

  // Language switcher — update <html lang> attribute
  document.getElementById("lang-select").addEventListener("change", (e) => {
    document.documentElement.lang = e.target.value;
  });

  // Summary panel toggle
  document.getElementById("sp-close").addEventListener("click", () => {
    document.getElementById("summary-panel").classList.add("collapsed");
    setSummaryToggleVisible(true);
    setTimeout(() => resizeMap(), 280);
  });
  onSummaryToggle(() => {
    document.getElementById("summary-panel").classList.remove("collapsed");
    setSummaryToggleVisible(false);
    setTimeout(() => resizeMap(), 280);
  });

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

  const progressBar = document.querySelector(".progress-bar");
  document.getElementById("progress-bar-fill").style.width = `${pct}%`;
  progressBar.setAttribute("aria-valuenow", Math.round(pct));
  progressBar.setAttribute("aria-valuetext", `Gebäude ${formatNumber(processed)} von ${formatNumber(total)}`);
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

  // Compute stats
  const total = processedResults.length;
  const matched = processedResults.filter((r) => r.gwr_match === "matched").length;
  const notFound = processedResults.filter((r) => r.gwr_match === "not_found").length;
  const skipped = processedResults.filter((r) => r.gwr_match === "skipped").length;
  const scores = processedResults.filter((r) => r.match_score !== "" && r.match_score != null).map((r) => Number(r.match_score));
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const matchedPct = total > 0 ? Math.round((matched / total) * 100) : 0;

  // Confidence distribution
  const high = scores.filter((s) => s >= 80).length;
  const medium = scores.filter((s) => s >= 50 && s < 80).length;
  const low = scores.filter((s) => s < 50).length;
  const noScore = total - scores.length;
  const maxBar = Math.max(high, medium, low, noScore, 1);

  // SVG donut chart calculations
  const donutRadius = 54;
  const donutStroke = 10;
  const donutCirc = 2 * Math.PI * donutRadius;
  const donutFill = (avgScore / 100) * donutCirc;
  const donutGap = donutCirc - donutFill;
  const donutColor = scoreColor(avgScore);
  const confLabel = confidenceLabel(avgScore);

  // Populate summary panel
  document.getElementById("sp-body").innerHTML = `
    <div class="sp-donut-wrap">
      <svg class="sp-donut" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="${donutRadius}" fill="none" stroke="var(--gray-200)" stroke-width="${donutStroke}" />
        <circle cx="64" cy="64" r="${donutRadius}" fill="none"
          stroke="${donutColor}" stroke-width="${donutStroke}"
          stroke-dasharray="${donutFill} ${donutGap}"
          stroke-dashoffset="${donutCirc * 0.25}"
          stroke-linecap="round"
          class="sp-donut-arc" />
      </svg>
      <div class="sp-donut-text">
        <div class="sp-donut-value">${avgScore}%</div>
        <div class="sp-donut-label">\u00d8 Score</div>
      </div>
    </div>
    <div class="sp-donut-conf">\u25cf ${confLabel}</div>

    <div class="sp-divider"></div>

    <div class="sp-stat-big">${formatNumber(total)}</div>
    <div class="sp-stat-label">Geb\u00e4ude gepr\u00fcft</div>

    <div class="sp-section">
      <div class="sp-row">
        <span>Gefunden</span>
        <strong>${matchedPct}%</strong>
      </div>
      <div class="sp-bar"><div class="sp-bar-fill sp-bar-good" style="width:${matchedPct}%"></div></div>
    </div>

    <div class="sp-section">
      <div class="sp-status-grid">
        <div class="sp-status-cell">
          <div class="sp-status-value sp-color-good">${formatNumber(matched)}</div>
          <div class="sp-status-key">Gefunden</div>
        </div>
        <div class="sp-status-cell">
          <div class="sp-status-value sp-color-poor">${formatNumber(notFound)}</div>
          <div class="sp-status-key">Nicht gef.</div>
        </div>
        <div class="sp-status-cell">
          <div class="sp-status-value sp-color-none">${formatNumber(skipped)}</div>
          <div class="sp-status-key">\u00dcberspr.</div>
        </div>
      </div>
    </div>

    <div class="sp-section">
      <div class="sp-section-title">Konfidenz</div>
      <div class="sp-dist-row">
        <span class="sp-dist-label score-badge score-good">Hoch</span>
        <div class="sp-dist-bar"><div class="sp-dist-fill sp-bar-good" style="width:${(high / maxBar) * 100}%"></div></div>
        <span class="sp-dist-val">${formatNumber(high)}</span>
      </div>
      <div class="sp-dist-row">
        <span class="sp-dist-label score-badge score-partial">Mittel</span>
        <div class="sp-dist-bar"><div class="sp-dist-fill sp-bar-partial" style="width:${(medium / maxBar) * 100}%"></div></div>
        <span class="sp-dist-val">${formatNumber(medium)}</span>
      </div>
      <div class="sp-dist-row">
        <span class="sp-dist-label score-badge score-poor">Tief</span>
        <div class="sp-dist-bar"><div class="sp-dist-fill sp-bar-poor" style="width:${(low / maxBar) * 100}%"></div></div>
        <span class="sp-dist-val">${formatNumber(low)}</span>
      </div>
      <div class="sp-dist-row">
        <span class="sp-dist-label score-badge score-none">N/A</span>
        <div class="sp-dist-bar"><div class="sp-dist-fill sp-bar-none" style="width:${(noScore / maxBar) * 100}%"></div></div>
        <span class="sp-dist-val">${formatNumber(noScore)}</span>
      </div>
    </div>
  `;

  // Reset panel state
  document.getElementById("summary-panel").classList.remove("collapsed");
  setSummaryToggleVisible(false);

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
  requestAnimationFrame(async () => {
    await initMap("results-map", (index) => {
      highlightRow(index);
    });
    plotResults(processedResults);
  });
}
