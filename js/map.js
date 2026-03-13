/**
 * MapLibre GL JS map with CARTO basemap, circle markers, popups
 */
import { scoreColor, escapeHtml } from "./utils.js";

let map = null;
let popup = null;
let onMarkerClick = null;
let resultsData = [];

export function initMap(container, clickCallback) {
  onMarkerClick = clickCallback;

  if (map) {
    map.remove();
    map = null;
  }

  map = new maplibregl.Map({
    container,
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [8.2, 46.8],
    zoom: 7,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "260px" });

  map.on("load", () => {
    // Add empty source — will be populated by plotResults
    map.addSource("buildings", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
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

    // Click handler
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

    // Cursor
    map.on("mouseenter", "buildings-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "buildings-circle", () => { map.getCanvas().style.cursor = ""; });

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

  map.getSource("buildings").setData({
    type: "FeatureCollection",
    features
  });

  if (features.length > 0) {
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
