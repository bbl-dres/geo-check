// ========================================
// Map Module
// Mapbox GL JS map, clustering, basemaps, layers
// ========================================

import { state, buildings, getFilteredBuildings, updateURL } from './state.js';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGF2aWRyYXNuZXI1IiwiYSI6ImNtMm5yamVkdjA5MDcycXMyZ2I2MHRhamgifQ.m651j7WIX7MyxNh8KIQ1Gg';

// Map instance
export let map = null;

// Basemap state
let currentBasemap = 'grey';

// Overlay layers state
const activeOverlayLayers = new Set();

// Buildings layer visibility state
let markersVisible = true;

// Context menu state
let contextMenuLatLng = null;

// Identify request controller
let identifyController = null;

// Popup instance for layer identify
let identifyPopup = null;

// Pending click handler (set before layers are ready)
let pendingClickHandler = null;

// Pending initial selection (set before layers are ready)
let pendingSelection = null;

// Flag to track if building layers have been created
let markersReady = false;

// Flag to track if a filter update is pending
let pendingFilterUpdate = false;

// Stored click handler for re-attaching after style changes
let storedClickHandler = null;

// Edit marker (single DOM marker for drag-edit mode)
let editMarker = null;
let editMarkerId = null;

// Building layer IDs for easy reference
const BUILDING_LAYERS = [
  'selected-point-halo',
  'clusters',
  'cluster-count',
  'unclustered-point',
  'selected-point',
  'unclustered-label'
];

// ========================================
// Coordinate Conversion (WGS84 to LV95)
// ========================================
export function wgs84ToLV95(lat, lng) {
  const latSec = lat * 3600;
  const lngSec = lng * 3600;

  const latAux = (latSec - 169028.66) / 10000;
  const lngAux = (lngSec - 26782.5) / 10000;

  const E = 2600072.37
    + 211455.93 * lngAux
    - 10938.51 * lngAux * latAux
    - 0.36 * lngAux * latAux * latAux
    - 44.54 * lngAux * lngAux * lngAux;

  const N = 1200147.07
    + 308807.95 * latAux
    + 3745.25 * lngAux * lngAux
    + 76.63 * latAux * latAux
    - 194.56 * lngAux * lngAux * latAux
    + 119.79 * latAux * latAux * latAux;

  return { E: Math.round(E), N: Math.round(N) };
}

// ========================================
// Basemap Configuration
// ========================================
const basemapConfigs = {
  none: {
    style: {
      version: 8,
      sources: {},
      layers: [{
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f8f8f8' }
      }]
    }
  },
  grey: {
    style: 'mapbox://styles/mapbox/light-v11'
  },
  color: {
    style: 'mapbox://styles/mapbox/streets-v12'
  },
  satellite: {
    style: 'mapbox://styles/mapbox/satellite-streets-v12'
  }
};

// ========================================
// Layer Configuration
// Keys must match data-layer attributes in HTML
// ========================================
const layerConfigs = {
  'ch.swisstopo-vd.stand-oerebkataster': {
    name: 'ÖREB Verfügbarkeit',
    url: 'https://wms.geo.admin.ch/',
    layers: 'ch.swisstopo-vd.stand-oerebkataster',
    sourceId: 'oereb-wms',
    layerId: 'oereb-layer'
  },
  'ch.bfs.gebaeude_wohnungs_register': {
    name: 'GWR Gebäudestatus',
    url: 'https://wms.geo.admin.ch/',
    layers: 'ch.bfs.gebaeude_wohnungs_register',
    sourceId: 'gwr-wms',
    layerId: 'gwr-layer'
  }
};

// ========================================
// GeoJSON Conversion
// ========================================
export function getConfidenceClass(confidence) {
  if (confidence < 50) return 'critical';
  if (confidence < 80) return 'warning';
  return 'ok';
}

function buildingsToGeoJSON(buildingsList) {
  return {
    type: 'FeatureCollection',
    features: buildingsList
      .filter(b => b.mapLng && b.mapLat)
      .map(b => ({
        type: 'Feature',
        properties: {
          id: b.id,
          confidence: b.confidence.total,
          confidenceClass: getConfidenceClass(b.confidence.total)
        },
        geometry: {
          type: 'Point',
          coordinates: [b.mapLng, b.mapLat]
        }
      }))
  };
}

