/* ── GWR Building Search App ── */

import { initLang, setLang, getLang, t, translatePage } from "./i18n.js";
import {
  API_BASE, LAYER,
  fetchWithTimeout, normalizePoint, isExisting, lv95ToWgs84, esc,
} from "./gwr-api.js";
import { loadCodes, resolveCode } from "./gwr-codes.js";
import { initBatch } from "./batch.js";

const PAGE_SIZE = 20;

// swisstopo's find operation caps each query (~200 features) with no paging or
// total count. We surface a notice when a query hits the cap.
const FIND_LIMIT = 200;

// Search field priority (most specific first). `contains:false` = exact match.
const SEARCH_FIELDS = [
  { id: "field-egid",     apiField: "egid",     contains: false },
  { id: "field-strasse",  apiField: "strname",  contains: true  },
  { id: "field-hausnr",   apiField: "deinr",    contains: false },
  { id: "field-gemeinde", apiField: "ggdename", contains: true  },
  { id: "field-bfsnr",    apiField: "ggdenr",   contains: false },
  { id: "field-plz",      apiField: "dplz4",    contains: false },
  { id: "field-kanton",   apiField: "gdekt",    contains: false },
];

// Broad categorical fields: used as client-side filters when an identifying
// field (EGID/address) is present, or as API queries when searched alone.
// `match(value, attributes)` mirrors the API's matching (contains vs exact).
const CATEGORICAL_FIELDS = [
  { id: "field-gemeinde", apiField: "ggdename", contains: true,  match: (v, a) => (a.ggdename || "").toLowerCase().includes(v.toLowerCase()) },
  { id: "field-bfsnr",    apiField: "ggdenr",   contains: false, match: (v, a) => String(a.ggdenr ?? "") === v },
  { id: "field-plz",      apiField: "dplz4",    contains: false, match: (v, a) => String(a.dplz4 ?? "") === v },
  { id: "field-kanton",   apiField: "gdekt",    contains: false, match: (v, a) => (a.gdekt || "") === v },
];

// ── State ──
let allResults = [];          // currently displayed result set (search OR batch)
let searchResults = [];       // the search mask's own last result set
let externalResults = false;  // true while `allResults` is driven by batch mode
let currentPage = 0;
let selectedId = null;

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
// Coded GWR fields (category, status, …) resolve to labels via this table; load
// it up front so the first render already shows readable text.
await loadCodes();

// Batch mode renders its found buildings into the SAME results/detail panels as
// the search mask (see showResults/clearResults below).
const batchApi = initBatch({ showResults, clearResults });
setupModeTabs(batchApi);

form.addEventListener("submit", handleSearch);
form.addEventListener("reset", handleReset);
pagePrev.addEventListener("click", () => changePage(-1));
pageNext.addEventListener("click", () => changePage(1));
detailClose.addEventListener("click", closeDetail);
langSelect.addEventListener("change", (e) => setLang(e.target.value));

