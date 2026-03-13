/**
 * Results table with sorting, filtering, search, column toggle, pagination
 */
import { escapeHtml, scoreClass, confidenceLabel } from "./utils.js";
import { resizeMap } from "./map.js";
import { loadCodes, codeLabel, CODE_COLUMNS } from "./gwr-codes.js";

let allResults = [];
let filteredResults = [];
let sortField = "match_score";
let sortAsc = false;
let presetFilter = "all"; // all | high | medium | low
let activeFilters = [];   // [{ key, value, label }]
let searchQuery = "";
let onRowClick = null;
let currentPage = 0;
let pageSize = 25;

/** Abort controller for document-level listeners; recreated each initTable() call */
let dropdownAC = null;

const DEFAULT_VISIBLE = new Set([
  // Input columns (all visible by default)
  "internal_id", "egid", "street", "street_number", "zip", "city",
  "region", "building_type", "latitude", "longitude", "country", "comment",
  // GWR columns (selected — see §5)
  "gwr_street", "gwr_street_number", "gwr_zip", "gwr_city",
  "gwr_building_type", "gwr_building_class", "gwr_year_built", "gwr_area",
  // Match columns (summary visible, per-field hidden by default)
  "match_score", "confidence", "gwr_match",
]);

const COLUMNS = [
  // --- Input columns (passed through) ---
  { key: "internal_id", label: "Interne ID" },
  { key: "egid", label: "EGID" },
  { key: "street", label: "Strasse" },
  { key: "street_number", label: "Nr" },
  { key: "zip", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "region", label: "Kanton" },
  { key: "building_type", label: "Kategorie" },
  { key: "latitude", label: "Breite" },
  { key: "longitude", label: "L\u00e4nge" },
  { key: "country", label: "Land" },
  { key: "comment", label: "Kommentar" },
  // --- GWR output columns (from API) ---
  { key: "gwr_egid", label: "EGID (GWR)" },
  { key: "gwr_egrid", label: "EGRID (GWR)" },
  { key: "gwr_street", label: "Strasse (GWR)" },
  { key: "gwr_street_number", label: "Nr (GWR)" },
  { key: "gwr_zip", label: "PLZ (GWR)" },
  { key: "gwr_city", label: "Ort (GWR)" },
  { key: "gwr_municipality", label: "Gemeinde (GWR)" },
  { key: "gwr_municipality_nr", label: "BFS-Nr (GWR)" },
  { key: "gwr_region", label: "Kt (GWR)" },
  { key: "gwr_building_type", label: "Kategorie (GWR)" },
  { key: "gwr_building_class", label: "Geb\u00e4udeklasse (GWR)" },
  { key: "gwr_status", label: "Geb\u00e4udestatus (GWR)" },
  { key: "gwr_year_built", label: "Baujahr (GWR)" },
  { key: "gwr_construction_period", label: "Bauperiode (GWR)" },
  { key: "gwr_area", label: "Grundfl\u00e4che m\u00b2 (GWR)" },
  { key: "gwr_floors", label: "Anz. Geschosse (GWR)" },
  { key: "gwr_dwellings", label: "Wohnungen (GWR)" },
  { key: "gwr_latitude", label: "Breite (GWR)" },
  { key: "gwr_longitude", label: "L\u00e4nge (GWR)" },
  { key: "gwr_coord_e", label: "E-Koord. (LV95)" },
  { key: "gwr_coord_n", label: "N-Koord. (LV95)" },
  { key: "gwr_coord_source", label: "Koord.-Herkunft (GWR)" },
  { key: "gwr_demolition_year", label: "Abbruchjahr (GWR)" },
  { key: "gwr_plot_nr", label: "Parzelle (GWR)" },
  { key: "gwr_building_name", label: "Geb\u00e4udename (GWR)" },
  { key: "gwr_heating_type", label: "Heizung (GWR)" },
  { key: "gwr_heating_energy", label: "Energietr. Heiz. (GWR)" },
  { key: "gwr_hot_water_type", label: "Warmwasser (GWR)" },
  { key: "gwr_hot_water_energy", label: "Energietr. WW (GWR)" },
  // --- Match results (computed) ---
  { key: "match_score", label: "Score" },
  { key: "confidence", label: "Konfidenz" },
  { key: "match_street", label: "Match Strasse" },
  { key: "match_street_number", label: "Match Nr" },
  { key: "match_zip", label: "Match PLZ" },
  { key: "match_city", label: "Match Ort" },
  { key: "match_region", label: "Match Kt" },
  { key: "match_building_type", label: "Match Kategorie" },
  { key: "match_coordinates", label: "Match Koord." },
  { key: "gwr_match", label: "GWR Abgleich" },
].map((c) => ({ ...c, visible: DEFAULT_VISIBLE.has(c.key) }));