// ========================================
// Building Layers (Source + Clustered Layers)
// ========================================
function addBuildingLayers() {
  const filtered = markersVisible ? getFilteredBuildings() : [];

  map.addSource('buildings-source', {
    type: 'geojson',
    data: buildingsToGeoJSON(filtered),
    cluster: true,
    clusterMaxZoom: 11,
    clusterRadius: 40,
    promoteId: 'id'
  });

  // 1. Selected point halo (outer glow ring)
  map.addLayer({
    id: 'selected-point-halo',
    type: 'circle',
    source: 'buildings-source',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        8, 12,
        12, 16,
        16, 20
      ],
      'circle-color': 'transparent',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#1a365d'
    }
  });

  // 2. Cluster circles
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'buildings-source',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#1a365d',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        16,    // radius for count < 50
        50, 20,  // radius for count < 200
        200, 26  // radius for count >= 200
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // 3. Cluster count labels
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'buildings-source',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 13,
      'text-allow-overlap': true
    },
    paint: {
      'text-color': '#ffffff'
    }
  });

  // 4. Unclustered point circles (confidence-colored)
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'buildings-source',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': [
        'match',
        ['get', 'confidenceClass'],
        'critical', '#dc2626',
        'warning', '#d97706',
        'ok', '#059669',
        '#888888'
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        8, 5,
        12, 8,
        16, 11
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // 5. Selected point highlight (above normal points)
  map.addLayer({
    id: 'selected-point',
    type: 'circle',
    source: 'buildings-source',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': [
        'match',
        ['get', 'confidenceClass'],
        'critical', '#dc2626',
        'warning', '#d97706',
        'ok', '#059669',
        '#888888'
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        8, 7,
        12, 11,
        16, 14
      ],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#1a365d'
    }
  });

  // 6. Unclustered labels (building IDs at high zoom)
  map.addLayer({
    id: 'unclustered-label',
    type: 'symbol',
    source: 'buildings-source',
    filter: ['!', ['has', 'point_count']],
    minzoom: 14,
    layout: {
      'text-field': ['get', 'id'],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-offset': [0, -1.5],
      'text-anchor': 'bottom',
      'text-allow-overlap': false
    },
    paint: {
      'text-color': '#1a1a1a',
      'text-halo-color': 'rgba(255, 255, 255, 0.95)',
      'text-halo-width': 2
    }
  });
}

function removeBuildingLayers() {
  BUILDING_LAYERS.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });
  if (map.getSource('buildings-source')) {
    map.removeSource('buildings-source');
  }
}

function readdBuildingLayers() {
  if (!markersReady) return;
  if (map.getSource('buildings-source')) return;

  addBuildingLayers();

  // Re-apply selection if any
  if (state.selectedBuildingId) {
    map.setFilter('selected-point', ['==', ['get', 'id'], state.selectedBuildingId]);
    map.setFilter('selected-point-halo', ['==', ['get', 'id'], state.selectedBuildingId]);
  }

  // Re-apply visibility
  if (!markersVisible) {
    setBuildingLayersVisibility('none');
  }

  // Re-attach click handlers
  if (storedClickHandler) {
    setupLayerClickHandlers(storedClickHandler);
  }
}

function setBuildingLayersVisibility(visibility) {
  BUILDING_LAYERS.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  });
}

// ========================================
// Layer Click & Hover Handlers
// ========================================

// Named handler references for clean removal
let _onClickUnclustered = null;
let _onClickSelected = null;
let _onClickCluster = null;
let _onEnterUnclustered = null;
let _onLeaveUnclustered = null;
let _onEnterCluster = null;
let _onLeaveCluster = null;
let _onEnterSelected = null;
let _onLeaveSelected = null;

function removeLayerClickHandlers() {
  if (_onClickUnclustered) {
    map.off('click', 'unclustered-point', _onClickUnclustered);
    map.off('click', 'selected-point', _onClickSelected);
    map.off('click', 'clusters', _onClickCluster);
    map.off('mouseenter', 'unclustered-point', _onEnterUnclustered);
    map.off('mouseleave', 'unclustered-point', _onLeaveUnclustered);
    map.off('mouseenter', 'clusters', _onEnterCluster);
    map.off('mouseleave', 'clusters', _onLeaveCluster);
    map.off('mouseenter', 'selected-point', _onEnterSelected);
    map.off('mouseleave', 'selected-point', _onLeaveSelected);
  }
}

