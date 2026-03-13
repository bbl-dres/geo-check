/**
 * MapLibre GL JS map with CARTO basemap, circle markers, popups
 */
import { scoreColor, escapeHtml } from "./utils.js";

let map = null;
let popup = null;
let onMarkerClick = null;
let resultsData = [];
let dataBounds = null;
let lastGeoJSON = { type: "FeatureCollection", features: [] };
let searchMarker = null;

/** Abort controller for document-level listeners; recreated each initMap() call */
let mapAC = null;

const SEARCH_API = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";

const BASEMAPS = [
  { id: "positron",    label: "Hell",    thumb: "https://a.basemaps.cartocdn.com/light_all/7/66/45.png",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  { id: "dark-matter", label: "Dunkel",  thumb: "https://a.basemaps.cartocdn.com/dark_all/7/66/45.png",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  { id: "voyager",     label: "Farbe",   thumb: "https://a.basemaps.cartocdn.com/rastertiles/voyager/7/66/45.png",
    url: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json" },
  { id: "swisstopo",   label: "Luftbild", thumb: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/133/91.jpeg",
    url: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json" },
];

let currentBasemap = "positron";

/** Custom control: summary panel toggle */
class SummaryToggleControl {
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "sp-open-map";
    btn.title = "Zusammenfassung anzeigen";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M14 14h7v7h-7z"/></svg>`;
    btn.addEventListener("click", () => {
      if (summaryToggleCallback) summaryToggleCallback();
    });
    this._btn = btn;
    this._container.appendChild(btn);
    return this._container;
  }
  onRemove() {
    this._container.remove();
  }
  setHidden(hidden) {
    this._container.style.display = hidden ? "none" : "block";
  }
}

let summaryToggleControl = null;
let summaryToggleCallback = null;

/** Register callback for the summary panel toggle control */
export function onSummaryToggle(callback) {
  summaryToggleCallback = callback;
}

/** Show/hide the summary toggle button on the map */
export function setSummaryToggleVisible(visible) {
  if (summaryToggleControl) summaryToggleControl.setHidden(!visible);
}

/** Custom control: location search via Swisstopo */
class LocationSearchControl {
  onAdd(mapInstance) {
    this._map = mapInstance;
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group loc-search-ctrl";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Standort suchen";
    btn.className = "loc-search-toggle";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

    const panel = document.createElement("div");
    panel.className = "loc-search-panel";
    panel.hidden = true;

    const inputWrap = document.createElement("div");
    inputWrap.className = "loc-search-input-wrap";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "loc-search-input";
    input.placeholder = "Standort suchen\u2026";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "loc-search-clear";
    clearBtn.title = "Suche leeren";
    clearBtn.innerHTML = "\u00d7";
    clearBtn.hidden = true;

    inputWrap.appendChild(input);
    inputWrap.appendChild(clearBtn);

    const resultsList = document.createElement("div");
    resultsList.className = "loc-search-results";

    panel.appendChild(inputWrap);
    panel.appendChild(resultsList);
    this._container.appendChild(btn);
    this._container.appendChild(panel);

    let expanded = false;
    let debounceTimer = null;

    const collapse = () => {
      expanded = false;
      panel.hidden = true;
      btn.classList.remove("active");
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      expanded = !expanded;
      panel.hidden = !expanded;
      btn.classList.toggle("active", expanded);
      if (expanded) {
        input.value = "";
        resultsList.innerHTML = "";
        setTimeout(() => input.focus(), 50);
      }
    });

    document.addEventListener("click", (e) => {
      if (expanded && !this._container.contains(e.target)) collapse();
    }, { signal: mapAC.signal });

    panel.addEventListener("click", (e) => e.stopPropagation());

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) { resultsList.innerHTML = ""; return; }
      debounceTimer = setTimeout(async () => {
        const results = await fetchLocations(q);
        renderSearchResults(resultsList, results, collapse);
      }, 300);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") collapse();
    });

    return this._container;
  }
  onRemove() {
    this._container.remove();
    this._map = null;
  }
}