/** Columns available for the filter dropdown (categorical/useful ones) */
const FILTERABLE_COLUMNS = [
  { key: "gwr_match", label: "GWR Abgleich" },
  { key: "gwr_region", label: "Kanton" },
  { key: "gwr_building_type", label: "Geb\u00e4udekategorie" },
  { key: "gwr_building_class", label: "Geb\u00e4udeklasse" },
  { key: "gwr_status", label: "Geb\u00e4udestatus" },
  { key: "gwr_municipality", label: "Gemeinde" },
  { key: "gwr_zip", label: "PLZ" },
  { key: "match_street", label: "Match Strasse" },
  { key: "match_street_number", label: "Match Nr" },
  { key: "match_zip", label: "Match PLZ" },
  { key: "match_city", label: "Match Ort" },
  { key: "match_region", label: "Match Kt" },
  { key: "match_building_type", label: "Match Kategorie" },
  { key: "match_coordinates", label: "Match Koord." },
];

const FILTERABLE_KEYS = new Set(FILTERABLE_COLUMNS.map((c) => c.key));

function visibleCols() {
  return COLUMNS.filter((c) => c.visible);
}

/* ── URL Parameter Sync ── */

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);

  // Preset
  const p = params.get("preset");
  if (["high", "medium", "low"].includes(p)) presetFilter = p;
  else presetFilter = "all";

  // Search
  searchQuery = params.get("q") || "";

  // Column filters (multiple values per key)
  activeFilters = [];
  for (const col of FILTERABLE_COLUMNS) {
    const values = params.getAll(col.key);
    for (const v of values) {
      const displayV = CODE_COLUMNS[col.key] ? codeLabel(CODE_COLUMNS[col.key], v) : v;
      activeFilters.push({ key: col.key, value: v, label: `${col.label}: ${displayV}` });
    }
  }
}

function writeUrlParams() {
  const params = new URLSearchParams();
  if (presetFilter !== "all") params.set("preset", presetFilter);
  if (searchQuery) params.set("q", searchQuery);
  for (const f of activeFilters) {
    params.append(f.key, f.value);
  }
  const qs = params.toString();
  const url = window.location.pathname + (qs ? "?" + qs : "");
  window.history.pushState(null, "", url);
}

/* ── Init ── */