// Map background switcher (delegated; the detail body is re-rendered on each open).
detailBody.addEventListener("click", onMapBasemapClick);

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
// `results` are { featureId, attributes, geometry } like the search results;
// `countText` is the pre-formatted summary shown in the results header.
function showResults(results, countText) {
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

// Restore state from URL (filters + selected EGID) on initial load and on
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

// ── Kanton dropdown (values are the 2-letter codes the API's `gdekt` uses) ──
function populateKantone() {
  const kantone = [
    ["AG", "Aargau"], ["AI", "Appenzell Innerrhoden"], ["AR", "Appenzell Ausserrhoden"],
    ["BE", "Bern"], ["BL", "Basel-Landschaft"], ["BS", "Basel-Stadt"], ["FR", "Fribourg"],
    ["GE", "Genève"], ["GL", "Glarus"], ["GR", "Graubünden"], ["JU", "Jura"], ["LU", "Luzern"],
    ["NE", "Neuchâtel"], ["NW", "Nidwalden"], ["OW", "Obwalden"], ["SG", "St. Gallen"],
    ["SH", "Schaffhausen"], ["SO", "Solothurn"], ["SZ", "Schwyz"], ["TG", "Thurgau"],
    ["TI", "Ticino"], ["UR", "Uri"], ["VD", "Vaud"], ["VS", "Valais"], ["ZG", "Zug"], ["ZH", "Zürich"],
  ];
  const select = document.getElementById("field-kanton");
  kantone.forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} — ${name}`;
    select.appendChild(opt);
  });
}

// ── Search ──
async function handleSearch(e, { writeUrl = true } = {}) {
  e?.preventDefault();
  clearDetailUi();

  // ── Collect inputs ──
  // Identifying fields (EGID, address) drive the query; they return a bounded
  // result set. Broad categorical fields (municipality, BFS-nr, PLZ, canton)
  // are each capped at FIND_LIMIT on their own, so when an identifying field is
  // present we apply them as CLIENT-SIDE filters on the bounded set instead of
  // a capped API intersection (which could drop the wanted building).
  const specific = [];

  // Address: a bare house-number query (searchField=deinr) matches every "2" in
  // the country and gets capped — so when a number is given we query the
  // combined `strname_deinr` field ("Beaulieustrasse 2"); street-only queries
  // the `strname` field.
  const strasse = document.getElementById("field-strasse").value.trim();
  const hausnr = document.getElementById("field-hausnr").value.trim();
  if (hausnr) specific.push({ apiField: "strname_deinr", value: `${strasse} ${hausnr}`.trim(), contains: true });
  else if (strasse) specific.push({ apiField: "strname", value: strasse, contains: true });

  const egidVal = document.getElementById("field-egid").value.trim();
  if (egidVal) specific.push({ apiField: "egid", value: egidVal, contains: false });

  const cats = [];
  for (const cf of CATEGORICAL_FIELDS) {
    const v = document.getElementById(cf.id).value.trim();
    if (v) cats.push({ ...cf, value: v });
  }

  if (specific.length === 0 && cats.length === 0) {
    showError(t("search.error.empty"));
    return;
  }

  setLoading(true);
  resultsPanel.hidden = false;
  resultsBody.innerHTML = "";
  resultsCount.textContent = "";
  pagination.hidden = true;

  try {
    let responses, merged;
    if (specific.length) {
      // Identifying queries on the API, intersected; categorical fields filter
      // the bounded set client-side.
      responses = await Promise.all(specific.map((q) => fetchFind(q)));
      merged = intersectByFeatureId(responses);
      for (const cf of cats) merged = merged.filter((r) => cf.match(cf.value, r.attributes));
    } else {
      // Categorical-only search: must hit the API for each (each may be capped).
      responses = await Promise.all(cats.map((cf) =>
        fetchFind({ apiField: cf.apiField, value: cf.value, contains: cf.contains })));
      merged = intersectByFeatureId(responses);
    }

    searchResults = merged;
    allResults = merged;
    externalResults = false;
    currentPage = 0;
    resultsDownload.hidden = true;

    // Each API query is capped at FIND_LIMIT with no paging/total, so if any hit
    // the cap the result may be incomplete — and an intersection against a
    // truncated set can even yield a false "0 results".
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

// Intersect result sets by featureId (a building present in all of them).
function intersectByFeatureId(responses) {
  if (!responses.length) return [];
  let merged = responses[0];
  for (let i = 1; i < responses.length; i++) {
    const ids = new Set(responses[i].map((r) => r.featureId));
    merged = merged.filter((r) => ids.has(r.featureId));
  }
  return merged;
}

// One field query → normalized [{ featureId, attributes, geometry:[E,N] }].
// GWR features are points, so `find` returns the geometry inline (sr=2056) and
// no second per-result request is needed for the map / coordinates.
async function fetchFind({ apiField, value, contains }) {
  const params = new URLSearchParams({
    layer: LAYER,
    searchText: value,
    searchField: apiField,
    contains: String(contains),
    returnGeometry: "true",
    sr: "2056",
  });

  const res = await fetchWithTimeout(`${API_BASE}/find?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    featureId: r.featureId ?? r.id,
    attributes: r.attributes || {},
    geometry: normalizePoint(r.geometry),
  }));
}