function setupLayerClickHandlers(selectBuildingFn) {
  // Remove any previously registered handlers to prevent stacking
  removeLayerClickHandlers();

  // Click on unclustered point → select building
  _onClickUnclustered = (e) => {
    if (!e.features || e.features.length === 0) return;
    const id = e.features[0].properties.id;
    selectBuildingFn(id);
  };

  // Click on selected-point layer (already selected)
  _onClickSelected = (e) => {
    if (!e.features || e.features.length === 0) return;
    const id = e.features[0].properties.id;
    selectBuildingFn(id);
  };

  // Click on cluster → zoom to expand
  _onClickCluster = (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    map.getSource('buildings-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom,
        duration: 400
      });
    });
  };

  // Cursor changes
  _onEnterUnclustered = () => { map.getCanvas().style.cursor = 'pointer'; };
  _onLeaveUnclustered = () => { map.getCanvas().style.cursor = ''; };
  _onEnterCluster = () => { map.getCanvas().style.cursor = 'pointer'; };
  _onLeaveCluster = () => { map.getCanvas().style.cursor = ''; };
  _onEnterSelected = () => { map.getCanvas().style.cursor = 'pointer'; };
  _onLeaveSelected = () => { map.getCanvas().style.cursor = ''; };

  map.on('click', 'unclustered-point', _onClickUnclustered);
  map.on('click', 'selected-point', _onClickSelected);
  map.on('click', 'clusters', _onClickCluster);
  map.on('mouseenter', 'unclustered-point', _onEnterUnclustered);
  map.on('mouseleave', 'unclustered-point', _onLeaveUnclustered);
  map.on('mouseenter', 'clusters', _onEnterCluster);
  map.on('mouseleave', 'clusters', _onLeaveCluster);
  map.on('mouseenter', 'selected-point', _onEnterSelected);
  map.on('mouseleave', 'selected-point', _onLeaveSelected);
}

// ========================================
// Edit Marker (for drag-edit in detail panel)
// ========================================
export function getOrCreateEditMarker(buildingId) {
  if (editMarker && editMarkerId === buildingId) {
    return editMarker;
  }

  removeEditMarker();

  const building = buildings.find(b => b.id === buildingId);
  if (!building) return null;

  const confidenceClass = getConfidenceClass(building.confidence.total);
  const el = document.createElement('div');
  el.className = 'mapbox-marker-wrapper';
  el.innerHTML = `<div class="custom-marker-container">
                    <div class="custom-marker ${confidenceClass}" data-id="${building.id}"></div>
                    <span class="marker-label">${building.id}</span>
                  </div>`;

  editMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([building.mapLng, building.mapLat])
    .addTo(map);
  editMarkerId = buildingId;

  return editMarker;
}

export function removeEditMarker() {
  if (editMarker) {
    editMarker.remove();
    editMarker = null;
    editMarkerId = null;
  }
}

// ========================================
// Map Initialization
// ========================================
export function initMap() {
  map = new mapboxgl.Map({
    container: 'map',
    style: basemapConfigs[currentBasemap].style,
    center: [8.2, 46.8],
    zoom: 7.8,
    minZoom: 3,
    maxZoom: 22
  });

  // Disable map rotation
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  // Add controls after map loads
  map.on('load', () => {
    const nav = new mapboxgl.NavigationControl({ showCompass: false });
    map.addControl(nav, 'top-right');

    addHomeButton();

    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Add building layers with clustering
    addBuildingLayers();
    markersReady = true;

    // Apply pending click handler
    if (pendingClickHandler) {
      storedClickHandler = pendingClickHandler;
      setupLayerClickHandlers(pendingClickHandler);
      pendingClickHandler = null;
    }

    // Apply pending initial selection
    if (pendingSelection) {
      selectMarker(pendingSelection);
      pendingSelection = null;
    }

    // Apply pending filter update
    if (pendingFilterUpdate) {
      pendingFilterUpdate = false;
      updateMapMarkers();
    }

    // Re-add any active overlay layers after style load
    readdOverlayLayers();

    // Hide POI layers
    hidePoiLayers();
  });

  // Update zoom button states based on current zoom
  map.on('zoom', updateZoomButtonStates);
  map.on('load', updateZoomButtonStates);

  // Handle style changes (for basemap switching)
  map.on('style.load', () => {
    readdOverlayLayers();
    hidePoiLayers();
    readdBuildingLayers();
  });
}

