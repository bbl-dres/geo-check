/**
 * MapLibre GL JS map with CARTO basemap, circle markers, popups
 */
import { scoreColor, confidenceLabel, escapeHtml } from "./utils.js";
import { t, getLang } from "./i18n.js";
import { generateBuildingReport } from "./report.js";

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
  { id: "positron",    labelKey: "map.basemapLight",  thumb: "https://a.basemaps.cartocdn.com/light_all/7/66/45.png",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  { id: "dark-matter", labelKey: "map.basemapDark",   thumb: "https://a.basemaps.cartocdn.com/dark_all/7/66/45.png",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  { id: "voyager",     labelKey: "map.basemapColor",  thumb: "https://a.basemaps.cartocdn.com/rastertiles/voyager/7/66/45.png",
    url: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json" },
  { id: "swisstopo",   labelKey: "map.basemapAerial", thumb: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/133/91.jpeg",
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
    btn.title = t("map.summaryToggle");
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
    btn.title = t("map.searchTitle");
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
    input.placeholder = t("map.searchPlaceholder");

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "loc-search-clear";
    clearBtn.title = t("map.searchClear");
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
        clearBtn.hidden = true;
        resultsList.innerHTML = "";
        setTimeout(() => input.focus(), 50);
      }
    });

    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      input.value = "";
      clearBtn.hidden = true;
      resultsList.innerHTML = "";
      clearTimeout(debounceTimer);
      input.focus();
    });

    document.addEventListener("click", (e) => {
      if (expanded && !this._container.contains(e.target)) collapse();
    }, { signal: mapAC.signal });

    panel.addEventListener("click", (e) => e.stopPropagation());

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      clearBtn.hidden = !q;
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
    container.innerHTML = `<div class="loc-search-empty">${t("common.noResults")}</div>`;
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

/** Overlay layer definitions (WMS for layers that don't support EPSG:3857 WMTS) */
const OVERLAY_LAYERS = [
  { id: "gwr-status",  key: "map.layerGwrStatus",  layer: "ch.bfs.gebaeude_wohnungs_register", mode: "wmts" },
  { id: "oereb",       key: "map.layerOereb",       layer: "ch.swisstopo-vd.stand-oerebkataster", mode: "wms" },
  { id: "cadastre",    key: "map.layerCadastre",     layer: "ch.swisstopo-vd.amtliche-vermessung", mode: "wms" },
];