// ── Rendering ──
function renderPage() {
  const lang = getLang();
  const start = currentPage * PAGE_SIZE;
  const page = allResults.slice(start, start + PAGE_SIZE);

  resultsBody.innerHTML = page
    .map((r) => {
      const a = r.attributes;
      const existing = isExisting(a.gstat);
      const statusLabel = resolveCode("gstat", a.gstat, lang) || "—";
      const sel = r.featureId === selectedId ? " selected" : "";
      return `<tr data-id="${esc(String(r.featureId))}" tabindex="0" class="${sel}">
        <td class="egrid-cell">${esc(String(a.egid ?? "—"))}</td>
        <td>${esc(a.strname_deinr || "—")}</td>
        <td>${esc(a.ggdename || "—")}</td>
        <td>${esc(resolveCode("gkat", a.gkat, lang) || "—")}</td>
        <td><span class="status-badge ${existing ? "active" : "inactive"}">${esc(statusLabel)}</span></td>
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
// No network call: `find` already gave us the full attribute set and the point
// geometry, so the detail view renders synchronously from `allResults`. The
// layout mirrors the official GWR detail page (Gebäude- / Eingangs- /
// Wohnungsinformationen), grouped into sections.
function showDetail(featureId, { writeUrl = true } = {}) {
  const result = allResults.find((r) => String(r.featureId) === String(featureId));
  if (!result) return;

  selectedId = featureId;
  resultsBody.querySelectorAll("tr").forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.id === String(featureId));
  });

  // Batch results aren't URL-backed, so skip URL writes when showing an
  // external result set.
  if (writeUrl && !externalResults) syncUrl({ replace: true });

  const a = result.attributes;
  const lang = getLang();
  const center = result.geometry; // [E, N] in LV95 (EPSG:2056), or null
  const egid = a.egid != null ? String(a.egid) : "";
  const egrid = a.egrid || "";

  // Coordinates for copy-paste. Prefer the official building coordinate
  // (gkode/gkodn) over the entrance-point geometry; WGS84 is derived from it.
  const lv95 = buildingLv95(a, center);   // [E, N] or null
  const wgs = lv95 ? lv95ToWgs84(lv95) : null; // [lng, lat] or null

  // Helpers bound to the current attributes/lang.
  const c = (labelKey, value, opts) => cell(t(labelKey), value, opts);
  const code = (labelKey, attr) => codeCell(t(labelKey), attr, a[attr], lang);

  // Secondary heating / hot-water systems only when an actual generator is set
  // ("Kein Wärmeerzeuger" = 7400 heating / 7600 hot water).
  const hasHeat2 = a.gwaerzh2 != null && a.gwaerzh2 !== "" && String(a.gwaerzh2) !== "7400";
  const hasWw2 = a.gwaerzw2 != null && a.gwaerzw2 !== "" && String(a.gwaerzw2) !== "7600";

  // One flat level of full-width titled blocks (no nested section/group
  // headings) for a calmer, more readable layout. Empty blocks drop out.
  const blocks = [
    block(t("g.identifikation"), [
      c("detail.egid", txt(egid), { mono: true }),
      c("detail.egrid", txt(egrid), { mono: true }),
      c("f.gbez", txt(a.gbez)),
      c("f.gebnr", txt(a.gebnr)),
      c("detail.gemeinde", txt(a.ggdename)),
      c("detail.bfsnr", txt(a.ggdenr)),
      c("detail.kanton", txt(a.gdekt)),
      c("f.gbkreis", txt(a.lgbkr)),
      c("f.parznr", txt(a.lparz)),
      c("f.parzsuffix", txt(a.lparzsx)),
      code("f.ltyp", "ltyp"),
    ]),
    block(t("g.koordinaten"), [
      c("f.ekoord", txt(a.gkode)),
      c("f.nkoord", txt(a.gkodn)),
      code("detail.koordherkunft", "gksce"),
      lv95 ? c("detail.koord_lv95", `${lv95[0].toFixed(1)}, ${lv95[1].toFixed(1)}`, { mono: true }) : "",
      wgs ? c("detail.koord_wgs84", `${wgs[1].toFixed(6)}, ${wgs[0].toFixed(6)}`, { mono: true }) : "",
    ]),
    center ? renderMap(center, lang) : "",
    block(t("g.klassifizierung"), [
      code("detail.status", "gstat"),
      code("detail.kategorie", "gkat"),
      code("detail.klasse", "gklas"),
    ]),
    block(t("g.lebenszyklus"), [
      c("detail.baujahr", txt(a.gbauj)),
      c("f.baumonat", txt(a.gbaum)),
      code("detail.bauperiode", "gbaup"),
      c("f.abbruchjahr", txt(a.gabbj)),
    ]),
    block(t("g.strukturdim"), [
      c("detail.geschosse", txt(a.gastw)),
      c("detail.wohnungen", txt(a.ganzwhg)),
      c("f.sepwohnraeume", txt(a.gazzi)),
      code("f.zivilschutz", "gschutzr"),
      c("detail.area", a.garea != null && a.garea !== "" ? formatArea(a.garea) : DASH),
      c("f.ebf", a.gebf != null && a.gebf !== "" ? formatArea(a.gebf) : DASH),
      c("f.volumen", a.gvol != null && a.gvol !== "" ? `${a.gvol} m³` : DASH),
      code("f.volnorm", "gvolnorm"),
      code("f.volquelle", "gvolsce"),
    ]),
    block(t("g.heizung1"), [
      code("f.waermeerzeuger", "gwaerzh1"),
      code("f.energiequelle", "genh1"),
      code("f.infoquelle", "gwaersceh1"),
      c("f.aktualisierung", txt(a.gwaerdath1)),
    ]),
    hasHeat2 ? block(t("g.heizung2"), [
      code("f.waermeerzeuger", "gwaerzh2"),
      code("f.energiequelle", "genh2"),
      code("f.infoquelle", "gwaersceh2"),
      c("f.aktualisierung", txt(a.gwaerdath2)),
    ]) : "",
    block(t("g.warmwasser1"), [
      code("f.waermeerzeuger", "gwaerzw1"),
      code("f.energiequelle", "genw1"),
      code("f.infoquelle", "gwaerscew1"),
      c("f.aktualisierung", txt(a.gwaerdatw1)),
    ]),
    hasWw2 ? block(t("g.warmwasser2"), [
      code("f.waermeerzeuger", "gwaerzw2"),
      code("f.energiequelle", "genw2"),
      code("f.infoquelle", "gwaerscew2"),
      c("f.aktualisierung", txt(a.gwaerdatw2)),
    ]) : "",
    block(t("g.adresseeingang"), [
      c("f.strasse", txt(arr(a.strname)[0])),
      c("f.strassekurz", txt(arr(a.strnamk)[0])),
      c("f.strindex", txt(a.strindx)),
      code("f.strsprache", "strsp"),
      code("f.stroffiziell", "stroffiziel"),
      c("f.eingangsnr", txt(a.deinr)),
      c("f.plz", txt(a.dplz4)),
      c("f.plzzusatz", txt(a.dplzz)),
      c("f.ortschaft", txt(a.dplzname)),
      code("f.offadr", "doffadr"),
      c("f.esid", txt(a.esid)),
      c("f.edid", txt(a.edid)),
      c("f.egaid", txt(a.egaid)),
      c("f.ekoord_eingang", txt(a.dkode)),
      c("f.nkoord_eingang", txt(a.dkodn)),
    ]),
    blockTable(t("s.wohnungen"), dwellingsTable(a, lang)),
  ];

  // Official links: GWR online entry (BFS), ÖREB extract (via EGRID), map viewer.
  const links = [];
  if (egid) links.push(link(`https://www.housing-stat.ch/de/query/egid.html?egid=${encodeURIComponent(egid)}`, t("detail.gwr_entry")));
  if (egrid) links.push(link(`https://oereb.geo.admin.ch/?egrid=${encodeURIComponent(egrid)}`, t("detail.oereb")));
  if (egid) links.push(link(mapViewerUrl(lv95, egid, lang), t("detail.mapviewer")));

  detailBody.innerHTML =
    blocks.filter(Boolean).join("") +
    (links.length ? `<div class="detail-links">${links.join("")}</div>` : "");

  detailPanel.hidden = false;
  detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Detail render helpers ──
const DASH = "—";

/** Coerce an API value to an array (dwelling fields come as parallel arrays). */
function arr(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }

/** Plain value or em-dash for empty/null. */
function txt(v) { return v == null || v === "" ? DASH : String(v); }

/** A label/value cell. `value` is plain text (escaped here). */
function cell(label, value, { mono = false, title = "" } = {}) {
  const cls = "detail-value" + (mono ? " mono" : "");
  const tt = title ? ` title="${esc(String(title))}"` : "";
  return `<div class="detail-field">
    <span class="detail-label">${esc(label)}</span>
    <span class="${cls}"${tt}>${esc(value)}</span>
  </div>`;
}

/** Coded-value cell: resolved label with the raw code as a tooltip. */
function codeCell(label, attr, codeVal, lang) {
  if (codeVal == null || codeVal === "") return cell(label, DASH);
  const resolved = resolveCode(attr, codeVal, lang) || String(codeVal);
  const title = String(codeVal) !== resolved ? String(codeVal) : "";
  return cell(label, resolved, { title });
}

/** A titled block: heading + full-width field grid. Empty blocks are dropped. */
function block(title, cells) {
  const inner = cells.filter(Boolean).join("");
  if (!inner) return "";
  return `<section class="detail-section">
    <h3 class="detail-section-title">${esc(title)}</h3>
    <div class="detail-group-fields">${inner}</div>
  </section>`;
}

/** A titled block wrapping arbitrary full-width content (e.g. the dwellings table). */
function blockTable(title, html) {
  if (!html) return "";
  return `<section class="detail-section">
    <h3 class="detail-section-title">${esc(title)}</h3>
    ${html}
  </section>`;
}

/** Dwellings table from the parallel `w*` arrays on the building feature. */
function dwellingsTable(a, lang) {
  const ewid = arr(a.ewid);
  if (!ewid.length) return "";
  const whgnr = arr(a.whgnr), weinr = arr(a.weinr), wstwk = arr(a.wstwk),
    wmehrg = arr(a.wmehrg), wbez = arr(a.wbez), wstat = arr(a.wstat),
    wbauj = arr(a.wbauj), wabbj = arr(a.wabbj), warea = arr(a.warea),
    wazim = arr(a.wazim), wkche = arr(a.wkche);

  const head = ["dw.ewid", "dw.nr", "dw.floor", "dw.lage", "dw.status",
    "dw.year", "dw.demolition", "dw.area", "dw.rooms", "dw.kitchen"]
    .map((k) => `<th>${esc(t(k))}</th>`).join("");

  const code1 = (attr, v) => (v == null || v === "" ? DASH : resolveCode(attr, v, lang) || String(v));

  const rows = ewid.map((id, i) => {
    let floor = code1("wstwk", wstwk[i]);
    if (String(wmehrg[i]) === "1" && floor !== DASH) floor += ` (${t("dw.multifloor")})`;
    const cells = [
      txt(id),
      `${txt(whgnr[i])} / ${txt(weinr[i])}`,
      floor,
      txt(wbez[i]),
      code1("wstat", wstat[i]),
      txt(wbauj[i]),
      txt(wabbj[i]),
      warea[i] != null && warea[i] !== "" ? `${warea[i]} m²` : DASH,
      txt(wazim[i]),
      code1("wkche", wkche[i]),
    ];
    return `<tr>${cells.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`;
  }).join("");

  // Totals row: dwelling count, summed living area and room count.
  const sum = (xs) => xs.reduce((s, v) => s + (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : 0), 0);
  const totalArea = sum(warea);
  const totalRooms = sum(wazim);
  const foot = [
    t("dw.total", { n: ewid.length }), "", "", "", "", "", "",
    `${totalArea.toLocaleString("de-CH")} m²`,
    totalRooms.toLocaleString("de-CH"),
    "",
  ].map((v) => `<td>${esc(v)}</td>`).join("");

  return `<div class="dwellings-wrap">
    <table class="dwellings-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>${foot}</tr></tfoot>
    </table>
  </div>`;
}

function link(url, label) {
  return `<a class="detail-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

// Internal: clear detail-panel UI without touching the URL.
function clearDetailUi() {
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

// ── URL state (shareable links) ──
//
// We mirror the search form + selected building in `?` query params so any page
// state can be reproduced by pasting the URL.
//   - Filter params share names with the form field IDs (kanton, gemeinde,
//     bfsnr, egid, adresse, plz)
//   - `selected` holds the EGID of the open detail panel (federal-level stable
//     ID — survives data refreshes; featureId would not)
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

  const selectedEgid = selectedId
    ? allResults.find((r) => String(r.featureId) === String(selectedId))
        ?.attributes?.egid
    : null;
  if (selectedEgid != null) params.set("selected", String(selectedEgid));
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

  const selectedEgid = params.get("selected");

  // Deep-link: `?selected=<egid>` alone is a useful share format, so seed the
  // EGID field with it and run the search to find the building.
  if (!hasFilters && selectedEgid) {
    document.getElementById("field-egid").value = selectedEgid;
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

  if (!selectedEgid || allResults.length === 0) return;

  const idx = allResults.findIndex(
    (r) => String(r.attributes?.egid) === String(selectedEgid)
  );
  if (idx < 0) return;

  currentPage = Math.floor(idx / PAGE_SIZE);
  renderPage();
  showDetail(allResults[idx].featureId, { writeUrl: false });
}

// ── swisstopo map (map.geo.admin.ch) ──
// Zoom is on the viewer's 0–13 scale (per the URL-parameter docs); 13 is the
// closest, building-level view.
const BUILDING_ZOOM = 13;

// Selectable background layers (map.geo.admin.ch bgLayer ids). The thumbnail is
// a single representative WMTS tile. Persists across detail opens via `mapBasemap`.
const BASEMAPS = [
  { id: "ch.swisstopo.pixelkarte-farbe",    key: "map.bg.color",  thumb: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/8/134/91.jpeg" },
  { id: "ch.swisstopo.pixelkarte-grau",     key: "map.bg.grey",   thumb: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/8/134/91.jpeg" },
  { id: "ch.swisstopo.swissimage",          key: "map.bg.aerial", thumb: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/134/91.jpeg" },
  { id: "ch.kantone.cadastralwebmap-farbe", key: "map.bg.av",     thumb: "https://wmts.geo.admin.ch/1.0.0/ch.kantone.cadastralwebmap-farbe/default/current/3857/8/134/91.png" },
];
let mapBasemap = "ch.swisstopo.pixelkarte-grau"; // default: grey makes the GWR colours stand out

/**
 * Full-viewer link for a building: centred + zoomed on the point with a
 * crosshair marker. Falls back to a text search by EGID when no coordinate is
 * available. center: [E, N] in LV95 (EPSG:2056) or null.
 */
function mapViewerUrl(center, egid, lang) {
  if (!center) {
    return `https://map.geo.admin.ch/#/map?lang=${lang}&swisssearch=${encodeURIComponent(egid)}`;
  }
  const e = Math.round(center[0]);
  const n = Math.round(center[1]);
  const params = new URLSearchParams({
    lang,
    center: `${e},${n}`,
    z: String(BUILDING_ZOOM),
    bgLayer: "ch.swisstopo.pixelkarte-farbe",
    layers: LAYER,
    crosshair: `marker,${e},${n}`,
  });
  return `https://map.geo.admin.ch/#/map?${params}`;
}

// Build the embed URL for a given background layer. map.geo.admin.ch uses
// hash-based routing (#/embed?...) and is URL-driven, so swapping bgLayer in
// the hash re-points the basemap live.
function mapEmbedSrc(center, lang, bgLayer) {
  const params = new URLSearchParams({
    lang,
    center: `${center[0].toFixed(1)},${center[1].toFixed(1)}`,
    z: String(BUILDING_ZOOM),
    bgLayer,
    layers: LAYER,
    crosshair: "marker",
  });
  return `https://map.geo.admin.ch/#/embed?${params}`;
}

/**
 * Build the embedded swisstopo map for a building, with a background switcher
 * (colour / grey / aerial / OpenData-AV) and the GWR building-status legend.
 * center: [E, N] in LV95 (EPSG:2056). lang: "de" | "fr" | "it".
 */
function renderMap(center, lang) {
  const src = mapEmbedSrc(center, lang, mapBasemap);
  const buttons = BASEMAPS.map((b) => {
    const active = b.id === mapBasemap;
    return `<button type="button" class="map-basemap${active ? " active" : ""}" data-bg="${b.id}" aria-pressed="${active}">
      <img src="${b.thumb}" alt="" width="40" height="40" loading="lazy">
      <span>${esc(t(b.key))}</span>
    </button>`;
  }).join("");
  // Official GWR "Gebäudestatus" legend image (localised).
  const legendSrc = `https://api3.geo.admin.ch/static/images/legends/${LAYER}_${lang}.png`;
  return `
    <section class="detail-section">
      <h3 class="detail-section-title">${esc(t("detail.map"))}</h3>
      <div class="detail-map-wrap" data-center="${center[0].toFixed(1)},${center[1].toFixed(1)}" data-lang="${lang}">
        <iframe class="detail-map-frame"
                src="${src}"
                loading="lazy"
                title="${esc(t("detail.map"))}"
                allow="geolocation"></iframe>
        <details class="map-legend">
          <summary>${esc(t("map.legend"))}</summary>
          <img src="${esc(legendSrc)}" alt="${esc(t("map.legend"))}" loading="lazy">
        </details>
        <div class="map-basemaps" role="group" aria-label="${esc(t("map.basemaps"))}">${buttons}</div>
      </div>
    </section>
  `;
}

// Delegated: switch the embedded map's background layer (updates the iframe
// URL hash, which the viewer applies live) and the active button state.
function onMapBasemapClick(e) {
  const btn = e.target.closest(".map-basemap");
  if (!btn) return;
  const wrap = btn.closest(".detail-map-wrap");
  const iframe = wrap?.querySelector(".detail-map-frame");
  if (!iframe) return;
  mapBasemap = btn.dataset.bg;
  const [cx, cy] = wrap.dataset.center.split(",").map(Number);
  iframe.src = mapEmbedSrc([cx, cy], wrap.dataset.lang, mapBasemap);
  wrap.querySelectorAll(".map-basemap").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

// Building coordinate in LV95 [E, N]: the official gkode/gkodn attribute if
// present, otherwise the entrance-point geometry from `find`.
function buildingLv95(a, fallback) {
  const e = Number(a.gkode), n = Number(a.gkodn);
  if (isFinite(e) && isFinite(n) && (e !== 0 || n !== 0)) return [e, n];
  return fallback || null;
}

// ── Area formatting ──

/** Format building footprint area as m² or ha depending on size. */
function formatArea(m2) {
  const n = Number(m2);
  if (!isFinite(n)) return esc(String(m2));
  if (n >= 10000) {
    return (n / 10000).toLocaleString("de-CH", { maximumFractionDigits: 2 }) + " ha";
  }
  return Math.round(n).toLocaleString("de-CH") + " m²";
}