async function fetchLocations(query) {
  try {
    const params = new URLSearchParams({
      searchText: query,
      type: "locations",
      sr: "4326",
      limit: "5"
    });
    const resp = await fetch(`${SEARCH_API}?${params}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results || [];
  } catch {
    return [];
  }
}

function renderSearchResults(container, results, onSelect) {
  if (!results.length) {
    container.innerHTML = `<div class="loc-search-empty">Keine Ergebnisse</div>`;
    return;
  }
  container.innerHTML = "";
  for (const r of results) {
    const item = document.createElement("button");
    item.className = "loc-search-item";
    item.innerHTML = r.attrs.label;
    item.addEventListener("click", () => {
      placeSearchMarker(r.attrs.lat, r.attrs.lon, r.attrs.label);
      onSelect();
    });
    container.appendChild(item);
  }
}

function placeSearchMarker(lat, lon, label) {
  if (searchMarker) searchMarker.remove();
  const blue = getComputedStyle(document.documentElement).getPropertyValue("--federal-blue").trim() || "#1a365d";
  searchMarker = new maplibregl.Marker({ color: blue })
    .setLngLat([lon, lat])
    .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<div class="map-popup">${label}</div>`))
    .addTo(map);
  searchMarker.togglePopup();
  map.flyTo({ center: [lon, lat], zoom: 15 });
}

/** Custom control: reset view / zoom to extent */
class ResetViewControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Gesamtansicht";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
    btn.addEventListener("click", () => {
      if (dataBounds) {
        map.fitBounds(dataBounds, { padding: 40, maxZoom: 15 });
      } else {
        map.flyTo({ center: [8.2, 46.8], zoom: 7 });
      }
    });
    this._container.appendChild(btn);
    return this._container;
  }
  onRemove() {
    this._container.remove();
    this._map = null;
  }
}

/** Add data source + layer + event handlers (called on initial load and after style switch) */
function addLayers() {
  if (map.getSource("buildings")) return;

  map.addSource("buildings", {
    type: "geojson",
    data: lastGeoJSON
  });

  map.addLayer({
    id: "buildings-circle",
    type: "circle",
    source: "buildings",
    paint: {
      "circle-radius": 7,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.85
    }
  });

  map.on("click", "buildings-circle", (e) => {
    if (!e.features.length) return;
    const props = e.features[0].properties;
    const idx = props.rowIndex;

    popup
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(props.popupHtml)
      .addTo(map);

    if (onMarkerClick) onMarkerClick(idx);
  });

  map.on("mouseenter", "buildings-circle", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "buildings-circle", () => { map.getCanvas().style.cursor = ""; });
}

/** Create the basemap switcher widget */
function createBasemapSwitcher(parentEl) {
  const wrap = document.createElement("div");
  wrap.id = "basemap-switcher";

  const panel = document.createElement("div");
  panel.className = "bm-panel";
  panel.id = "bm-panel";

  BASEMAPS.forEach((bm) => {
    const opt = document.createElement("button");
    opt.className = "bm-option" + (bm.id === currentBasemap ? " active" : "");
    opt.dataset.id = bm.id;
    opt.innerHTML =
      `<img src="${bm.thumb}" alt="${bm.label}">` +
      `<span class="bm-opt-label">${bm.label}</span>`;
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      if (bm.id === currentBasemap) { closePanel(); return; }
      currentBasemap = bm.id;
      updateBtn();
      map.setStyle(bm.url);
      map.once("style.load", addLayers);
      closePanel();
    });
    panel.appendChild(opt);
  });

  const bm = BASEMAPS.find((b) => b.id === currentBasemap);
  const btn = document.createElement("button");
  btn.className = "bm-btn";
  btn.id = "bm-btn";
  btn.title = "Hintergrund wechseln";
  btn.innerHTML =
    `<img id="bm-current-thumb" src="${bm.thumb}" alt="Hintergrund">` +
    `<span>Hintergrund</span>`;

  let panelOpen = false;
  function closePanel() { panelOpen = false; panel.classList.remove("open"); }
  function updateBtn() {
    const cur = BASEMAPS.find((b) => b.id === currentBasemap);
    document.getElementById("bm-current-thumb").src = cur.thumb;
    panel.querySelectorAll(".bm-option").forEach((o) => {
      o.classList.toggle("active", o.dataset.id === currentBasemap);
    });
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    panel.classList.toggle("open", panelOpen);
  });
  document.addEventListener("click", () => { if (panelOpen) closePanel(); }, { signal: mapAC.signal });

  wrap.appendChild(panel);
  wrap.appendChild(btn);
  parentEl.appendChild(wrap);
}

