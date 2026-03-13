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
  document.addEventListener("click", () => { if (panelOpen) closePanel(); });

  wrap.appendChild(panel);
  wrap.appendChild(btn);
  parentEl.appendChild(wrap);
}

export function initMap(container, clickCallback) {
  onMarkerClick = clickCallback;

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

  map.on("load", () => {
    // Hide loading spinner
    if (spinner) spinner.style.display = "none";

    addLayers();

    // If results were queued before load, plot them now
    if (resultsData.length) plotOnMap();
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
