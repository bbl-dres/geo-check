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

/** Paper sizes in mm (width × height in portrait) */
const PAPER_SIZES = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  a2: { w: 420, h: 594 },
  a1: { w: 594, h: 841 },
  a0: { w: 841, h: 1189 },
};

/** PDF margin in mm */
const PDF_MARGIN = 12;

/** Header/footer reserved height in mm */
const PDF_HEADER_H = 10;
const PDF_FOOTER_H = 8;
const PDF_LEGEND_H = 10;

/** Get page dims from orientation string like "landscape-a3" */
function pageDims(orientation) {
  const [dir, size] = orientation.split("-");
  const paper = PAPER_SIZES[size] || PAPER_SIZES.a4;
  return dir === "landscape" ? { w: paper.h, h: paper.w } : { w: paper.w, h: paper.h };
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

/* ── Print preview overlay ── */

let printOverlay = null;

/** Get current meters-per-pixel at map center */
function metersPerPixel() {
  if (!map) return 1;
  const center = map.getCenter();
  const zoom = map.getZoom();
  return 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
}

/**
 * Compute the crop rectangle in screen pixels for the current settings.
 *
 * - "auto" scale: fit the page aspect ratio to fill the viewport
 * - Fixed scale (e.g. 1:25000): the rect represents a fixed real-world area.
 *   As the user zooms in the rect grows on screen; zooming out shrinks it.
 *   Only the map center (position) matters, not the zoom level.
 */
function computeCropRect() {
  if (!map) return null;
  const canvas = map.getCanvas();
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  const oriSel = document.getElementById("map-print-orientation");
  const scaleSel = document.getElementById("map-print-scale");
  if (!oriSel) return null;
  const dims = pageDims(oriSel.value);
  const scaleVal = scaleSel ? scaleSel.value : "auto";

  // Printable map area on paper in mm (minus margins, header, footer, legend)
  const mapW_mm = dims.w - PDF_MARGIN * 2;
  const mapH_mm = dims.h - PDF_MARGIN * 2 - PDF_HEADER_H - PDF_FOOTER_H - PDF_LEGEND_H;
  const aspect = mapW_mm / mapH_mm;

  let rw, rh;

  if (scaleVal === "auto") {
    // Fill viewport, maintaining page aspect ratio
    if (cw / ch > aspect) {
      rh = ch;
      rw = ch * aspect;
    } else {
      rw = cw;
      rh = cw / aspect;
    }
  } else {
    // Fixed scale: calculate real-world extent, convert to screen pixels
    const scale = parseInt(scaleVal);
    const mpp = metersPerPixel();

    // Paper mm × scale → real-world meters → screen pixels
    const realW_m = (mapW_mm / 1000) * scale; // mm → m × scale
    const realH_m = (mapH_mm / 1000) * scale;
    rw = realW_m / mpp;
    rh = realH_m / mpp;
  }

  return {
    x: (cw - rw) / 2,
    y: (ch - rh) / 2,
    w: rw,
    h: rh,
    overflows: rw > cw || rh > ch,
  };
}

/** Show / update the semi-transparent preview overlay on the map */
function showPrintPreview() {
  if (!map) return;
  const container = map.getContainer();
  if (!printOverlay) {
    printOverlay = document.createElement("canvas");
    printOverlay.className = "print-preview-overlay";
    printOverlay.style.cssText = "position:absolute;inset:0;z-index:4;pointer-events:none;";
    container.appendChild(printOverlay);
  }
  drawPreviewOverlay();
}

/** Remove the preview overlay */
function hidePrintPreview() {
  if (printOverlay) {
    printOverlay.remove();
    printOverlay = null;
  }
}

/** Draw the dark mask with clear crop window */
function drawPreviewOverlay() {
  if (!printOverlay || !map) return;
  const canvas = map.getCanvas();
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  printOverlay.width = cw * dpr;
  printOverlay.height = ch * dpr;
  printOverlay.style.width = cw + "px";
  printOverlay.style.height = ch + "px";

  const ctx = printOverlay.getContext("2d");
  ctx.scale(dpr, dpr);

  const rect = computeCropRect();
  if (!rect) return;

  // Clamp the visible crop window to the viewport
  const vx = Math.max(0, rect.x);
  const vy = Math.max(0, rect.y);
  const vx2 = Math.min(cw, rect.x + rect.w);
  const vy2 = Math.min(ch, rect.y + rect.h);
  const vw = Math.max(0, vx2 - vx);
  const vh = Math.max(0, vy2 - vy);

  // Dark mask
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 0, cw, ch);

  // Clear the visible portion of the crop window
  if (vw > 0 && vh > 0) {
    ctx.clearRect(vx, vy, vw, vh);
  }

  // Crop border (draw even if partially off-screen for context)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  // Corner marks (only if visible within viewport)
  const markLen = 12;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  const corners = [
    [rect.x, rect.y], [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h],
  ];
  for (const [cx, cy] of corners) {
    if (cx < -markLen || cx > cw + markLen || cy < -markLen || cy > ch + markLen) continue;
    const sx = cx === rect.x ? 1 : -1;
    const sy = cy === rect.y ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx + sx * markLen, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * markLen);
    ctx.stroke();
  }

  // Info label below crop area
  const oriSel = document.getElementById("map-print-orientation");
  const scaleSel = document.getElementById("map-print-scale");
  if (oriSel) {
    const pageLabel = oriSel.options[oriSel.selectedIndex].text;
    const scaleVal = scaleSel ? scaleSel.value : "auto";
    const scaleLabel = scaleVal === "auto"
      ? `1:${getMapScale().toLocaleString("de-CH")}`
      : `1:${parseInt(scaleVal).toLocaleString("de-CH")}`;
    const label = `${pageLabel}  \u00b7  ${scaleLabel}`;

    const labelY = Math.min(rect.y + rect.h + 18, ch - 6);
    ctx.font = "600 12px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.textAlign = "center";
    ctx.fillText(label, cw / 2, labelY);
  }

  // Warning if crop area overflows viewport
  if (rect.overflows) {
    ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
    ctx.textAlign = "center";
    const warnY = Math.min(rect.y + rect.h + 34, ch - 6);
    ctx.fillText("\u26a0 " + t("map.printZoomOut"), cw / 2, warnY);
  }
}