// ========================================
// Hide POI Layers (shops, restaurants, etc.)
// ========================================
function hidePoiLayers() {
  const style = map.getStyle();
  if (!style || !style.layers) return;

  style.layers.forEach(layer => {
    const id = layer.id.toLowerCase();
    if (id.includes('poi') ||
        id.includes('shop') ||
        id.includes('store') ||
        id.includes('restaurant') ||
        id.includes('food') ||
        id.includes('cafe') ||
        id.includes('bar') ||
        id.includes('hotel') ||
        id.includes('lodging') ||
        id.includes('attraction') ||
        id.includes('entertainment')) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });
}

// ========================================
// Home Button Control
// ========================================
function addHomeButton() {
  const navContainer = document.querySelector('.mapboxgl-ctrl-top-right .mapboxgl-ctrl-group');
  if (!navContainer) return;

  const homeBtn = document.createElement('button');
  homeBtn.className = 'mapboxgl-ctrl-home';
  homeBtn.type = 'button';
  homeBtn.title = 'Auf aktive Gebäude zoomen';
  homeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

  homeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomToVisibleMarkers();
  });

  navContainer.appendChild(homeBtn);
}

// ========================================
// Zoom Button States
// ========================================
function updateZoomButtonStates() {
  const zoom = map.getZoom();
  const minZoom = map.getMinZoom();
  const maxZoom = map.getMaxZoom();

  const zoomInBtn = document.querySelector('.mapboxgl-ctrl-zoom-in');
  const zoomOutBtn = document.querySelector('.mapboxgl-ctrl-zoom-out');

  if (zoomInBtn) {
    zoomInBtn.disabled = zoom >= maxZoom;
    zoomInBtn.classList.toggle('mapboxgl-ctrl-disabled', zoom >= maxZoom);
  }

  if (zoomOutBtn) {
    zoomOutBtn.disabled = zoom <= minZoom;
    zoomOutBtn.classList.toggle('mapboxgl-ctrl-disabled', zoom <= minZoom);
  }
}

// ========================================
// Building Marker Functions (GeoJSON-based)
// ========================================

/**
 * Recreate all building layers from current buildings data.
 * Call this when data is reloaded (e.g., after sign in).
 */
export function recreateMarkers(clickHandler = null) {
  if (!map) return;

  removeEditMarker();
  removeBuildingLayers();
  markersReady = false;

  addBuildingLayers();

  if (clickHandler) {
    storedClickHandler = clickHandler;
    setupLayerClickHandlers(clickHandler);
  } else if (storedClickHandler) {
    setupLayerClickHandlers(storedClickHandler);
  } else if (pendingClickHandler) {
    storedClickHandler = pendingClickHandler;
    setupLayerClickHandlers(pendingClickHandler);
    pendingClickHandler = null;
  }

  markersReady = true;

  if (pendingFilterUpdate) {
    pendingFilterUpdate = false;
    updateMapMarkers();
  }
}

