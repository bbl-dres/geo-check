/* ── ÖREB Parcel Search App ── */

import { initLang, setLang, getLang, t, translatePage } from "./i18n.js";
import {
  API_BASE, LAYER, STATUS_FIELD,
  fetchWithTimeout, isStatusActive, computeArea, esc,
} from "./oereb-api.js";
import { computeVisualCenter } from "./geometry.js";
import { initBatch } from "./batch.js";

const PAGE_SIZE = 20;

// swisstopo's find operation caps each query at 100 results, with no paging or
// total count and ignoring an explicit `limit` (both verified empirically).
// We surface a notice when a query hits the cap.
const FIND_LIMIT = 100;

// Search field priority (most specific first)
const SEARCH_FIELDS = [
  { id: "field-egrid",    apiField: "egris_egrid",  contains: true  },
  { id: "field-nummer",   apiField: "number",       contains: true  },
  { id: "field-bfsnr",    apiField: "bfs_nr",       contains: true  },
  { id: "field-plz",      apiField: "plz",          contains: true  },
  { id: "field-gemeinde", apiField: "gemeindename", contains: true  },
  { id: "field-kanton",   apiField: "kanton",       contains: true  },
];

// ── State ──
let allResults = [];          // currently displayed result set (search OR batch)
let searchResults = [];       // the search mask's own last result set
let externalResults = false;  // true while `allResults` is driven by batch mode
let currentPage = 0;
let selectedId = null;
let detailAbort = null; // AbortController for in-flight detail fetch

// ── DOM refs ──
const form = document.getElementById("search-form");
const resultsPanel = document.getElementById("results-panel");
const resultsBody = document.getElementById("results-body");
const resultsCount = document.getElementById("results-count");
const pagination = document.getElementById("pagination");
const pageInfo = document.getElementById("page-info");
const pagePrev = document.getElementById("page-prev");
const pageNext = document.getElementById("page-next");
const detailPanel = document.getElementById("detail-panel");
const detailBody = document.getElementById("detail-body");
const detailClose = document.getElementById("detail-close");
const submitBtn = form.querySelector('button[type="submit"]');
const langSelect = document.getElementById("lang-select");
const resultsDownload = document.getElementById("results-download"); // batch-only header button

// ── Init ──
initLang();
populateKantone();

// Batch mode renders its found parcels into the SAME results/detail panels as
// the search mask (see showResults/clearResults below).
const batchApi = initBatch({ showResults, clearResults });
setupModeTabs(batchApi);

form.addEventListener("submit", handleSearch);
form.addEventListener("reset", handleReset);
pagePrev.addEventListener("click", () => changePage(-1));
pageNext.addEventListener("click", () => changePage(1));
detailClose.addEventListener("click", closeDetail);
langSelect.addEventListener("change", (e) => setLang(e.target.value));

// The results table is re-rendered as innerHTML on every page, so bind row
// interaction once on the persistent tbody via delegation (not per-row).
resultsBody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr) showDetail(tr.dataset.id);
});
resultsBody.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  e.preventDefault();
  showDetail(tr.dataset.id);
});

// ── Mode tabs (search mask ↔ batch CSV) ──
function setupModeTabs(batch) {
  const tabs = [...document.querySelectorAll(".mode-tab")];
  const panels = {
    search: document.getElementById("mode-search"),
    batch: document.getElementById("mode-batch"),
  };

  // Activate a tab: update ARIA selection + roving tabindex, toggle panels,
  // re-point the shared results view, and (on keyboard nav) move focus.
  function activateTab(tab, { focus = false } = {}) {
    const mode = tab.dataset.mode;
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1; // roving tabindex (WAI-ARIA tabs pattern)
    });
    for (const [key, panel] of Object.entries(panels)) {
      if (panel) panel.hidden = key !== mode;
    }
    if (focus) tab.focus();
    if (mode === "search") showSearchResults();
    else batch.rerender();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activateTab(tab));
    // Arrow / Home / End move between tabs with automatic activation.
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      activateTab(next, { focus: true });
    });
  });
}

// ── Shared results plumbing (used by both the search mask and batch mode) ──

// Re-render the search mask's own result set into the shared panels.
function showSearchResults() {
  externalResults = false;
  allResults = searchResults;
  selectedId = null;
  currentPage = 0;
  clearDetailUi();
  resultsDownload.hidden = true; // search results have no download
  if (!searchResults.length) {
    resultsPanel.hidden = true;
    return;
  }
  resultsPanel.hidden = false;
  resultsCount.textContent = t("results.count", { n: searchResults.length });
  renderPage();
}

