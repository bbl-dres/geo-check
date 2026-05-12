/* ── ÖREB Parcel Search App ── */

import { initLang, setLang, getLang, t, translatePage } from "./i18n.js";

const API_BASE = "https://api3.geo.admin.ch/rest/services/ech/MapServer";
const LAYER = "ch.swisstopo-vd.stand-oerebkataster";
const PAGE_SIZE = 20;
const FETCH_TIMEOUT = 10_000; // 10s

// i18n status field mapping
const STATUS_FIELD = { de: "oereb_status_de", fr: "oereb_status_fr", it: "oereb_status_it" };

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
let allResults = [];
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

// ── Init ──
initLang();
populateKantone();

form.addEventListener("submit", handleSearch);
form.addEventListener("reset", handleReset);
pagePrev.addEventListener("click", () => changePage(-1));
pageNext.addEventListener("click", () => changePage(1));
detailClose.addEventListener("click", closeDetail);
langSelect.addEventListener("change", (e) => setLang(e.target.value));

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

function setupAutocomplete(inputId, listId, origin, extractValue) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let debounceTimer = null;
  let activeIdx = -1;
  let items = [];

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
        html: r.attrs?.label || "",
        value: extractValue(r.attrs?.label || ""),
      }));
      renderList();
    } catch { /* autocomplete is best-effort */ }
  }

  function renderList() {
    if (items.length === 0) { hideList(); return; }
    activeIdx = -1;
    list.innerHTML = items
      .map((item, i) => `<li data-idx="${i}" role="option">${item.html}</li>`)
      .join("");
    list.hidden = false;
  }

  function selectItem(idx) {
    if (idx < 0 || idx >= items.length) return;
    input.value = items[idx].value;
    hideList();
  }

  function highlightItem() {
    list.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("active", i === activeIdx);
      li.setAttribute("aria-selected", i === activeIdx);
    });
  }

  function hideList() {
    list.hidden = true;
    items = [];
    activeIdx = -1;
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

    allResults = merged;
    currentPage = 0;

    if (allResults.length === 0) {
      resultsCount.textContent = t("results.count", { n: 0 });
      resultsBody.innerHTML = `<tr><td colspan="5" class="message-box">${esc(t("results.none"))}</td></tr>`;
    } else {
      resultsCount.textContent = t("results.count", { n: allResults.length });
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

  // Click + keyboard handlers (delegated)
  resultsBody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => showDetail(tr.dataset.id));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showDetail(tr.dataset.id);
      }
    });
  });

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

  // Reflect selection in the URL before the (slower) geometry fetch,
  // so shareable links don't depend on geometry success.
  if (writeUrl) syncUrl({ replace: true });

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
      center = computeCentroid(geom);
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
  syncUrl({ replace: true });
}

// ── Reset ──
function handleReset() {
  detailAbort?.abort();
  allResults = [];
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
  submitBtn.textContent = on ? t("search.loading") : t("search.submit");
}

function showError(msg) {
  resultsPanel.hidden = false;
  resultsBody.innerHTML = `<tr><td colspan="5" class="error-box">${esc(msg)}</td></tr>`;
}

function isStatusActive(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("eingeführt") || s.includes("introduit") || s.includes("introdotto");
}

// ── Fetch with timeout ──
function fetchWithTimeout(url, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  // If an external signal is provided, forward its abort
  if (signal) {
    if (signal.aborted) { controller.abort(); clearTimeout(timeout); }
    else signal.addEventListener("abort", () => { controller.abort(); clearTimeout(timeout); });
  }

  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
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
    z: "10",
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

/**
 * Centroid of a GeoJSON Polygon/MultiPolygon as the bounding-box midpoint.
 * Returns [E, N] in the geometry's CRS (here: LV95), or null if empty.
 */
function computeCentroid(geometry) {
  if (!geometry) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (c) => {
    if (typeof c[0] === "number") {
      const [x, y] = c;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      c.forEach(visit);
    }
  };
  visit(geometry.coordinates);
  if (!isFinite(minX)) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

// ── Area calculation ──

/**
 * Compute 2D area of a GeoJSON Polygon/MultiPolygon using the shoelace formula.
 * Expects coordinates in a projected CRS (LV95 / EPSG:2056) so units are meters.
 * Returns area in m², or null if geometry is missing.
 */
function computeArea(geometry) {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === "Polygon") {
    return polygonArea(coordinates);
  }
  if (type === "MultiPolygon") {
    return coordinates.reduce((sum, poly) => sum + polygonArea(poly), 0);
  }
  return null;
}

/** Shoelace area for a polygon (outer ring minus holes). */
function polygonArea(rings) {
  let area = ringArea(rings[0]); // outer ring
  for (let i = 1; i < rings.length; i++) {
    area -= ringArea(rings[i]);  // subtract holes
  }
  return Math.abs(area);
}

/** Shoelace formula for a single ring. */
function ringArea(coords) {
  let sum = 0;
  for (let i = 0, n = coords.length; i < n; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Format area as m² or ha depending on size. */
function formatArea(m2) {
  if (m2 >= 10000) {
    return (m2 / 10000).toLocaleString("de-CH", { maximumFractionDigits: 2 }) + " ha";
  }
  return Math.round(m2).toLocaleString("de-CH") + " m²";
}

function esc(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}