export function zoomToVisibleMarkers() {
  const filtered = getFilteredBuildings();
  if (filtered.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();
  filtered.forEach(b => bounds.extend([b.mapLng, b.mapLat]));

  map.fitBounds(bounds, { padding: 50 });
}

export function updateMapMarkers() {
  if (!markersReady) {
    pendingFilterUpdate = true;
    return;
  }

  const source = map.getSource('buildings-source');
  if (!source) return;

  const filtered = markersVisible ? getFilteredBuildings() : [];
  source.setData(buildingsToGeoJSON(filtered));
}

export function selectMarker(buildingId) {
  const building = buildings.find(b => b.id === buildingId);
  if (!building) return;

  if (!markersReady) {
    pendingSelection = buildingId;
    return;
  }

  // Stop any in-progress animation to prevent visual glitches
  map.stop();

  // Update selection layer filters
  if (map.getLayer('selected-point')) {
    map.setFilter('selected-point', ['==', ['get', 'id'], buildingId]);
  }
  if (map.getLayer('selected-point-halo')) {
    map.setFilter('selected-point-halo', ['==', ['get', 'id'], buildingId]);
  }

  // Navigate to building — speed depends on distance
  const target = [building.mapLng, building.mapLat];
  const targetZoom = Math.max(map.getZoom(), 14);
  const bounds = map.getBounds();
  const inView = bounds.contains(target);

  if (inView && map.getZoom() >= 12) {
    // Already visible and zoomed in — quick pan, no zoom change
    map.easeTo({ center: target, duration: 300 });
  } else if (inView) {
    // In view but zoomed out — fast ease with zoom
    map.easeTo({ center: target, zoom: targetZoom, duration: 500 });
  } else {
    // Off-screen — fly but with higher speed
    map.flyTo({ center: target, zoom: targetZoom, speed: 3, maxDuration: 1500 });
  }
}

export function deselectAllMarkers() {
  if (map.getLayer('selected-point')) {
    map.setFilter('selected-point', ['==', ['get', 'id'], '']);
  }
  if (map.getLayer('selected-point-halo')) {
    map.setFilter('selected-point-halo', ['==', ['get', 'id'], '']);
  }
  removeEditMarker();
}

export function setMarkersVisible(visible) {
  markersVisible = visible;
  if (visible) {
    setBuildingLayersVisibility('visible');
    updateMapMarkers();
  } else {
    setBuildingLayersVisibility('none');
  }
}

export function getMarkersVisible() {
  return markersVisible;
}

// ========================================
// Basemap Functions
// ========================================
export function switchBasemapTiles(basemapId) {
  const config = basemapConfigs[basemapId];
  if (!config) return;

  currentBasemap = basemapId;
  map.setStyle(config.style);
}

export function setupBasemapSelector() {
  const selector = document.getElementById('basemap-selector');
  const trigger = document.getElementById('basemap-trigger');
  const triggerThumb = document.getElementById('basemap-trigger-thumb');
  const triggerLabel = document.getElementById('basemap-trigger-label');
  const options = document.querySelectorAll('.basemap-option');

  const basemapLabels = {
    none: 'Kein HG',
    grey: 'Grau',
    color: 'Farbig',
    satellite: 'Luftbild'
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    selector.classList.toggle('expanded');
  });

  options.forEach(option => {
    option.addEventListener('click', () => {
      const basemap = option.dataset.basemap;
      currentBasemap = basemap;

      options.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');

      triggerThumb.className = 'basemap-thumb basemap-' + basemap;
      triggerLabel.textContent = basemapLabels[basemap] || basemap;

      switchBasemapTiles(basemap);
      selector.classList.remove('expanded');
    });
  });

  document.addEventListener('click', (e) => {
    if (!selector.contains(e.target)) {
      selector.classList.remove('expanded');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selector.classList.remove('expanded');
    }
  });
}

// ========================================
// Layer Widget
// ========================================
export function setupLayerWidget() {
  const widget = document.getElementById('layer-widget');
  const trigger = document.getElementById('layer-widget-trigger');
  const panel = document.getElementById('layer-widget-panel');

  if (!widget || !trigger || !panel) return;

  const header = panel.querySelector('.layer-widget-header');
  const checkboxes = panel.querySelectorAll('.layer-item input[type="checkbox"]');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    widget.classList.remove('collapsed');
  });

  if (header) {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.add('collapsed');
    });
  }

  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const layerId = checkbox.dataset.layer;

      if (layerId === 'buildings') {
        setMarkersVisible(checkbox.checked);
        return;
      }

      if (checkbox.checked) {
        addOverlayLayer(layerId);
      } else {
        removeOverlayLayer(layerId);
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!widget.contains(e.target)) {
      widget.classList.add('collapsed');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      widget.classList.add('collapsed');
    }
  });
}

// ========================================
// Overlay Layers (WMS)
// ========================================
function getWmsTileUrl(config) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: config.layers,
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    CRS: 'EPSG:3857',
    WIDTH: '256',
    HEIGHT: '256'
  });

  return `${config.url}?${params.toString()}&BBOX={bbox-epsg-3857}`;
}

export function addOverlayLayer(layerId) {
  const config = layerConfigs[layerId];
  if (!config) return;

  activeOverlayLayers.add(layerId);

  if (map.getSource(config.sourceId)) return;

  map.addSource(config.sourceId, {
    type: 'raster',
    tiles: [getWmsTileUrl(config)],
    tileSize: 256
  });

  // Add WMS layer below building layers so buildings stay on top
  const firstBuildingLayer = BUILDING_LAYERS.find(id => map.getLayer(id));
  map.addLayer({
    id: config.layerId,
    type: 'raster',
    source: config.sourceId,
    paint: {
      'raster-opacity': 0.7
    }
  }, firstBuildingLayer || undefined);
}

