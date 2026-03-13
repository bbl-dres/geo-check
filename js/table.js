/**
 * Results table with sorting, filtering, search, column toggle, pagination
 */
import { escapeHtml, scoreClass } from "./utils.js";

let allResults = [];
let filteredResults = [];
let sortField = "match_score";
let sortAsc = false;
let statusFilter = "all";
let searchQuery = "";
let onRowClick = null;
let currentPage = 0;
const PAGE_SIZE = 100;

const COLUMNS = [
  { key: "internal_id", label: "ID", visible: true },
  { key: "gwr_egid", label: "EGID", visible: true },
  { key: "gwr_street", label: "Strasse (GWR)", visible: true },
  { key: "gwr_street_number", label: "Nr", visible: true },
  { key: "gwr_zip", label: "PLZ (GWR)", visible: true },
  { key: "gwr_city", label: "Ort (GWR)", visible: true },
  { key: "gwr_region", label: "Kt", visible: true },
  { key: "gwr_building_type", label: "Typ", visible: true },
  { key: "match_score", label: "Score", visible: true },
  { key: "gwr_match", label: "Status", visible: true }
];

function visibleCols() {
  return COLUMNS.filter((c) => c.visible);
}

export function initTable(container, clickCallback) {
  onRowClick = clickCallback;
  searchQuery = "";
  COLUMNS.forEach((c) => (c.visible = true));

  container.innerHTML = `
    <div class="table-toolbar">
      <div class="tbl-search-wrap">
        <svg class="tbl-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="tbl-search" class="tbl-search" placeholder="Suche\u2026">
        <button class="tbl-search-clear" id="tbl-search-clear" hidden>&times;</button>
      </div>
      <div class="table-filters">
        <button class="filter-btn active" data-filter="all">Alle</button>
        <button class="filter-btn" data-filter="matched">Gefunden</button>
        <button class="filter-btn" data-filter="not_found">Nicht gefunden</button>
        <button class="filter-btn" data-filter="skipped">\u00dcbersprungen</button>
      </div>
      <span class="toolbar-spacer"></span>
      <div class="export-dd-wrap" id="export-dd-wrap">
        <button class="export-dd-btn" id="export-dd-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="export-dd-menu" id="export-dd-menu" hidden>
          <button class="export-dd-item" id="btn-csv">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            CSV herunterladen
          </button>
          <button class="export-dd-item" id="btn-xlsx">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Excel herunterladen
          </button>
          <button class="export-dd-item" id="btn-geojson">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            GeoJSON herunterladen
          </button>
        </div>
      </div>
      <div class="col-dd-wrap" id="col-dd-wrap">
        <button class="col-dd-btn" id="col-dd-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Spalten
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="col-dd-menu" id="col-dd-menu" hidden></div>
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
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClear.hidden = true;
    applyFilter();
    renderBody();
  });

  // Filter buttons
  container.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      statusFilter = btn.dataset.filter;
      applyFilter();
      renderBody();
    });
  });

  // Column toggle dropdown
  initColumnDropdown();

  // Export dropdown
  initExportDropdown();
}

function initExportDropdown() {
  const btn = document.getElementById("export-dd-btn");
  const menu = document.getElementById("export-dd-menu");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("export-dd-wrap").contains(e.target)) {
      menu.hidden = true;
    }
  });

  // Close after clicking an item
  menu.querySelectorAll(".export-dd-item").forEach((item) => {
    item.addEventListener("click", () => { menu.hidden = true; });
  });
}

function initColumnDropdown() {
  const btn = document.getElementById("col-dd-btn");
  const menu = document.getElementById("col-dd-menu");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("col-dd-wrap").contains(e.target)) {
      menu.hidden = true;
    }
  });

  renderColumnMenu();
}

function renderColumnMenu() {
  const menu = document.getElementById("col-dd-menu");
  let html = "";
  for (const col of COLUMNS) {
    html += `<label class="col-dd-item">
      <input type="checkbox" data-col="${col.key}" ${col.visible ? "checked" : ""}>
      ${escapeHtml(col.label)}
    </label>`;
  }
  menu.innerHTML = html;

  menu.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const col = COLUMNS.find((c) => c.key === cb.dataset.col);
      if (col) col.visible = cb.checked;
      renderHeader();
      renderBody();
    });
  });
}

export function populateTable(results) {
  allResults = results.map((r, i) => ({ ...r, _index: i }));
  applyFilter();
  renderHeader();
  renderBody();
}

function applyFilter() {
  if (statusFilter === "all") {
    filteredResults = [...allResults];
  } else {
    filteredResults = allResults.filter((r) => r.gwr_match === statusFilter);
  }

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

function renderHeader() {
  const cols = visibleCols();
  const thead = document.querySelector("#results-table thead");
  let html = "<tr>";
  for (const col of cols) {
    const arrow = sortField === col.key ? (sortAsc ? " \u25b2" : " \u25bc") : "";
    html += `<th class="sortable" data-field="${col.key}">${escapeHtml(col.label)}${arrow}</th>`;
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

  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  const start = currentPage * PAGE_SIZE;
  const pageRows = filteredResults.slice(start, start + PAGE_SIZE);

  let html = "";
  for (const row of pageRows) {
    html += `<tr data-index="${row._index}">`;
    for (const col of cols) {
      const val = row[col.key] ?? "";
      if (col.key === "match_score" && val !== "") {
        html += `<td><span class="score-badge ${scoreClass(Number(val))}">${escapeHtml(val)}%</span></td>`;
      } else if (col.key === "gwr_match") {
        html += `<td><span class="status-badge status-${val}">${escapeHtml(val)}</span></td>`;
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

  renderPagination();
}

function renderPagination() {
  const el = document.getElementById("table-pagination");
  if (!el) return;
  const total = filteredResults.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (totalPages <= 1) {
    el.innerHTML = `<span class="page-info">${total} Zeilen</span>`;
    return;
  }

  const start = currentPage * PAGE_SIZE + 1;
  const end = Math.min(start + PAGE_SIZE - 1, total);

  el.innerHTML = `
    <button class="page-btn" id="page-prev" ${currentPage === 0 ? "disabled" : ""}>&#8249;</button>
    <span class="page-info">${start}\u2013${end} von ${total}</span>
    <button class="page-btn" id="page-next" ${currentPage >= totalPages - 1 ? "disabled" : ""}>&#8250;</button>
  `;

  document.getElementById("page-prev").addEventListener("click", () => {
    if (currentPage > 0) { currentPage--; renderBody(); }
  });
  document.getElementById("page-next").addEventListener("click", () => {
    if (currentPage < totalPages - 1) { currentPage++; renderBody(); }
  });
}

export function highlightRow(index) {
  const pos = filteredResults.findIndex((r) => r._index === index);
  if (pos >= 0) {
    const targetPage = Math.floor(pos / PAGE_SIZE);
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