function overlayTileUrl(wl) {
  if (wl.mode === "wms") {
    return `https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${wl.layer}&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
  }
  return `https://wmts.geo.admin.ch/1.0.0/${wl.layer}/default/current/3857/{z}/{x}/{y}.png`;
}

/** Get approximate map scale */
function getMapScale() {
  if (!map) return 25000;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
  const pixelsPerMeter = 96 / 0.0254;
  return Math.round(metersPerPixel * pixelsPerMeter);
}

/** Print the current map view via browser print dialog */
function printMap() {
  const orientationEl = document.getElementById("map-print-orientation");
  const scaleEl = document.getElementById("map-print-scale");
  const legendEl = document.getElementById("map-print-legend");
  const btn = document.getElementById("map-print-btn");

  const orientation = orientationEl.value;
  const scaleVal = scaleEl.value;
  const includeLegend = legendEl.checked;

  const origText = btn.textContent;
  btn.textContent = t("map.printGenerating");
  btn.disabled = true;

  const dims = {
    "landscape-a4": { width: 297, height: 210 },
    "portrait-a4":  { width: 210, height: 297 },
    "landscape-a3": { width: 420, height: 297 },
    "portrait-a3":  { width: 297, height: 420 },
  }[orientation] || { width: 297, height: 210 };

  const pc = document.createElement("div");
  pc.id = "print-container";
  pc.style.cssText = `position:fixed;top:0;left:0;width:${dims.width}mm;height:${dims.height}mm;background:white;z-index:10000;padding:10mm;box-sizing:border-box;display:flex;flex-direction:column;`;

  // Header
  const hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:5mm;padding-bottom:3mm;border-bottom:1px solid #ccc;flex-shrink:0;";
  hdr.innerHTML = `<div style="font-size:14pt;font-weight:bold;">Geo-Check</div><div style="font-size:10pt;color:#666;">${new Date().toLocaleDateString("de-CH")}</div>`;
  pc.appendChild(hdr);

  // Map canvas
  const mapBox = document.createElement("div");
  mapBox.style.cssText = "flex:1;border:1px solid #ccc;position:relative;overflow:hidden;min-height:0;";
  if (map) {
    const srcCanvas = map.getCanvas();
    const clone = document.createElement("canvas");
    clone.width = srcCanvas.width;
    clone.height = srcCanvas.height;
    clone.getContext("2d").drawImage(srcCanvas, 0, 0);
    clone.style.cssText = "width:100%;height:100%;object-fit:contain;";
    mapBox.appendChild(clone);

    // Scale bar
    const sb = document.createElement("div");
    sb.style.cssText = "position:absolute;bottom:5mm;left:5mm;background:rgba(255,255,255,0.9);padding:2mm 3mm;border-radius:2px;font-size:8pt;";
    const currentScale = scaleVal === "auto" ? getMapScale() : parseInt(scaleVal);
    sb.textContent = `Massstab 1:${currentScale.toLocaleString("de-CH")}`;
    mapBox.appendChild(sb);
  }
  pc.appendChild(mapBox);

  // Legend
  if (includeLegend) {
    const leg = document.createElement("div");
    leg.style.cssText = "margin-top:5mm;padding:3mm;border:1px solid #ccc;font-size:9pt;flex-shrink:0;";
    const colors = { good: "#22c55e", partial: "#eab308", poor: "#ef4444", none: "#9ca3af" };
    const labels = { good: t("map.legendGood"), partial: t("map.legendPartial"), poor: t("map.legendPoor"), none: t("map.legendNone") };
    let items = "";
    for (const [k, c] of Object.entries(colors)) {
      items += `<span style="display:inline-flex;align-items:center;gap:3px;"><span style="display:inline-block;width:12px;height:8px;background:${c};border-radius:2px;border:1px solid rgba(0,0,0,0.12);"></span>${labels[k]}</span>`;
    }
    leg.innerHTML = `<div style="font-weight:bold;margin-bottom:2mm;">${t("map.printLegend")}</div><div style="display:flex;gap:10mm;flex-wrap:wrap;">${items}</div>`;
    pc.appendChild(leg);
  }

  // Footer
  const ftr = document.createElement("div");
  ftr.style.cssText = "margin-top:3mm;padding-top:3mm;border-top:1px solid #ccc;font-size:8pt;color:#666;display:flex;justify-content:space-between;flex-shrink:0;";
  ftr.innerHTML = `<span>Quelle: Geo-Check</span><span>\u00a9 ${new Date().getFullYear()} Bundesamt f\u00fcr Bauten und Logistik</span>`;
  pc.appendChild(ftr);

  document.body.appendChild(pc);

  const printStyles = document.createElement("style");
  printStyles.id = "gc-print-styles";
  printStyles.textContent = `@media print { body > *:not(#print-container) { display: none !important; } #print-container { position: static !important; } @page { size: ${orientation.includes("landscape") ? "landscape" : "portrait"}; margin: 0; } }`;
  document.head.appendChild(printStyles);

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      pc.remove();
      printStyles.remove();
      btn.textContent = origText;
      btn.disabled = false;
    }, 500);
  }, 100);
}