export function removeOverlayLayer(layerId) {
  const config = layerConfigs[layerId];
  if (!config) return;

  activeOverlayLayers.delete(layerId);

  if (map.getLayer(config.layerId)) {
    map.removeLayer(config.layerId);
  }

  if (map.getSource(config.sourceId)) {
    map.removeSource(config.sourceId);
  }
}

function readdOverlayLayers() {
  activeOverlayLayers.forEach(layerId => {
    const config = layerConfigs[layerId];
    if (!config) return;

    if (!map.getSource(config.sourceId)) {
      map.addSource(config.sourceId, {
        type: 'raster',
        tiles: [getWmsTileUrl(config)],
        tileSize: 256
      });
    }

    if (!map.getLayer(config.layerId)) {
      const firstBuildingLayer = BUILDING_LAYERS.find(id => map.getLayer(id));
      map.addLayer({
        id: config.layerId,
        type: 'raster',
        source: config.sourceId,
        paint: {
          'raster-opacity': 0.7
        }
      }, firstBuildingLayer || undefined);
    }
  });
}

// ========================================
// Layer Identify (Click to Query) - Using swisstopo REST API
// ========================================
export function setupLayerIdentify() {
  identifyPopup = new mapboxgl.Popup({ maxWidth: '400px' });

  map.on('click', async (e) => {
    identifyPopup.remove();

    if (activeOverlayLayers.size === 0) return;

    // Check if we clicked on a building feature (let building handler handle it)
    const buildingFeatures = map.queryRenderedFeatures(e.point, {
      layers: BUILDING_LAYERS.filter(id => map.getLayer(id))
    });
    if (buildingFeatures.length > 0) return;

    if (identifyController) {
      identifyController.abort();
    }
    identifyController = new AbortController();

    identifyPopup
      .setLngLat(e.lngLat)
      .setHTML('<div class="identify-popup"><em>Laden...</em></div>')
      .addTo(map);

    const lv95 = wgs84ToLV95(e.lngLat.lat, e.lngLat.lng);

    const bounds = map.getBounds();
    const sw = wgs84ToLV95(bounds.getSouth(), bounds.getWest());
    const ne = wgs84ToLV95(bounds.getNorth(), bounds.getEast());
    const mapExtent = `${sw.E},${sw.N},${ne.E},${ne.N}`;

    const canvas = map.getCanvas();
    const imageDisplay = `${canvas.width},${canvas.height},96`;

    try {
      let featureFound = false;

      for (const layerId of activeOverlayLayers) {
        const config = layerConfigs[layerId];
        if (!config) continue;

        const params = new URLSearchParams({
          geometry: `${lv95.E},${lv95.N}`,
          geometryType: 'esriGeometryPoint',
          sr: '2056',
          imageDisplay: imageDisplay,
          mapExtent: mapExtent,
          tolerance: '10',
          layers: `all:${config.layers}`,
          lang: 'de',
          returnGeometry: 'false'
        });

        const url = `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?${params}`;

        const response = await fetch(url, {
          signal: identifyController.signal
        });

        if (response.ok) {
          const data = await response.json();

          if (data.results && data.results.length > 0) {
            const feature = data.results[0];
            const props = feature.properties || feature.attributes || {};

            const content = Object.entries(props)
              .filter(([k, v]) => v !== null && v !== '' && !k.startsWith('objectid') && k !== 'id')
              .slice(0, 12)
              .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
              .join('');

            if (content) {
              identifyPopup
                .setLngLat(e.lngLat)
                .setHTML(`<div class="identify-popup">
                  <strong>${config.name}</strong>
                  <div class="identify-content">
                    <table>${content}</table>
                  </div>
                </div>`)
                .addTo(map);
              featureFound = true;
              break;
            } else {
              identifyPopup
                .setLngLat(e.lngLat)
                .setHTML(`<div class="identify-popup">
                  <strong>${config.name}</strong>
                  <div class="identify-content">
                    <p>Feature gefunden (ID: ${feature.id || feature.featureId || 'N/A'})</p>
                  </div>
                </div>`)
                .addTo(map);
              featureFound = true;
              break;
            }
          }
        }
      }

      if (!featureFound && identifyPopup.isOpen()) {
        const layerNames = [...activeOverlayLayers]
          .map(id => layerConfigs[id]?.name || id)
          .join(', ');
        identifyPopup.setHTML(`<div class="identify-popup">
          <em>Keine Features gefunden für: ${layerNames}</em>
        </div>`);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        identifyPopup.setHTML(`<div class="identify-popup">
          <em>Fehler beim Abfragen</em>
        </div>`);
      }
    }
  });
}