export function initTable(container, clickCallback) {
  // Tear down previous document-level listeners to prevent leaks
  if (dropdownAC) dropdownAC.abort();
  dropdownAC = new AbortController();

  onRowClick = clickCallback;
  COLUMNS.forEach((c) => (c.visible = DEFAULT_VISIBLE.has(c.key)));

  // Kick off GWR code label fetch (awaited in populateTable before first render)
  loadCodes();

  // Read URL params before rendering
  readUrlParams();

  // Sync filter state when user navigates back/forward
  window.addEventListener("popstate", () => {
    readUrlParams();
    applyFilter();
    renderHeader();
    renderBody();
    renderFilterPills();
    // Sync preset buttons
    container.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
    container.querySelector(`.preset-btn[data-preset="${presetFilter}"]`)?.classList.add("active");
    // Sync search input
    const si = container.querySelector("#tbl-search");
    if (si) { si.value = searchQuery; container.querySelector("#tbl-search-clear").hidden = !searchQuery; }
  }, { signal: dropdownAC.signal });

  container.innerHTML = `
    <div class="table-toolbar">
      <div class="tbl-search-wrap">
        <svg class="tbl-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="tbl-search" class="tbl-search" placeholder="Suche\u2026" value="${escapeHtml(searchQuery)}">
        <button class="tbl-search-clear" id="tbl-search-clear" ${searchQuery ? "" : "hidden"}>&times;</button>
      </div>
      <div class="table-presets" id="table-presets">
        <button class="preset-btn ${presetFilter === "high" ? "active" : ""}" data-preset="high">Hoch</button>
        <button class="preset-btn ${presetFilter === "medium" ? "active" : ""}" data-preset="medium">Mittel</button>
        <button class="preset-btn ${presetFilter === "low" ? "active" : ""}" data-preset="low">Tief</button>
      </div>
      <div class="filter-pills" id="filter-pills"></div>
      <span class="toolbar-spacer"></span>
      <div class="col-dd-wrap" id="col-dd-wrap">
        <button class="toolbar-btn" id="col-dd-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Spalten
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dropdown-menu col-dd-menu" id="col-dd-menu" hidden></div>
      </div>
      <div class="filter-dd-wrap" id="filter-dd-wrap">
        <button class="toolbar-btn" id="filter-dd-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filter
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dropdown-menu filter-dd-menu" id="filter-dd-menu" hidden></div>
      </div>
    </div>
    <div class="table-scroll">
      <table class="results-table" id="results-table">
        <thead></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="table-pagination" id="table-pagination"></div>
  `;

  // Search
  const searchInput = container.querySelector("#tbl-search");
  const searchClear = container.querySelector("#tbl-search-clear");
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim();
    searchClear.hidden = !searchQuery;
    applyFilter();
    renderBody();
    writeUrlParams();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClear.hidden = true;
    applyFilter();
    renderBody();
    writeUrlParams();
  });

  // Preset buttons (confidence-based, toggle behavior)
  container.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isActive = btn.classList.contains("active");
      container.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      if (isActive) {
        presetFilter = "all";
      } else {
        btn.classList.add("active");
        presetFilter = btn.dataset.preset;
      }
      renderFilterPills();
      applyFilter();
      renderBody();
      writeUrlParams();
    });
  });

  // Column toggle dropdown
  initColumnDropdown();

  // Filter dropdown
  initFilterDropdown();

  // Render pills from URL params
  renderFilterPills();
}

/* ── Dropdowns ── */

/** Close all toolbar dropdowns (columns, filter) */
function closeAllDropdowns(except) {
  const ids = ["col-dd-menu", "filter-dd-menu"];
  for (const id of ids) {
    if (id === except) continue;
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}

function initColumnDropdown() {
  const btn = document.getElementById("col-dd-btn");
  const menu = document.getElementById("col-dd-menu");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.hidden;
    closeAllDropdowns();
    menu.hidden = !opening;
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("col-dd-wrap").contains(e.target)) {
      menu.hidden = true;
    }
  }, { signal: dropdownAC.signal });

  renderColumnMenu();
}

function renderColumnMenu() {
  const menu = document.getElementById("col-dd-menu");
  let html = `<div class="col-dd-actions">
    <button class="col-dd-action" id="col-show-all">Alle anzeigen</button>
    <button class="col-dd-action" id="col-hide-all">Alle ausblenden</button>
  </div>`;
  for (const col of COLUMNS) {
    html += `<label class="col-dd-item">
      <input type="checkbox" data-col="${col.key}" ${col.visible ? "checked" : ""}>
      ${escapeHtml(col.label)}
    </label>`;
  }
  menu.innerHTML = html;

  document.getElementById("col-show-all").addEventListener("click", (e) => {
    e.stopPropagation();
    COLUMNS.forEach((c) => (c.visible = true));
    renderColumnMenu();
    renderHeader();
    renderBody();
  });

  document.getElementById("col-hide-all").addEventListener("click", (e) => {
    e.stopPropagation();
    // Always keep at least internal_id visible
    COLUMNS.forEach((c) => (c.visible = c.key === "internal_id"));
    renderColumnMenu();
    renderHeader();
    renderBody();
  });

  menu.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const col = COLUMNS.find((c) => c.key === cb.dataset.col);
      if (!col) return;
      // Prevent unchecking the last visible column
      if (!cb.checked && visibleCols().length <= 1) {
        cb.checked = true;
        return;
      }
      col.visible = cb.checked;
      renderHeader();
      renderBody();
    });
  });
}

/* ── Filter Dropdown ── */