/* ── PDF generation via jsPDF ── */

/** Target print DPI — balanced between quality and GPU limits */
const PRINT_DPI = 150;

/** Max tile size for offscreen WebGL renders (safe for most GPUs) */
const RENDER_TILE_SIZE = 1536;

/** Lazy-load jsPDF (reuses same CDN as report.js) */
async function ensureJsPDF() {
  if (window.jspdf) return;
  const load = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  await load("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
}

/**
 * Convert a pixel offset from the composite center to [lng, lat]
 * at a given zoom level, using Web Mercator projection (pixelRatio = 1).
 */
function offsetToLngLat(centerLng, centerLat, zoom, dxPx, dyPx) {
  const scale = 256 * Math.pow(2, zoom);
  const cx = ((centerLng + 180) / 360) * scale;
  const latRad = (centerLat * Math.PI) / 180;
  const cy =
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
    2 *
    scale;
  const nx = cx + dxPx;
  const ny = cy + dyPx;
  const lng = (nx / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * ny) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lng, lat];
}

/**
 * Render one tile of the map. Returns a 2D canvas copy
 * (safe to use after the WebGL context is destroyed).
 */
function renderMapTile(center, zoom, widthPx, heightPx) {
  return new Promise((resolve, reject) => {
    const offDiv = document.createElement("div");
    offDiv.style.cssText =
      `position:fixed;left:-9999px;top:-9999px;` +
      `width:${widthPx}px;height:${heightPx}px;visibility:hidden;`;
    document.body.appendChild(offDiv);

    const basemap = BASEMAPS.find((b) => b.id === currentBasemap);
    const offMap = new maplibregl.Map({
      container: offDiv,
      style: basemap
        ? basemap.url
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center,
      zoom,
      preserveDrawingBuffer: true,
      interactive: false,
      fadeDuration: 0,
      attributionControl: false,
      pixelRatio: 1,
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Tile render timed out"));
    }, 30000);

    function cleanup() {
      clearTimeout(timeout);
      offMap.remove();
      offDiv.remove();
    }

    offMap.once("idle", () => {
      const isDark = currentBasemap === "dark-matter";
      offMap.addSource("buildings", { type: "geojson", data: lastGeoJSON });
      offMap.addLayer({
        id: "buildings-circle",
        type: "circle",
        source: "buildings",
        paint: {
          "circle-radius": 7,
          "circle-color": ["get", "color"],
          "circle-stroke-color": isDark ? "#2d2d2d" : "#fff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.85,
        },
      });
      offMap.addLayer({
        id: "buildings-label",
        type: "symbol",
        source: "buildings",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-anchor": "bottom",
          "text-offset": [0, -0.8],
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": isDark ? "#e5e7eb" : "#1a1a2e",
          "text-halo-color": isDark ? "#1a1a2e" : "#fff",
          "text-halo-width": 1.5,
        },
      });

      offMap.once("idle", () => {
        try {
          const srcCanvas = offMap.getCanvas();
          // Copy pixels to a 2D canvas before destroying the WebGL context
          const copy = document.createElement("canvas");
          copy.width = srcCanvas.width;
          copy.height = srcCanvas.height;
          copy.getContext("2d").drawImage(srcCanvas, 0, 0);
          cleanup();
          resolve(copy);
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    });
  });
}

/**
 * Render a high-resolution map image by tiling multiple WebGL renders
 * and compositing them onto a single 2D canvas.
 * @param {LngLat} center   Map center
 * @param {number}  zoom     Zoom level for the render
 * @param {number}  totalW   Total output width in pixels
 * @param {number}  totalH   Total output height in pixels
 * @param {Function} [onProgress] Called with (done, total) after each tile
 * @returns {Promise<string>} JPEG data URL
 */
async function renderOffscreenMap(center, zoom, totalW, totalH, onProgress) {
  const tileSize = RENDER_TILE_SIZE;
  const cols = Math.ceil(totalW / tileSize);
  const rows = Math.ceil(totalH / tileSize);
  const total = cols * rows;

  const composite = document.createElement("canvas");
  composite.width = totalW;
  composite.height = totalH;
  const ctx = composite.getContext("2d");

  let done = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * tileSize;
      const y0 = row * tileSize;
      const tw = Math.min(tileSize, totalW - x0);
      const th = Math.min(tileSize, totalH - y0);

      // Pixel offset of this tile's center relative to the composite center
      const dx = x0 + tw / 2 - totalW / 2;
      const dy = y0 + th / 2 - totalH / 2;

      const tileCenter = offsetToLngLat(
        center.lng,
        center.lat,
        zoom,
        dx,
        dy,
      );

      const tileCanvas = await renderMapTile(tileCenter, zoom, tw, th);
      ctx.drawImage(tileCanvas, x0, y0);

      done++;
      if (onProgress) onProgress(done, total);
    }
  }

  return composite.toDataURL("image/jpeg", 0.92);
}