// Show an externally-produced result set (batch mode) in the shared panels.
// `results` are { featureId, attributes } like the search results; `countText`
// is the pre-formatted summary shown in the results header.
function showResults(results, countText) {
  detailAbort?.abort();
  externalResults = true;
  allResults = results;
  selectedId = null;
  currentPage = 0;
  detailPanel.hidden = true;
  resultsPanel.hidden = false;
  resultsDownload.hidden = false; // batch results are downloadable (incl. failed rows)
  resultsCount.textContent = countText;
  if (results.length === 0) {
    pagination.hidden = true;
    resultsBody.innerHTML = `<tr><td colspan="5" class="message-box">${esc(t("results.none"))}</td></tr>`;
  } else {
    renderPage();
  }
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Hide + forget the shared result set (batch leaving the done state, mode switch).
function clearResults() {
  detailAbort?.abort();
  externalResults = false;
  allResults = [];
  selectedId = null;
  currentPage = 0;
  resultsPanel.hidden = true;
  detailPanel.hidden = true;
  resultsDownload.hidden = true;
}

// Re-render dynamic content on language change
window.addEventListener("langchange", () => {
  if (allResults.length > 0) renderPage();
  if (selectedId) showDetail(selectedId, { writeUrl: false });
});

// Restore state from URL (filters + selected EGRID) on initial load and on
// browser back/forward.
window.addEventListener("popstate", () => bootstrapFromUrl());
bootstrapFromUrl();

// ── Autocomplete ──
const SEARCH_API = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";

setupAutocomplete("field-gemeinde", "ac-gemeinde", "gg25", (label) => {
  // "<b>Bern</b> (BE)" → "Bern"
  return label.replace(/<\/?b>/g, "").replace(/\s*\(.*\)\s*$/, "").trim();
});

setupAutocomplete("field-plz", "ac-plz", "zipcode", (label) => {
  // "<b>3013</b> - Bern" → "3013"
  return label.replace(/<\/?b>/g, "").replace(/\s*-.*$/, "").trim();
});

// Allow only the <b> match-highlight tags from the SearchServer label; escape
// everything else so a compromised/unexpected API response can't inject markup.
function safeLabel(label) {
  return esc(label).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
}

function setupAutocomplete(inputId, listId, origin, extractValue) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let debounceTimer = null;
  let activeIdx = -1;
  let items = [];

  // ARIA 1.2 combobox wiring (the input owns the listbox popup).
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) { hideList(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(query), 200);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      highlightItem();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      highlightItem();
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectItem(activeIdx);
    } else if (e.key === "Escape") {
      hideList();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(hideList, 150);
  });

  // Event delegation on list (avoids re-attaching listeners on each render)
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const li = e.target.closest("li[data-idx]");
    if (li) selectItem(Number(li.dataset.idx));
  });

  async function fetchSuggestions(query) {
    try {
      const params = new URLSearchParams({
        searchText: query,
        type: "locations",
        origins: origin,
        limit: 8,
      });
      const res = await fetch(`${SEARCH_API}?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      items = (data.results || []).map((r) => ({
        html: safeLabel(r.attrs?.label || ""),
        value: extractValue(r.attrs?.label || ""),
      }));
      renderList();
    } catch { /* autocomplete is best-effort */ }
  }

  function renderList() {
    if (items.length === 0) { hideList(); return; }
    activeIdx = -1;
    list.innerHTML = items
      .map((item, i) => `<li id="${listId}-opt-${i}" data-idx="${i}" role="option" aria-selected="false">${item.html}</li>`)
      .join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.removeAttribute("aria-activedescendant");
  }

  function selectItem(idx) {
    if (idx < 0 || idx >= items.length) return;
    input.value = items[idx].value;
    hideList();
  }

  function highlightItem() {
    list.querySelectorAll("li").forEach((li, i) => {
      const active = i === activeIdx;
      li.classList.toggle("active", active);
      li.setAttribute("aria-selected", String(active));
    });
    if (activeIdx >= 0) input.setAttribute("aria-activedescendant", `${listId}-opt-${activeIdx}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function hideList() {
    list.hidden = true;
    items = [];
    activeIdx = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
}

// ── Kanton dropdown (values match API's kanton field exactly) ──
function populateKantone() {
  const kantone = [
    "Aargau", "Appenzell Ausserrhoden", "Appenzell Innerrhoden",
    "Basel-Landschaft", "Basel-Stadt", "Bern", "Fribourg", "Genève",
    "Glarus", "Graubünden", "Jura", "Luzern", "Neuchâtel", "Nidwalden",
    "Obwalden", "Schaffhausen", "Schwyz", "Solothurn", "St. Gallen",
    "Thurgau", "Ticino", "Uri", "Valais", "Vaud", "Zug", "Zürich",
  ];
  const select = document.getElementById("field-kanton");
  kantone.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    select.appendChild(opt);
  });
}

// ── Search ──
async function handleSearch(e, { writeUrl = true } = {}) {
  e?.preventDefault();
  clearDetailUi();

  // Collect filled fields (priority order)
  const queries = [];
  for (const sf of SEARCH_FIELDS) {
    const el = document.getElementById(sf.id);
    const val = el.value.trim();
    if (val) {
      queries.push({ ...sf, value: val });
    }
  }

  if (queries.length === 0) {
    showError(t("search.error.empty"));
    return;
  }

  setLoading(true);
  resultsPanel.hidden = false;
  resultsBody.innerHTML = "";
  resultsCount.textContent = "";
  pagination.hidden = true;

  try {
    // Fire all non-empty field queries in parallel
    const responses = await Promise.all(queries.map((q) => fetchFind(q)));

    // Intersect results by featureId across all queries
    let merged = responses[0];
    for (let i = 1; i < responses.length; i++) {
      const ids = new Set(responses[i].map((r) => r.featureId));
      merged = merged.filter((r) => ids.has(r.featureId));
    }

    searchResults = merged;
    allResults = merged;
    externalResults = false;
    currentPage = 0;
    resultsDownload.hidden = true;

    // Each field query is capped at FIND_LIMIT with no paging/total, so if any
    // hit the cap the (possibly intersected) result may be incomplete — and an
    // intersection against a truncated set can even yield a false "0 results".
    const note = responses.some((r) => r.length >= FIND_LIMIT)
      ? " · " + t("results.truncated")
      : "";
    if (allResults.length === 0) {
      resultsCount.textContent = t("results.count", { n: 0 }) + note;
      resultsBody.innerHTML = `<tr><td colspan="5" class="message-box">${esc(t("results.none"))}</td></tr>`;
    } else {
      resultsCount.textContent = t("results.count", { n: allResults.length }) + note;
      renderPage();
    }
    if (writeUrl) syncUrl({ replace: false });
  } catch (err) {
    console.error(err);
    showError(t("search.error.api"));
  } finally {
    setLoading(false);
  }
}

async function fetchFind({ apiField, value, contains }) {
  const params = new URLSearchParams({
    layer: LAYER,
    searchText: value,
    searchField: apiField,
    contains: String(contains),
    returnGeometry: "false",
  });

  const res = await fetchWithTimeout(`${API_BASE}/find?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

// ── Rendering ──
function renderPage() {
  const lang = getLang();
  const start = currentPage * PAGE_SIZE;
  const page = allResults.slice(start, start + PAGE_SIZE);
  const statusField = STATUS_FIELD[lang] || STATUS_FIELD.de;

  resultsBody.innerHTML = page
    .map((r) => {
      const a = r.attributes;
      const isActive = isStatusActive(a[statusField]);
      const sel = r.featureId === selectedId ? " selected" : "";
      return `<tr data-id="${r.featureId}" tabindex="0" class="${sel}">
        <td class="egrid-cell">${esc(a.egris_egrid || "—")}</td>
        <td>${esc(a.gemeindename || "—")}</td>
        <td>${esc(String(a.number ?? "—"))}</td>
        <td>${esc(a.realestate_type || "—")}</td>
        <td><span class="status-badge ${isActive ? "active" : "inactive"}">${esc(isActive ? t("status.active") : t("status.inactive"))}</span></td>
      </tr>`;
    })
    .join("");

  // Row click/keyboard is handled once via delegation on resultsBody (see init).

  // Pagination
  const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
  if (totalPages > 1) {
    pagination.hidden = false;
    pageInfo.textContent = t("results.page", { current: currentPage + 1, total: totalPages });
    pagePrev.disabled = currentPage === 0;
    pageNext.disabled = currentPage >= totalPages - 1;
  } else {
    pagination.hidden = true;
  }
}

function changePage(delta) {
  const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
  currentPage = Math.max(0, Math.min(currentPage + delta, totalPages - 1));
  renderPage();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Detail ──
async function showDetail(featureId, { writeUrl = true } = {}) {
  const result = allResults.find((r) => String(r.featureId) === String(featureId));
  if (!result) return;

  // Cancel any in-flight detail fetch
  detailAbort?.abort();
  detailAbort = new AbortController();
  const { signal } = detailAbort;

  selectedId = featureId;
  resultsBody.querySelectorAll("tr").forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.id === String(featureId));
  });

  // Reflect selection in the URL before the (slower) geometry fetch, so
  // shareable links don't depend on geometry success. Batch results aren't
  // URL-backed, so skip URL writes when showing an external result set.
  if (writeUrl && !externalResults) syncUrl({ replace: true });

  const a = result.attributes;
  const lang = getLang();
  const statusField = STATUS_FIELD[lang] || STATUS_FIELD.de;

  // Fetch geometry on demand for area calculation and map centering
  let area = null;
  let center = null; // [E, N] in LV95 (EPSG:2056)
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/${LAYER}/${featureId}?geometryFormat=geojson&sr=2056`,
      signal
    );
    if (res.ok) {
      const data = await res.json();
      const geom = data.feature?.geometry;
      area = computeArea(geom);
      center = computeVisualCenter(geom);
    }
  } catch (err) {
    if (err.name === "AbortError") return; // superseded by newer click
  }

  // Guard: user may have clicked another row while we were fetching
  if (selectedId !== featureId) return;

  detailBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.egrid"))}</span>
        <span class="detail-value mono">${esc(a.egris_egrid || "—")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.nummer"))}</span>
        <span class="detail-value">${esc(String(a.number ?? "—"))}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.gemeinde"))}</span>
        <span class="detail-value">${esc(a.gemeindename || "—")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.kanton"))}</span>
        <span class="detail-value">${esc(a.kanton || "—")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.bfsnr"))}</span>
        <span class="detail-value">${esc(String(a.bfs_nr ?? "—"))}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.plzort"))}</span>
        <span class="detail-value">${esc(String(a.plz ?? ""))} ${esc(a.ort || "")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.typ"))}</span>
        <span class="detail-value">${esc(a.realestate_type || "—")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.area"))}</span>
        <span class="detail-value">${area != null ? formatArea(area) : "—"}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.status"))}</span>
        <span class="detail-value">${esc(a[statusField] || "—")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.kontakt"))}</span>
        <span class="detail-value">${validEmail(a.email) ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : esc(a.email || "—")}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">${esc(t("detail.telefon"))}</span>
        <span class="detail-value">${esc(a.telefon || "—")}</span>
      </div>
    </div>
    <div class="detail-links">
      ${safeUrl(a.oereb_extract_pdf) ? `<a class="detail-link" href="${esc(a.oereb_extract_pdf)}" target="_blank" rel="noopener">${esc(t("detail.extract_pdf"))}</a>` : ""}
      ${safeUrl(a.oereb_extract_url) ? `<a class="detail-link" href="${esc(a.oereb_extract_url)}" target="_blank" rel="noopener">${esc(t("detail.extract_url"))}</a>` : ""}
      ${safeUrl(a.url_oereb) ? `<a class="detail-link" href="${esc(a.url_oereb)}" target="_blank" rel="noopener">${esc(t("detail.geoportal"))}</a>` : ""}
      ${safeUrl(a.oereb_webservice) ? `<a class="detail-link" href="${esc(a.oereb_webservice)}" target="_blank" rel="noopener">${esc(t("detail.webservice"))}</a>` : ""}
    </div>
    ${center ? renderMap(center, lang) : ""}
  `;

  detailPanel.hidden = false;
  detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Internal: clear detail-panel UI without touching the URL. Used when we're
// about to write the URL ourselves (e.g. starting a new search), or when
// we're reacting *to* a URL change (popstate / bootstrap).
function clearDetailUi() {
  detailAbort?.abort();
  detailPanel.hidden = true;
  selectedId = null;
  resultsBody.querySelectorAll("tr.selected").forEach((tr) => tr.classList.remove("selected"));
}

function closeDetail() {
  clearDetailUi();
  if (!externalResults) syncUrl({ replace: true });
}

// ── Reset ──
function handleReset() {
  detailAbort?.abort();
  allResults = [];
  searchResults = [];
  externalResults = false;
  currentPage = 0;
  selectedId = null;
  resultsPanel.hidden = true;
  detailPanel.hidden = true;
  // The browser clears the form fields after this handler returns, so defer
  // the URL sync until the form is actually empty.
  queueMicrotask(() => syncUrl({ replace: true }));
}

// ── UI helpers ──
function setLoading(on) {
  submitBtn.classList.toggle("loading", on);
  submitBtn.setAttribute("aria-busy", String(on));
  submitBtn.textContent = on ? t("search.loading") : t("search.submit");
}

function showError(msg) {
  resultsPanel.hidden = false;
  resultsBody.innerHTML = `<tr><td colspan="5" class="error-box">${esc(msg)}</td></tr>`;
}

// ── Validation helpers ──
function safeUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validEmail(email) {
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── URL state (shareable links) ──
//
// We mirror the search form + selected parcel in `?` query params so any
// page state can be reproduced by pasting the URL.
//   - Filter params share names with the form field IDs (kanton, gemeinde,
//     bfsnr, egrid, nummer, plz)
//   - `selected` holds the EGRID of the open detail panel (federal-level
//     stable ID — survives swisstopo data refreshes; featureId would not)
//   - `lang` is owned by i18n.js and we leave it alone

const FILTER_PARAMS = SEARCH_FIELDS.map((sf) => ({
  key: sf.id.replace(/^field-/, ""),
  fieldId: sf.id,
}));

function syncUrl({ replace = false } = {}) {
  const params = new URLSearchParams(window.location.search);

  for (const { key, fieldId } of FILTER_PARAMS) {
    const val = document.getElementById(fieldId).value.trim();
    if (val) params.set(key, val);
    else params.delete(key);
  }

  const selectedEgrid = selectedId
    ? allResults.find((r) => String(r.featureId) === String(selectedId))
        ?.attributes?.egris_egrid
    : null;
  if (selectedEgrid) params.set("selected", selectedEgrid);
  else params.delete("selected");

  const qs = params.toString();
  const url = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

async function bootstrapFromUrl() {
  const params = new URLSearchParams(window.location.search);

  let hasFilters = false;
  for (const { key, fieldId } of FILTER_PARAMS) {
    const val = params.get(key) || "";
    document.getElementById(fieldId).value = val;
    if (val) hasFilters = true;
  }

  const selectedEgrid = params.get("selected");

  // Deep-link: `?selected=<egrid>` alone is a useful share format, so seed the
  // EGRID field with it and run the search to find the parcel.
  if (!hasFilters && selectedEgrid) {
    document.getElementById("field-egrid").value = selectedEgrid;
    hasFilters = true;
  }

  if (!hasFilters) {
    // URL has no filters → ensure the UI matches (e.g. after pressing back
    // past the initial search).
    clearDetailUi();
    allResults = [];
    currentPage = 0;
    resultsPanel.hidden = true;
    return;
  }

  await handleSearch(null, { writeUrl: false });

  if (!selectedEgrid || allResults.length === 0) return;

  const idx = allResults.findIndex(
    (r) => r.attributes?.egris_egrid === selectedEgrid
  );
  if (idx < 0) return;

  currentPage = Math.floor(idx / PAGE_SIZE);
  renderPage();
  showDetail(allResults[idx].featureId, { writeUrl: false });
}

// ── Map embed (map.geo.admin.ch iframe) ──

/**
 * Build the embedded swisstopo map iframe for a parcel.
 * center: [E, N] in LV95 (EPSG:2056). lang: "de" | "fr" | "it".
 */
function renderMap(center, lang) {
  const params = new URLSearchParams({
    lang,
    center: `${center[0].toFixed(1)},${center[1].toFixed(1)}`,
    z: "13",
    bgLayer: "ch.swisstopo.pixelkarte-grau",
    layers: LAYER,
    crosshair: "marker",
  });
  // map.geo.admin.ch uses hash-based routing (#/embed?...)
  const src = `https://map.geo.admin.ch/#/embed?${params}`;
  return `
    <div class="detail-map">
      <h3 class="detail-map-heading">${esc(t("detail.map"))}</h3>
      <iframe class="detail-map-frame"
              src="${src}"
              loading="lazy"
              title="${esc(t("detail.map"))}"
              allow="geolocation"></iframe>
    </div>
  `;
}

// ── Area formatting ──

/** Format area as m² or ha depending on size. */
function formatArea(m2) {
  if (m2 >= 10000) {
    return (m2 / 10000).toLocaleString("de-CH", { maximumFractionDigits: 2 }) + " ha";
  }
  return Math.round(m2).toLocaleString("de-CH") + " m²";
}