function initFilterDropdown() {
  const btn = document.getElementById("filter-dd-btn");
  const menu = document.getElementById("filter-dd-menu");
  const wrap = document.getElementById("filter-dd-wrap");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.hidden;
    closeAllDropdowns();
    if (opening) {
      renderFilterCheckboxList();
      menu.hidden = false;
    } else {
      menu.hidden = true;
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      menu.hidden = true;
    }
  }, { signal: dropdownAC.signal });
}

function renderFilterCheckboxList() {
  const menu = document.getElementById("filter-dd-menu");
  const activeSet = new Set(activeFilters.map((f) => `${f.key}::${f.value}`));

  // Collect distinct values per column
  const groups = [];
  for (const col of FILTERABLE_COLUMNS) {
    const counts = new Map();
    for (const row of allResults) {
      const v = String(row[col.key] ?? "").trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    if (counts.size === 0) continue;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    groups.push({ col, values: sorted });
  }

  let html = `<div class="filter-dd-search-wrap">
    <input type="text" class="filter-dd-search" id="filter-dd-search" placeholder="Filter suchen\u2026">
  </div>`;

  for (const g of groups) {
    html += `<div class="filter-dd-group" data-group="${g.col.key}">${escapeHtml(g.col.label)}</div>`;
    for (const [val, count] of g.values) {
      const checked = activeSet.has(`${g.col.key}::${val}`) ? "checked" : "";
      const displayVal = CODE_COLUMNS[g.col.key] ? codeLabel(CODE_COLUMNS[g.col.key], val) : val;
      const searchText = (g.col.label + " " + displayVal).toLowerCase();
      html += `<label class="filter-dd-check" data-group="${g.col.key}" data-search="${escapeHtml(searchText)}">
        <input type="checkbox" data-key="${g.col.key}" data-value="${escapeHtml(val)}" ${checked}>
        <span class="filter-dd-check-label">${escapeHtml(displayVal)}</span>
        <span class="filter-dd-count">${count}</span>
      </label>`;
    }
  }

  if (!groups.length) {
    html += `<div class="filter-dd-empty">Keine Filter verf\u00fcgbar</div>`;
  }

  menu.innerHTML = html;

  // Wire up checkbox changes
  menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      toggleFilter(cb.dataset.key, cb.dataset.value);
    });
  });

  // Wire up search
  const searchInput = document.getElementById("filter-dd-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      const items = menu.querySelectorAll(".filter-dd-check");
      const groupHeaders = menu.querySelectorAll(".filter-dd-group");
      const visibleGroups = new Set();

      items.forEach((item) => {
        const match = !q || item.dataset.search.includes(q);
        item.style.display = match ? "" : "none";
        if (match) visibleGroups.add(item.dataset.group);
      });

      groupHeaders.forEach((header) => {
        header.style.display = visibleGroups.has(header.dataset.group) ? "" : "none";
      });
    });
  }
}

function toggleFilter(key, value) {
  const idx = activeFilters.findIndex((f) => f.key === key && f.value === value);
  if (idx >= 0) {
    activeFilters.splice(idx, 1);
  } else {
    const col = FILTERABLE_COLUMNS.find((c) => c.key === key);
    const displayVal = CODE_COLUMNS[key] ? codeLabel(CODE_COLUMNS[key], value) : value;
    activeFilters.push({ key, value, label: `${col ? col.label : key}: ${displayVal}` });
  }
  renderFilterPills();
  applyFilter();
  renderBody();
  writeUrlParams();
}

function removeFilter(key, value) {
  activeFilters = activeFilters.filter((f) => !(f.key === key && f.value === value));
  renderFilterPills();
  applyFilter();
  renderBody();
  writeUrlParams();
  // Update checkboxes if menu is open
  const menu = document.getElementById("filter-dd-menu");
  if (menu && !menu.hidden) renderFilterCheckboxList();
}

function clearAllFilters() {
  activeFilters = [];
  presetFilter = "all";
  document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
  renderFilterPills();
  applyFilter();
  renderBody();
  writeUrlParams();
  const menu = document.getElementById("filter-dd-menu");
  if (menu && !menu.hidden) renderFilterCheckboxList();
}

/** Activate a preset filter (used by confidence badge clicks) */
function activatePreset(preset) {
  document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
  if (preset === presetFilter) {
    presetFilter = "all";
  } else {
    presetFilter = preset;
    document.querySelector(`.preset-btn[data-preset="${preset}"]`)?.classList.add("active");
  }
  renderFilterPills();
  applyFilter();
  renderBody();
  writeUrlParams();
}