/** Generate and download the PDF */
async function printMap() {
  const orientationEl = document.getElementById("map-print-orientation");
  const scaleEl = document.getElementById("map-print-scale");
  const legendEl = document.getElementById("map-print-legend");
  const btn = document.getElementById("map-print-btn");

  const orientation = orientationEl.value;
  const scaleVal = scaleEl.value;
  const includeLegend = legendEl.checked;
  const dims = pageDims(orientation);

  const origText = btn.textContent;
  btn.textContent = t("map.printGenerating");
  btn.disabled = true;

  try {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const isLandscape = orientation.startsWith("landscape");
    const [, size] = orientation.split("-");
    const doc = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "mm",
      format: size,
    });

    const pw = dims.w;
    const ph = dims.h;
    const m = PDF_MARGIN;
    const cw = pw - m * 2; // content width

    // ── Header ──
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.setTextColor(26, 54, 93);
    doc.text("Geo-Check", m, m + 7);

    // Dataset context: filename · building count · date
    const fileName = document.getElementById("header-filename")?.textContent || "";
    const nBuildings = resultsData.length;
    const metaParts = [];
    if (fileName) metaParts.push(fileName);
    if (nBuildings) metaParts.push(`${nBuildings} ${t("map.printBuildings")}`);
    metaParts.push(new Date().toLocaleDateString("de-CH"));

    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(metaParts.join("  \u00b7  "), pw - m, m + 7, { align: "right" });

    doc.setDrawColor(209, 213, 219);
    doc.line(m, m + PDF_HEADER_H, pw - m, m + PDF_HEADER_H);

    // ── Map image (high-res offscreen render) ──
    const mapTop = m + PDF_HEADER_H + 2;
    const legendH = includeLegend ? PDF_LEGEND_H : 0;
    const mapH = ph - mapTop - m - PDF_FOOTER_H - legendH - 2;
    const mapW_mm = cw;
    const mapH_mm = mapH;

    if (map) {
      const center = map.getCenter();

      // Target pixel dimensions at PRINT_DPI (no cap — tiling handles large sizes)
      const targetW = Math.round((mapW_mm / 25.4) * PRINT_DPI);
      const targetH = Math.round((mapH_mm / 25.4) * PRINT_DPI);

      // Calculate zoom level for the offscreen render
      let renderZoom;
      if (scaleVal === "auto") {
        renderZoom = map.getZoom();
      } else {
        // Fixed scale: paper width at scale S covers (mapW_mm / 1000 * S) meters
        // → metersPerPixel = realWidth / targetW → zoom from that
        const scale = parseInt(scaleVal);
        const realW_m = (mapW_mm / 1000) * scale;
        const targetMpp = realW_m / targetW;
        const lat = center.lat;
        renderZoom = Math.log2(
          (156543.03392 * Math.cos((lat * Math.PI) / 180)) / targetMpp,
        );
      }

      const imgData = await renderOffscreenMap(
        center,
        renderZoom,
        targetW,
        targetH,
        (done, total) => {
          if (total > 1) {
            btn.textContent = `${t("map.printGenerating")} (${done}/${total})`;
          }
        },
      );
      doc.addImage(imgData, "JPEG", m, mapTop, cw, mapH);

      // Border around map
      doc.setDrawColor(209, 213, 219);
      doc.rect(m, mapTop, cw, mapH);

      // North arrow (top-right of map)
      const nx = m + cw - 8;
      const ny = mapTop + 6;
      doc.setFillColor(255, 255, 255);
      doc.setGState(new doc.GState({ opacity: 0.8 }));
      doc.circle(nx, ny + 4, 6, "F");
      doc.setGState(new doc.GState({ opacity: 1 }));
      // Arrow pointing up
      doc.setFillColor(31, 41, 55);
      doc.triangle(nx, ny, nx - 2.2, ny + 5, nx + 2.2, ny + 5, "F");
      doc.setFillColor(180, 180, 180);
      doc.triangle(nx, ny + 10, nx - 2.2, ny + 5, nx + 2.2, ny + 5, "F");
      // "N" label
      doc.setFontSize(7);
      doc.setFont(undefined, "bold");
      doc.setTextColor(31, 41, 55);
      doc.text("N", nx, ny - 1.5, { align: "center" });

      // Scale bar (bottom-left of map)
      const currentScale = scaleVal === "auto" ? getMapScale() : parseInt(scaleVal);
      const coordText = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
      const scaleText = `1:${currentScale.toLocaleString("de-CH")}`;
      const infoText = `${scaleText}  |  ${coordText}`;
      doc.setFontSize(7);
      doc.setFont(undefined, "normal");
      const infoW = doc.getTextWidth(infoText) + 6;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(m + 3, mapTop + mapH - 9, infoW, 7, 1, 1, "F");
      doc.setTextColor(31, 41, 55);
      doc.text(infoText, m + 6, mapTop + mapH - 4);

      // Attribution (bottom-right of map)
      const attrText = "\u00a9 OpenStreetMap \u00b7 CARTO \u00b7 swisstopo";
      doc.setFontSize(6);
      const attrW = doc.getTextWidth(attrText) + 4;
      doc.setFillColor(255, 255, 255);
      doc.setGState(new doc.GState({ opacity: 0.75 }));
      doc.roundedRect(m + cw - attrW - 3, mapTop + mapH - 8, attrW + 2, 6, 1, 1, "F");
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.setTextColor(80, 80, 80);
      doc.text(attrText, m + cw - 3, mapTop + mapH - 4, { align: "right" });
    }

    // ── Legend ──
    if (includeLegend) {
      const legY = mapTop + mapH + 3;
      doc.setFontSize(8);
      doc.setFont(undefined, "bold");
      doc.setTextColor(31, 41, 55);
      doc.text(t("map.printLegend"), m, legY + 3);

      // Use ASCII-safe labels — jsPDF's default font mishandles ≥, –, thin spaces
      const colors = [
        { rgb: [34, 197, 94], label: ">= 80%" },
        { rgb: [234, 179, 8], label: "50-79%" },
        { rgb: [239, 68, 68], label: "< 50%" },
        { rgb: [156, 163, 175], label: t("map.legendNone") },
      ];
      let lx = m + 22;
      doc.setFontSize(7);
      doc.setFont(undefined, "normal");
      for (const c of colors) {
        // Circle marker (matches map dots)
        doc.setFillColor(...c.rgb);
        doc.circle(lx + 2, legY + 2, 2, "F");
        doc.setTextColor(55, 65, 81);
        doc.text(c.label, lx + 6, legY + 3);
        lx += doc.getTextWidth(c.label) + 12;
      }
    }

    // ── Footer ──
    const footY = ph - m;
    doc.setDrawColor(209, 213, 219);
    doc.line(m, footY - PDF_FOOTER_H, pw - m, footY - PDF_FOOTER_H);
    doc.setFontSize(7);
    doc.setFont(undefined, "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("Quelle: Geo-Check", m, footY - 2);
    doc.text(`\u00a9 ${new Date().getFullYear()} Bundesamt f\u00fcr Bauten und Logistik`, pw - m, footY - 2, { align: "right" });

    // ── Save ──
    const ts = new Date().toISOString().slice(0, 10);
    doc.save(`geo-check-${size}-${ts}.pdf`);
  } catch (err) {
    console.error("PDF generation failed:", err);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
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
  oriSel.innerHTML = [
    `<option value="landscape-a4">A4 landscape</option>`,
    `<option value="portrait-a4">A4 portrait</option>`,
    `<option value="landscape-a3">A3 landscape</option>`,
    `<option value="portrait-a3">A3 portrait</option>`,
    `<option value="landscape-a2">A2 landscape</option>`,
    `<option value="portrait-a2">A2 portrait</option>`,
    `<option value="landscape-a1">A1 landscape</option>`,
    `<option value="portrait-a1">A1 portrait</option>`,
    `<option value="landscape-a0">A0 landscape</option>`,
    `<option value="portrait-a0">A0 portrait</option>`,
  ].join("");
  oriRow.appendChild(oriSel);
  printPanel.appendChild(oriRow);

  // Scale row
  const scaleRow = document.createElement("div");
  scaleRow.className = "map-acc-form-row";
  scaleRow.innerHTML = `<label for="map-print-scale" class="map-acc-form-label">${t("map.printScale")}</label>`;
  const scaleSel = document.createElement("select");
  scaleSel.id = "map-print-scale";
  scaleSel.className = "map-acc-select";
  scaleSel.innerHTML = `<option value="auto">${t("map.printScaleAuto")}</option><option value="500">1:500</option><option value="1000">1:1'000</option><option value="2500">1:2'500</option><option value="5000">1:5'000</option><option value="10000">1:10'000</option><option value="25000">1:25'000</option><option value="50000">1:50'000</option><option value="100000">1:100'000</option><option value="250000">1:250'000</option><option value="500000">1:500'000</option>`;
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

  // Show/hide preview overlay when print accordion opens/closes
  const handlePrintToggle = () => {
    toggleAcc(printHeader, printContent);
    if (printHeader.classList.contains("active")) {
      showPrintPreview();
    } else {
      hidePrintPreview();
    }
  };
  printHeader.addEventListener("click", handlePrintToggle);

  // Update preview when settings change
  oriSel.addEventListener("change", drawPreviewOverlay);
  scaleSel.addEventListener("change", drawPreviewOverlay);
  legRow.querySelector("input").addEventListener("change", drawPreviewOverlay);

  // Update preview on map move/zoom
  if (map) {
    map.on("move", drawPreviewOverlay);
    map.on("resize", drawPreviewOverlay);
  }

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
  mapHeader.addEventListener("click", () => {
    toggleAcc(mapHeader, mapContent);
    hidePrintPreview(); // close preview when switching to layers tab
  });

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
    if (!menuOpen) hidePrintPreview();
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
  hidePrintPreview();

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
    attributionControl: false,
    preserveDrawingBuffer: true
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