export function initMap(container, clickCallback) {
  onMarkerClick = clickCallback;

  // Tear down previous document-level listeners
  if (mapAC) mapAC.abort();
  mapAC = new AbortController();

  if (map) {
    map.remove();
    map = null;
  }

  // Show loading spinner
  const containerEl = typeof container === "string" ? document.getElementById(container) : container;
  let spinner = containerEl.querySelector(".map-loading");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.className = "map-loading";
    spinner.innerHTML = `<div class="map-spinner"></div><div class="map-loading-text">Karte wird geladen\u2026</div>`;
    containerEl.appendChild(spinner);
  }
  spinner.style.display = "flex";

  // Remove old basemap switcher if re-initializing
  const oldSwitcher = containerEl.parentElement.querySelector("#basemap-switcher");
  if (oldSwitcher) oldSwitcher.remove();

  const style = BASEMAPS.find((b) => b.id === currentBasemap)?.url
    || "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

  map = new maplibregl.Map({
    container,
    style,
    center: [8.2, 46.8],
    zoom: 7,
    attributionControl: false
  });

  map.addControl(new LocationSearchControl(), "top-right");
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new ResetViewControl(), "top-right");
  summaryToggleControl = new SummaryToggleControl();
  map.addControl(summaryToggleControl, "top-right");
  summaryToggleControl.setHidden(true); // hidden by default, shown when panel is closed
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  map.addControl(new maplibregl.AttributionControl({
    compact: false,
    customAttribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · <a href="https://carto.com/attributions" target="_blank">CARTO</a> · <a href="https://www.swisstopo.admin.ch" target="_blank">swisstopo</a>'
  }), "bottom-right");

  popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "260px" });

  // Basemap switcher
  createBasemapSwitcher(containerEl.parentElement);

  return new Promise((resolve) => {
    map.on("load", () => {
      // Hide loading spinner
      if (spinner) spinner.style.display = "none";

      addLayers();

      // If results were queued before load, plot them now
      if (resultsData.length) plotOnMap();
      resolve();
    });
  });
}

export function plotResults(results) {
  resultsData = results;
  if (map && map.isStyleLoaded() && map.getSource("buildings")) {
    plotOnMap();
  }
}

function plotOnMap() {
  const features = [];
  const bounds = new maplibregl.LngLatBounds();

  for (let i = 0; i < resultsData.length; i++) {
    const row = resultsData[i];
    const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude) || null;
    const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude) || null;

    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

    const score = row.match_score !== "" && row.match_score != null ? Number(row.match_score) : null;
    const color = scoreColor(score);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        rowIndex: i,
        color,
        popupHtml: buildPopup(row)
      }
    });

    bounds.extend([lng, lat]);
  }

  lastGeoJSON = { type: "FeatureCollection", features };

  map.getSource("buildings").setData(lastGeoJSON);

  if (features.length > 0) {
    dataBounds = bounds;
    map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
  }
}

function buildPopup(row) {
  const score = row.match_score !== "" && row.match_score != null ? row.match_score + "%" : "N/A";
  const status = row.gwr_match || "";
  return `
    <div class="map-popup">
      <strong>${escapeHtml(row.internal_id || row.gwr_egid || "—")}</strong><br>
      EGID: ${escapeHtml(row.gwr_egid || row.egid || "—")}<br>
      ${escapeHtml(row.gwr_street || "")} ${escapeHtml(row.gwr_street_number || "")}<br>
      ${escapeHtml(row.gwr_zip || "")} ${escapeHtml(row.gwr_city || "")}<br>
      <strong>Score: ${score}</strong> · ${escapeHtml(status)}
    </div>
  `;
}

export function highlightMarker(rowIndex) {
  const row = resultsData[rowIndex];
  if (!row || !map) return;

  const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude) || null;
  const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude) || null;
  if (lat == null || lng == null) return;

  popup
    .setLngLat([lng, lat])
    .setHTML(buildPopup(row))
    .addTo(map);

  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13) });
}

export function resizeMap() {
  if (map) map.resize();
}