// ========================================
// Buildings Layer Legend
// ========================================
function getBuildingsLayerLegend() {
  return `
    <div class="buildings-legend">
      <p class="legend-description">Gebäude aus SAP RE-FX mit Datenqualitätsbewertung basierend auf dem Abgleich mit GWR und GEOREF.</p>
      <div class="legend-section">
        <div class="legend-title">Konfidenz</div>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-marker critical"></span>
            <span class="legend-label">Kritisch (&lt; 50%)</span>
          </div>
          <div class="legend-item">
            <span class="legend-marker warning"></span>
            <span class="legend-label">Warnung (50–79%)</span>
          </div>
          <div class="legend-item">
            <span class="legend-marker ok"></span>
            <span class="legend-label">OK (≥ 80%)</span>
          </div>
        </div>
      </div>
      <div class="legend-section">
        <div class="legend-title">Interaktion</div>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-marker selected"></span>
            <span class="legend-label">Ausgewählt</span>
          </div>
        </div>
      </div>
      <div class="legend-section">
        <div class="legend-title">Datenquellen</div>
        <ul class="legend-sources">
          <li><strong>SAP RE-FX</strong> – Immobilienstammdaten</li>
          <li><strong>GWR</strong> – Eidg. Gebäude- und Wohnungsregister</li>
          <li><strong>GEOREF</strong> – Georeferenzierung</li>
        </ul>
      </div>
    </div>
  `;
}