/** Create the map accordion panel (property-inventory style) */
function createMapPanel(parentEl) {
  const oldPanel = parentEl.querySelector(".map-acc-wrapper");
  if (oldPanel) oldPanel.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "map-acc-wrapper";

  const panel = document.createElement("div");
  panel.className = "map-acc-panel";
  panel.id = "map-acc-panel";

  // Track all headers/contents for mutual exclusivity
  const allHeaders = [];
  const allContents = [];

  function toggleAcc(header, content) {
    const wasActive = header.classList.contains("active");
    allHeaders.forEach(h => { h.classList.remove("active"); h.setAttribute("aria-expanded", "false"); });
    allContents.forEach(c => c.classList.remove("show"));
    if (!wasActive) {
      header.classList.add("active");
      header.setAttribute("aria-expanded", "true");
      content.classList.add("show");
    }
  }

  const chevronSvg = `<span class="map-acc-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg></span>`;

  // ═══ Accordion 1: Print ═══
  const printItem = document.createElement("div");
  printItem.className = "map-acc-item";

  const printHeader = document.createElement("button");
  printHeader.type = "button";
  printHeader.className = "map-acc-header";
  printHeader.setAttribute("aria-expanded", "false");
  printHeader.innerHTML = `${chevronSvg} <span>${t("map.print")}</span>`;

  const printContent = document.createElement("div");
  printContent.className = "map-acc-content";

  // Print form
  const printPanel = document.createElement("div");
  printPanel.className = "map-acc-print-panel";

  // Orientation row
  const oriRow = document.createElement("div");
  oriRow.className = "map-acc-form-row";
  oriRow.innerHTML = `<label for="map-print-orientation" class="map-acc-form-label">${t("map.printOrientation")}</label>`;
  const oriSel = document.createElement("select");
  oriSel.id = "map-print-orientation";
  oriSel.className = "map-acc-select";
  oriSel.innerHTML = `<option value="landscape-a4">A4 landscape</option><option value="portrait-a4">A4 portrait</option><option value="landscape-a3">A3 landscape</option><option value="portrait-a3">A3 portrait</option>`;
  oriRow.appendChild(oriSel);
  printPanel.appendChild(oriRow);

  // Scale row
  const scaleRow = document.createElement("div");
  scaleRow.className = "map-acc-form-row";
  scaleRow.innerHTML = `<label for="map-print-scale" class="map-acc-form-label">${t("map.printScale")}</label>`;
  const scaleSel = document.createElement("select");
  scaleSel.id = "map-print-scale";
  scaleSel.className = "map-acc-select";
  scaleSel.innerHTML = `<option value="auto">${t("map.printScaleAuto")}</option><option value="500">1:500</option><option value="1000">1:1'000</option><option value="2500">1:2'500</option><option value="5000">1:5'000</option><option value="10000">1:10'000</option><option value="25000">1:25'000</option><option value="50000">1:50'000</option><option value="100000">1:100'000</option>`;
  scaleRow.appendChild(scaleSel);
  printPanel.appendChild(scaleRow);

  // Legend checkbox
  const legRow = document.createElement("label");
  legRow.className = "map-acc-print-check";
  legRow.innerHTML = `<input type="checkbox" id="map-print-legend" checked> <span>${t("map.printLegend")}</span>`;
  printPanel.appendChild(legRow);

  // Print button
  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.id = "map-print-btn";
  printBtn.className = "map-acc-print-btn";
  printBtn.textContent = t("map.printBtn");
  printBtn.addEventListener("click", printMap);
  printPanel.appendChild(printBtn);

  printContent.appendChild(printPanel);
  printItem.appendChild(printHeader);
  printItem.appendChild(printContent);
  panel.appendChild(printItem);

  allHeaders.push(printHeader);
  allContents.push(printContent);
  printHeader.addEventListener("click", () => toggleAcc(printHeader, printContent));

  // ═══ Accordion 2: Karteninhalt ═══
  const mapItem = document.createElement("div");
  mapItem.className = "map-acc-item";

  const mapHeader = document.createElement("button");
  mapHeader.type = "button";
  mapHeader.className = "map-acc-header active";
  mapHeader.setAttribute("aria-expanded", "true");
  mapHeader.innerHTML = `${chevronSvg} <span>${t("map.panelTitle")}</span>`;

  const mapContent = document.createElement("div");
  mapContent.className = "map-acc-content show";

  // Buildings layer
  const buildItem = document.createElement("div");
  buildItem.className = "map-acc-layer-item";
  const buildCb = document.createElement("input");
  buildCb.type = "checkbox";
  buildCb.className = "map-acc-checkbox";
  buildCb.checked = true;
  const buildLabel = document.createElement("span");
  buildLabel.className = "map-acc-layer-title";
  buildLabel.textContent = t("map.layerBuildings");
  buildItem.appendChild(buildCb);
  buildItem.appendChild(buildLabel);
  mapContent.appendChild(buildItem);

  buildCb.addEventListener("change", () => {
    const vis = buildCb.checked ? "visible" : "none";
    if (map.getLayer("buildings-circle")) map.setLayoutProperty("buildings-circle", "visibility", vis);
    if (map.getLayer("buildings-label")) map.setLayoutProperty("buildings-label", "visibility", vis);
    legendEl.style.opacity = buildCb.checked ? "1" : "0.3";
  });

  // Legend
  const legendEl = document.createElement("div");
  legendEl.className = "map-acc-legend";
  for (const item of [
    { key: "map.legendGood",    color: "var(--color-good)" },
    { key: "map.legendPartial", color: "var(--color-partial)" },
    { key: "map.legendPoor",    color: "var(--color-poor)" },
    { key: "map.legendNone",    color: "var(--color-none)" },
  ]) {
    const row = document.createElement("div");
    row.className = "map-acc-legend-item";
    row.innerHTML = `<span class="map-acc-swatch" style="background:${item.color}"></span><span class="map-acc-legend-label">${t(item.key)}</span>`;
    legendEl.appendChild(row);
  }
  mapContent.appendChild(legendEl);

  // External layers
  const extLabel = document.createElement("div");
  extLabel.className = "map-acc-group-label";
  extLabel.textContent = t("map.externalLayers");
  mapContent.appendChild(extLabel);

  for (const wl of OVERLAY_LAYERS) {
    const layerItem = document.createElement("div");
    layerItem.className = "map-acc-layer-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "map-acc-checkbox";
    cb.dataset.overlayId = wl.id;
    const span = document.createElement("span");
    span.className = "map-acc-layer-title";
    span.textContent = t(wl.key);
    layerItem.appendChild(cb);
    layerItem.appendChild(span);
    mapContent.appendChild(layerItem);

    cb.addEventListener("change", () => {
      const sourceId = `overlay-${wl.id}`;
      const layerId = `overlay-layer-${wl.id}`;
      if (cb.checked) {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: "raster",
            tiles: [overlayTileUrl(wl)],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.swisstopo.admin.ch" target="_blank">swisstopo</a>'
          });
        }
        if (!map.getLayer(layerId)) {
          const beforeLayer = map.getLayer("buildings-circle") ? "buildings-circle" : undefined;
          map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.6 } }, beforeLayer);
        }
      } else {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    });
  }

  mapItem.appendChild(mapHeader);
  mapItem.appendChild(mapContent);
  panel.appendChild(mapItem);

  allHeaders.push(mapHeader);
  allContents.push(mapContent);
  mapHeader.addEventListener("click", () => toggleAcc(mapHeader, mapContent));

  wrapper.appendChild(panel);

  // ── Menu toggle ──
  const toggle = document.createElement("div");
  toggle.className = "map-acc-toggle";
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "map-acc-toggle-icon";
  toggleIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 15 12 9 18 15"/></svg>`;
  const toggleText = document.createElement("span");
  toggleText.textContent = t("map.menuClose");
  toggle.appendChild(toggleIcon);
  toggle.appendChild(toggleText);

  let menuOpen = true;
  toggle.addEventListener("click", () => {
    menuOpen = !menuOpen;
    panel.classList.toggle("collapsed", !menuOpen);
    toggleText.textContent = menuOpen ? t("map.menuClose") : t("map.menuOpen");
    toggleIcon.innerHTML = menuOpen
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 15 12 9 18 15"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
  });

  wrapper.appendChild(toggle);
  parentEl.appendChild(wrapper);

  const overlayCheckboxes = mapContent.querySelectorAll("[data-overlay-id]");

  return {
    reapplyLayers() {
      for (const cb of overlayCheckboxes) {
        if (cb.checked) {
          const wl = OVERLAY_LAYERS.find((w) => w.id === cb.dataset.overlayId);
          if (!wl) continue;
          const sourceId = `overlay-${wl.id}`;
          const layerId = `overlay-layer-${wl.id}`;
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, { type: "raster", tiles: [overlayTileUrl(wl)], tileSize: 256 });
          }
          if (!map.getLayer(layerId)) {
            const beforeLayer = map.getLayer("buildings-circle") ? "buildings-circle" : undefined;
            map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.6 } }, beforeLayer);
          }
        }
      }
    }
  };
}