/** Add a filter if not already active (used by badge clicks) */
function ensureFilter(key, value) {
  if (!FILTERABLE_KEYS.has(key)) return;
  if (activeFilters.some((f) => f.key === key && f.value === value)) return;
  const col = FILTERABLE_COLUMNS.find((c) => c.key === key);
  const displayVal = CODE_COLUMNS[key] ? codeLabel(CODE_COLUMNS[key], value) : value;
  activeFilters.push({ key, value, label: `${col.label}: ${displayVal}` });
  renderFilterPills();
  applyFilter();
  renderBody();
  writeUrlParams();
  const menu = document.getElementById("filter-dd-menu");
  if (menu && !menu.hidden) renderFilterCheckboxList();
}

const PRESET_LABELS = { high: "Hoch", medium: "Mittel", low: "Tief" };

function renderFilterPills() {
  const container = document.getElementById("filter-pills");
  if (!container) return;

  const hasPreset = presetFilter !== "all";
  if (!activeFilters.length && !hasPreset) {
    container.innerHTML = "";
    return;
  }

  let html = "";

  // Preset pill
  if (hasPreset) {
    html += `<span class="filter-pill">
      Konfidenz: ${PRESET_LABELS[presetFilter]}
      <button class="filter-pill-x" id="filter-pill-preset" title="Filter entfernen">&times;</button>
    </span>`;
  }

  for (const f of activeFilters) {
    html += `<span class="filter-pill">
      ${escapeHtml(f.label)}
      <button class="filter-pill-x" data-key="${f.key}" data-value="${escapeHtml(f.value)}" title="Filter entfernen">&times;</button>
    </span>`;
  }
  html += `<button class="filter-reset-pill" id="filter-reset-all">Filter zur\u00fccksetzen</button>`;
  container.innerHTML = html;

  // Preset pill remove
  const presetPill = document.getElementById("filter-pill-preset");
  if (presetPill) {
    presetPill.addEventListener("click", () => {
      presetFilter = "all";
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      renderFilterPills();
      applyFilter();
      renderBody();
      writeUrlParams();
    });
  }

  container.querySelectorAll(".filter-pill-x[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFilter(btn.dataset.key, btn.dataset.value);
    });
  });

  document.getElementById("filter-reset-all").addEventListener("click", clearAllFilters);
}

/* ── Data ── */

export async function populateTable(results) {
  allResults = results.map((r, i) => ({ ...r, _index: i }));
  await loadCodes();
  applyFilter();
  renderHeader();
  renderBody();
}

function applyFilter() {
  filteredResults = [...allResults];

  // Preset filter (confidence-based)
  if (presetFilter === "high") {
    filteredResults = filteredResults.filter((r) => r.match_score !== "" && r.match_score != null && Number(r.match_score) >= 80);
  } else if (presetFilter === "medium") {
    filteredResults = filteredResults.filter((r) => r.match_score !== "" && r.match_score != null && Number(r.match_score) >= 50 && Number(r.match_score) < 80);
  } else if (presetFilter === "low") {
    filteredResults = filteredResults.filter((r) => r.match_score !== "" && r.match_score != null && Number(r.match_score) < 50);
  }

  // Column filters (OR within same key, AND across keys)
  const filtersByKey = {};
  for (const f of activeFilters) {
    if (!filtersByKey[f.key]) filtersByKey[f.key] = [];
    filtersByKey[f.key].push(f.value);
  }
  for (const [key, values] of Object.entries(filtersByKey)) {
    filteredResults = filteredResults.filter((r) => values.includes(String(r[key] ?? "").trim()));
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredResults = filteredResults.filter((r) =>
      COLUMNS.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))
    );
  }

  currentPage = 0;
  sortResults();
}

function sortResults() {
  filteredResults.sort((a, b) => {
    let va = a[sortField] ?? "";
    let vb = b[sortField] ?? "";
    const na = Number(va);
    const nb = Number(vb);
    if (!isNaN(na) && !isNaN(nb) && va !== "" && vb !== "") {
      return sortAsc ? na - nb : nb - na;
    }
    va = String(va).toLowerCase();
    vb = String(vb).toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });
}

/* ── Rendering ── */