// ========================================
// Layer Info Button Handler
// ========================================
export function setupLayerInfoButtons() {
  document.querySelectorAll('.layer-info-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const layerId = btn.dataset.layer;
      if (!layerId) return;

      const modal = document.getElementById('layer-info-modal');
      const modalBody = document.getElementById('layer-info-modal-body');
      const modalTitle = document.getElementById('layer-info-modal-title');

      if (!modal || !modalBody) return;

      if (layerId === 'buildings') {
        modal.classList.add('visible');
        modalTitle.textContent = 'Gebäude';
        modalBody.innerHTML = getBuildingsLayerLegend();
        return;
      }

      modal.classList.add('visible');
      modalBody.innerHTML = '<div class="layer-info-loading">Laden...</div>';
      modalTitle.textContent = layerConfigs[layerId]?.name || layerId;

      try {
        const response = await fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/${layerId}/legend?lang=de`);

        if (response.ok) {
          const html = await response.text();
          modalBody.innerHTML = html || '<p>Keine Informationen verfügbar.</p>';
        } else {
          modalBody.innerHTML = '<p>Fehler beim Laden der Layer-Informationen.</p>';
        }
      } catch (error) {
        modalBody.innerHTML = '<p>Fehler beim Laden der Layer-Informationen.</p>';
      }
    });
  });

  const modal = document.getElementById('layer-info-modal');
  const closeBtn = document.getElementById('layer-info-modal-close');

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('visible');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal?.classList.remove('visible');
    });
  }
}

// ========================================
// Context Menu (Right-Click)
// ========================================
export function setupContextMenu() {
  const contextMenu = document.getElementById('map-context-menu');
  const contextMenuCoords = document.getElementById('context-menu-coords');
  const contextMenuCoordsText = document.getElementById('context-menu-coords-text');
  const contextMenuShare = document.getElementById('context-menu-share');
  const contextMenuCenter = document.getElementById('context-menu-center');
  const contextMenuNearest = document.getElementById('context-menu-nearest');
  const contextMenuGoogleMaps = document.getElementById('context-menu-google-maps');
  const contextMenuSwisstopo = document.getElementById('context-menu-swisstopo');
  const contextMenuGoogleEarth = document.getElementById('context-menu-google-earth');
  const mapContainer = document.getElementById('map');

  function hideContextMenu() {
    contextMenu.classList.remove('show');
  }

  map.on('contextmenu', function(e) {
    e.preventDefault();
    contextMenuLatLng = e.lngLat;

    const lat = contextMenuLatLng.lat.toFixed(5);
    const lng = contextMenuLatLng.lng.toFixed(5);
    contextMenuCoordsText.textContent = lat + ', ' + lng;
    contextMenuCoords.classList.remove('copied');

    const mapRect = mapContainer.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 280;
    const clickX = e.point.x;
    const clickY = e.point.y;

    const flipHorizontal = (clickX + menuWidth) > mapRect.width;
    const flipVertical = (clickY + menuHeight) > mapRect.height;

    contextMenu.style.left = (mapRect.left + clickX) + 'px';
    contextMenu.style.top = (mapRect.top + clickY) + 'px';
    contextMenu.classList.toggle('flip-horizontal', flipHorizontal);
    contextMenu.classList.toggle('flip-vertical', flipVertical);
    contextMenu.classList.add('show');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  map.on('click', hideContextMenu);
  map.on('movestart', hideContextMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });

  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) hideContextMenu();
  });

  contextMenuCoords.addEventListener('click', function() {
    const coordsText = contextMenuCoordsText.textContent;
    navigator.clipboard.writeText(coordsText).then(() => {
      contextMenuCoords.classList.add('copied');
      setTimeout(hideContextMenu, 500);
    }).catch(() => {});
  });

  contextMenuShare.addEventListener('click', function() {
    if (!contextMenuLatLng) return;
    const lat = contextMenuLatLng.lat.toFixed(5);
    const lng = contextMenuLatLng.lng.toFixed(5);
    const zoom = Math.round(map.getZoom());
    const shareUrl = window.location.origin + window.location.pathname +
      '?tab=karte&lat=' + lat + '&lng=' + lng + '&zoom=' + zoom;

    hideContextMenu();

    if (navigator.share) {
      navigator.share({
        title: 'BBL Liegenschaftsinventar - Standort',
        text: 'Standort anzeigen:',
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
    }
  });

  contextMenuCenter.addEventListener('click', function() {
    if (contextMenuLatLng) {
      map.flyTo({ center: contextMenuLatLng });
    }
    hideContextMenu();
  });

  contextMenuNearest.addEventListener('click', function() {
    if (!contextMenuLatLng) return;
    hideContextMenu();

    const filtered = getFilteredBuildings();
    if (filtered.length === 0) return;

    let nearest = null;
    let minDist = Infinity;

    filtered.forEach(b => {
      const dist = Math.sqrt(
        Math.pow(b.mapLat - contextMenuLatLng.lat, 2) +
        Math.pow(b.mapLng - contextMenuLatLng.lng, 2)
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = b;
      }
    });

    if (nearest) {
      window.selectBuilding(nearest.id);
    }
  });

  contextMenuGoogleMaps.addEventListener('click', function() {
    if (!contextMenuLatLng) return;
    const url = `https://www.google.com/maps?q=${contextMenuLatLng.lat},${contextMenuLatLng.lng}`;
    window.open(url, '_blank');
    hideContextMenu();
  });

  contextMenuSwisstopo.addEventListener('click', function() {
    if (!contextMenuLatLng) return;
    const lv95 = wgs84ToLV95(contextMenuLatLng.lat, contextMenuLatLng.lng);
    const url = `https://map.geo.admin.ch/#/map?lang=de&center=${lv95.E},${lv95.N}&z=13&topic=ech&layers=ch.bfs.gebaeude_wohnungs_register,t;ch.swisstopo.amtliches-strassenverzeichnis,t&bgLayer=ch.swisstopo.swissimage&crosshair=marker,${lv95.E},${lv95.N}`;
    window.open(url, '_blank');
    hideContextMenu();
  });

  contextMenuGoogleEarth.addEventListener('click', function() {
    if (!contextMenuLatLng) return;
    const url = `https://earth.google.com/web/@${contextMenuLatLng.lat},${contextMenuLatLng.lng},500a,500d,35y,0h,0t,0r`;
    window.open(url, '_blank');
    hideContextMenu();
  });
}

// ========================================
// Marker Click Handler Setup
// ========================================
export function setupMarkerClickHandlers(selectBuildingFn) {
  window.selectBuilding = selectBuildingFn;
  storedClickHandler = selectBuildingFn;

  if (markersReady) {
    setupLayerClickHandlers(selectBuildingFn);
  } else {
    pendingClickHandler = selectBuildingFn;
  }
}