let mapPanelControl = null;

/** Custom control: reset view / zoom to extent */
class ResetViewControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = t("map.resetView");
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
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

/** Whether map-level (non-layer) handlers have been registered */
let mapHandlersRegistered = false;

/** Add data source + layer + event handlers (called on initial load and after style switch) */
function addLayers() {
  // Clean up existing layers/source first (makes this idempotent for style switches)
  if (map.getLayer("buildings-label")) map.removeLayer("buildings-label");
  if (map.getLayer("buildings-circle")) map.removeLayer("buildings-circle");
  if (map.getSource("buildings")) map.removeSource("buildings");

  const isDark = currentBasemap === "dark-matter";
  const strokeColor = isDark ? "#2d2d2d" : "#fff";
  const textColor = isDark ? "#e5e7eb" : "#1a1a2e";
  const haloColor = isDark ? "#1a1a2e" : "#fff";

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
      "circle-stroke-color": strokeColor,
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.85
    }
  });

  map.addLayer({
    id: "buildings-label",
    type: "symbol",
    source: "buildings",
    minzoom: 13,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": 11,
      "text-anchor": "bottom",
      "text-offset": [0, -0.8],
      "text-allow-overlap": false,
      "text-optional": true
    },
    paint: {
      "text-color": textColor,
      "text-halo-color": haloColor,
      "text-halo-width": 1.5
    }
  });

  // Layer-specific handlers must be re-registered after each style change
  map.on("click", "buildings-circle", (e) => {
    if (!e.features.length) return;
    const props = e.features[0].properties;
    const idx = props.rowIndex;

    popup
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(props.popupHtml)
      .addTo(map);

    wirePopupReportBtn();
    if (onMarkerClick) onMarkerClick(idx);
  });

  map.on("mouseenter", "buildings-circle", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "buildings-circle", () => { map.getCanvas().style.cursor = ""; });

  // Map-level handlers only once (they survive style changes)
  if (!mapHandlersRegistered) {
    mapHandlersRegistered = true;
    const coordsEl = document.getElementById("footer-coords");
    if (coordsEl) {
      map.on("mousemove", (e) => {
        const { lng, lat } = e.lngLat;
        coordsEl.textContent = `WGS 84: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      });
      map.on("mouseout", () => { coordsEl.textContent = "\u2014"; });
    }
  }
}

/** Create the basemap switcher widget */
function createBasemapSwitcher(parentEl) {
  const wrap = document.createElement("div");
  wrap.id = "basemap-switcher";

  const panel = document.createElement("div");
  panel.className = "bm-panel";
  panel.id = "bm-panel";

  BASEMAPS.forEach((bm) => {
    const label = t(bm.labelKey);
    const opt = document.createElement("button");
    opt.className = "bm-option" + (bm.id === currentBasemap ? " active" : "");
    opt.dataset.id = bm.id;
    opt.innerHTML =
      `<img src="${bm.thumb}" alt="${label}">` +
      `<span class="bm-opt-label">${label}</span>`;
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      if (bm.id === currentBasemap) { closePanel(); return; }
      currentBasemap = bm.id;
      updateBtn();
      map.setStyle(bm.url);
      map.once("style.load", () => {
        addLayers();
        if (mapPanelControl) mapPanelControl.reapplyLayers();
      });
      closePanel();
    });
    panel.appendChild(opt);
  });

  const bm = BASEMAPS.find((b) => b.id === currentBasemap);
  const btn = document.createElement("button");
  btn.className = "bm-btn";
  btn.id = "bm-btn";
  btn.title = t("map.basemapSwitch");
  btn.innerHTML =
    `<img id="bm-current-thumb" src="${bm.thumb}" alt="${t("map.basemapLabel")}">` +
    `<span>${t("map.basemapLabel")}</span>`;

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
  mapHandlersRegistered = false;

  // Show loading spinner
  const containerEl = typeof container === "string" ? document.getElementById(container) : container;
  let spinner = containerEl.querySelector(".map-loading");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.className = "map-loading";
    spinner.innerHTML = `<div class="map-spinner"></div><div class="map-loading-text">${t("map.loading")}</div>`;
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

  // Map accordion panel (plain DOM, not a MapLibre control)
  mapPanelControl = createMapPanel(containerEl.parentElement);

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

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "280px" });

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
  if (map && map.getSource("buildings")) {
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
        label: row.internal_id || "",
        popupHtml: buildPopup(row, i)
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

function buildPopup(row, rowIndex) {
  const numScore = row.match_score !== "" && row.match_score != null ? Number(row.match_score) : null;
  const scorePct = numScore != null ? numScore + "%" : "N/A";
  const conf = confidenceLabel(numScore);
  const status = row.gwr_match || "";
  const egid = row.gwr_egid || row.egid || "";
  const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude) || null;
  const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude) || null;
  const lang = getLang();

  // External links (two rows: Swiss maps, Google maps)
  let linksHtml = "";
  if (lat != null && lng != null) {
    linksHtml = `<div class="popup-links">
      <div class="popup-link-row">
        <a href="https://map.geo.admin.ch/#/map?lang=${lang}&swisssearch=${lng},${lat}&topic=ech&layers=ch.bfs.gebaeude_wohnungs_register&bgLayer=ch.swisstopo.swissimage" target="_blank" rel="noopener">${t("map.gwrMap")}</a>
        <span class="popup-link-sep">\u00b7</span>
        <a href="https://map.geo.admin.ch/#/map?lang=${lang}&swisssearch=${lng},${lat}&topic=ech&layers=ch.swisstopo-vd.stand-oerebkataster&bgLayer=ch.swisstopo.swissimage" target="_blank" rel="noopener">${t("map.oereb")}</a>
      </div>
      <div class="popup-link-row">
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener">${t("map.googleMaps")}</a>
        <span class="popup-link-sep">\u00b7</span>
        <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener">${t("map.streetView")}</a>
      </div>
    </div>`;
  }

  // PDF report button
  const reportHtml = `<div class="popup-report">
    <button class="popup-report-btn" data-row-index="${rowIndex}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      ${t("report.popupBtn")}
    </button>
  </div>`;

  const color = scoreColor(numScore);

  return `<div class="map-popup">
  <div class="popup-header">
    <div class="popup-header-text">
      <span class="popup-id">${escapeHtml(row.internal_id || "\u2014")}</span>
      <span class="popup-egid">${escapeHtml(egid || "\u2014")}</span>
    </div>
    <button class="popup-close" aria-label="${t("map.popupClose")}" onclick="this.closest('.maplibregl-popup').remove()">&times;</button>
  </div>
  <div class="popup-address">
    ${escapeHtml(row.gwr_street || row.street || "")} ${escapeHtml(row.gwr_street_number || row.street_number || "")}<br>
    ${escapeHtml(row.gwr_zip || row.zip || "")} ${escapeHtml(row.gwr_city || row.city || "")}
  </div>
  <div class="popup-match">
    <span class="popup-score-dot" style="background:${color}"></span>
    <span class="popup-score">${scorePct}</span>
    <span class="popup-conf">${escapeHtml(conf)}</span>
    <span class="popup-status">${escapeHtml(status)}</span>
  </div>
  ${linksHtml}
  ${reportHtml}
</div>`;
}

/** Wire up the PDF report button inside the currently open popup */
function wirePopupReportBtn() {
  const el = popup.getElement();
  if (!el) return;
  const btn = el.querySelector(".popup-report-btn");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const idx = parseInt(btn.dataset.rowIndex);
    if (resultsData[idx]) {
      btn.disabled = true;
      btn.textContent = "\u2026";
      generateBuildingReport(resultsData[idx]).finally(() => {
        btn.disabled = false;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> ${t("report.popupBtn")}`;
      });
    }
  });
}

export function highlightMarker(rowIndex) {
  const row = resultsData[rowIndex];
  if (!row || !map) return;

  const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude) || null;
  const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude) || null;
  if (lat == null || lng == null) return;

  popup
    .setLngLat([lng, lat])
    .setHTML(buildPopup(row, rowIndex))
    .addTo(map);

  wirePopupReportBtn();
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13) });
}

export function resizeMap() {
  if (map) map.resize();
}