function renderHeader() {
  const cols = visibleCols();
  const thead = document.querySelector("#results-table thead");
  let html = "<tr>";
  for (const col of cols) {
    const isSorted = sortField === col.key;
    const arrow = isSorted ? (sortAsc ? " \u25b2" : " \u25bc") : "";
    const ariaSort = isSorted ? (sortAsc ? ' aria-sort="ascending"' : ' aria-sort="descending"') : "";
    html += `<th class="sortable" data-field="${col.key}"${ariaSort}>${escapeHtml(col.label)}${arrow}</th>`;
  }
  html += "</tr>";
  thead.innerHTML = html;

  thead.querySelectorAll(".sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.field;
      if (sortField === field) {
        sortAsc = !sortAsc;
      } else {
        sortField = field;
        sortAsc = true;
      }
      sortResults();
      renderHeader();
      renderBody();
    });
  });
}

function renderBody() {
  const cols = visibleCols();
  const tbody = document.querySelector("#results-table tbody");
  if (!filteredResults.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="empty-state">Keine Ergebnisse</td></tr>`;
    renderPagination();
    return;
  }

  const totalPages = Math.ceil(filteredResults.length / pageSize);
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  const start = currentPage * pageSize;
  const pageRows = filteredResults.slice(start, start + pageSize);

  let html = "";
  for (const row of pageRows) {
    html += `<tr data-index="${row._index}">`;
    for (const col of cols) {
      const val = row[col.key] ?? "";
      const filterable = FILTERABLE_KEYS.has(col.key) && val !== "";
      const filterAttr = filterable ? ` data-filter-key="${col.key}" data-filter-value="${escapeHtml(val)}"` : "";
      const filterCls = filterable ? " filterable-badge" : "";

      if (col.key === "match_score") {
        html += `<td>${val !== "" ? escapeHtml(val) + "%" : ""}</td>`;
      } else if (col.key === "confidence") {
        const score = row.match_score;
        const label = confidenceLabel(score);
        const cls = score != null && score !== "" ? scoreClass(Number(score)) : "score-none";
        const confPreset = { "Hoch": "high", "Mittel": "medium", "Tief": "low" }[label] || "";
        const confClick = confPreset ? ` filterable-badge" data-conf-preset="${confPreset}` : "";
        html += `<td><span class="score-badge ${cls}${confClick}">${escapeHtml(label)}</span></td>`;
      } else if (col.key === "gwr_match") {
        html += `<td><span class="status-badge status-${val}${filterCls}"${filterAttr}>${escapeHtml(val)}</span></td>`;
      } else if (col.key.startsWith("match_") && val) {
        const mcls = val === "exact" ? "score-good" : val === "similar" ? "score-partial" : val === "mismatch" ? "score-poor" : "score-none";
        html += `<td><span class="score-badge ${mcls}${filterCls}"${filterAttr}>${escapeHtml(val)}</span></td>`;
      } else if (CODE_COLUMNS[col.key] && val !== "") {
        const label = codeLabel(CODE_COLUMNS[col.key], val);
        html += `<td title="${escapeHtml(val)}">${escapeHtml(label)}</td>`;
      } else {
        html += `<td>${escapeHtml(val)}</td>`;
      }
    }
    html += "</tr>";
  }
  tbody.innerHTML = html;

  tbody.querySelectorAll("tr[data-index]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const idx = parseInt(tr.dataset.index);
      if (onRowClick) onRowClick(idx);
      tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
    });
  });

  // Clickable badge filters
  tbody.querySelectorAll(".filterable-badge").forEach((badge) => {
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      if (badge.dataset.confPreset) {
        activatePreset(badge.dataset.confPreset);
      } else {
        ensureFilter(badge.dataset.filterKey, badge.dataset.filterValue);
      }
    });
  });

  renderPagination();
}

/* ── Pagination ── */

function renderPagination() {
  const el = document.getElementById("table-pagination");
  if (!el) return;
  const total = filteredResults.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const start = total === 0 ? 0 : currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, total);

  el.innerHTML = `
    <span class="pg-info">${total === 0 ? "Keine Eintr\u00e4ge" : `${start}\u2013${end} von ${total}`}</span>
    <div class="pg-spacer"></div>
    <button class="pg-btn" id="pg-first" title="Erste Seite" ${currentPage === 0 ? "disabled" : ""}>\u00ab</button>
    <button class="pg-btn" id="pg-prev" title="Vorherige Seite" ${currentPage === 0 ? "disabled" : ""}>\u2039</button>
    <div class="pg-pages" id="pg-pages"></div>
    <button class="pg-btn" id="pg-next" title="N\u00e4chste Seite" ${currentPage >= totalPages - 1 ? "disabled" : ""}>\u203a</button>
    <button class="pg-btn" id="pg-last" title="Letzte Seite" ${currentPage >= totalPages - 1 ? "disabled" : ""}>\u00bb</button>
    <div class="pg-spacer"></div>
    <select class="pg-size-select" id="pg-size-select" title="Zeilen pro Seite">
      <option value="10" ${pageSize === 10 ? "selected" : ""}>10 / Seite</option>
      <option value="25" ${pageSize === 25 ? "selected" : ""}>25 / Seite</option>
      <option value="50" ${pageSize === 50 ? "selected" : ""}>50 / Seite</option>
      <option value="100" ${pageSize === 100 ? "selected" : ""}>100 / Seite</option>
    </select>
  `;

  // Page number buttons
  const pagesEl = document.getElementById("pg-pages");
  const range = pageRange(currentPage, totalPages, 5);
  for (const p of range) {
    if (p === "\u2026") {
      const span = document.createElement("span");
      span.className = "pg-ellipsis";
      span.textContent = "\u2026";
      pagesEl.appendChild(span);
    } else {
      const btn = document.createElement("button");
      btn.className = "pg-btn" + (p === currentPage ? " pg-active" : "");
      btn.textContent = p + 1;
      btn.addEventListener("click", () => { currentPage = p; renderBody(); });
      pagesEl.appendChild(btn);
    }
  }

  // Navigation buttons
  document.getElementById("pg-first").addEventListener("click", () => { currentPage = 0; renderBody(); });
  document.getElementById("pg-prev").addEventListener("click", () => { if (currentPage > 0) { currentPage--; renderBody(); } });
  document.getElementById("pg-next").addEventListener("click", () => { if (currentPage < totalPages - 1) { currentPage++; renderBody(); } });
  document.getElementById("pg-last").addEventListener("click", () => { currentPage = totalPages - 1; renderBody(); });

  // Page size dropdown
  document.getElementById("pg-size-select").addEventListener("change", (e) => {
    pageSize = +e.target.value;
    currentPage = 0;
    renderBody();
  });
}

/** Smart page range with ellipsis */
function pageRange(current, total, window) {
  if (total <= window + 2) return Array.from({ length: total }, (_, i) => i);
  const half = Math.floor(window / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total - 2, start + window - 1);
  if (end - start < window - 1) start = Math.max(1, end - window + 1);
  const pages = [0];
  if (start > 1) pages.push("\u2026");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 2) pages.push("\u2026");
  pages.push(total - 1);
  return pages;
}

/* ── Public ── */

export function highlightRow(index) {
  const pos = filteredResults.findIndex((r) => r._index === index);
  if (pos >= 0) {
    const targetPage = Math.floor(pos / pageSize);
    if (targetPage !== currentPage) {
      currentPage = targetPage;
      renderBody();
    }
  }

  const tbody = document.querySelector("#results-table tbody");
  if (!tbody) return;
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.index === String(index));
    if (tr.dataset.index === String(index)) {
      tr.scrollIntoView({ block: "nearest" });
    }
  });
}

/* ── Resize handle ── */
(function initResizeHandle() {
  const handle = document.getElementById("tbl-resize-handle");
  if (!handle) return;

  const MIN_H = 120;
  const MAX_FRAC = 0.75;

  handle.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);

    const panel = document.getElementById("results-table-container");
    if (!panel) return;

    const startY = ev.clientY;
    const startH = panel.offsetHeight;

    handle.classList.add("dragging");
    document.body.classList.add("resizing");

    function onMove(e) {
      const delta = startY - e.clientY;
      const maxH = window.innerHeight * MAX_FRAC;
      const newH = Math.min(maxH, Math.max(MIN_H, startH + delta));
      panel.style.height = newH + "px";
      resizeMap();
    }

    function onUp() {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.classList.remove("dragging");
      document.body.classList.remove("resizing");
      resizeMap();
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
})();
