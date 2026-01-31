// ========================================
// Map Module
// Mapbox GL JS map, markers, basemaps, layers
// ========================================

import { state, buildings, getFilteredBuildings, updateURL } from './state.js';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGF2aWRyYXNuZXI1IiwiYSI6ImNtMm5yamVkdjA5MDcycXMyZ2I2MHRhamgifQ.m651j7WIX7MyxNh8KIQ1Gg';

// Map instance and markers
export let map = null;
export let markers = {};

// Basemap state
let currentBasemap = 'grey';

// Overlay layers state
const activeOverlayLayers = new Set();

// Context menu state
let contextMenuLatLng = null;

// Identify request controller
let identifyController = null;

// Popup instance for layer identify
let identifyPopup = null;

// Pending marker click handler (set before markers are ready)
let pendingClickHandler = null;

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
// Map Initialization
// ========================================
export function initMap() {
  // Define bounds for Switzerland with European context
  const switzerlandBounds = [
    [5.5, 45.5],   // Southwest [lng, lat]
    [11.0, 48.5]   // Northeast [lng, lat]
  ];

  map = new mapboxgl.Map({
    container: 'map',
    style: basemapConfigs[currentBasemap].style,
    center: [8.3, 47.0], // [lng, lat]
    zoom: 8,
    minZoom: 3,
    maxZoom: 22
  });

  // Disable map rotation
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  // Add controls after map loads
  map.on('load', () => {
    // Add zoom control (without compass since rotation is disabled)
    const nav = new mapboxgl.NavigationControl({ showCompass: false });
    map.addControl(nav, 'top-right');

    // Add home button to the navigation control container
    addHomeButton();

    // Add scale control
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Create markers for all buildings
    buildings.forEach(building => {
      const marker = createMarker(building);
      markers[building.id] = marker;
    });

    // Apply pending click handler if set
    if (pendingClickHandler) {
      applyMarkerClickHandlers(pendingClickHandler);
      pendingClickHandler = null;
    }

    // Setup label visibility based on zoom
    updateLabelVisibility();

    // Re-add any active overlay layers after style load
    readdOverlayLayers();

    // Hide POI layers (shops, restaurants, etc.)
    hidePoiLayers();
  });

  // Show/hide marker labels based on zoom level
  map.on('zoom', updateLabelVisibility);

  // Update zoom button states based on current zoom
  map.on('zoom', updateZoomButtonStates);
  map.on('load', updateZoomButtonStates);

  // Handle style changes (for basemap switching)
  map.on('style.load', () => {
    readdOverlayLayers();
    hidePoiLayers();
  });
}

// ========================================
// Hide POI Layers (shops, restaurants, etc.)
// ========================================
function hidePoiLayers() {
  const style = map.getStyle();
  if (!style || !style.layers) return;

  // Find and hide POI-related layers
  style.layers.forEach(layer => {
    const id = layer.id.toLowerCase();
    // Hide POI icons and labels
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
// Label Visibility
// ========================================
function updateLabelVisibility() {
  const mapContainer = document.getElementById('map');
  const zoom = map.getZoom();
  mapContainer.classList.toggle('show-labels', zoom >= 15);
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
// Marker Functions
// ========================================
export function createMarker(building) {
  const el = document.createElement('div');
  el.className = 'mapbox-marker-wrapper';
  el.innerHTML = `<div class="custom-marker-container">
                    <div class="custom-marker ${building.priority}" data-id="${building.id}"></div>
                    <span class="marker-label">${building.id}</span>
                  </div>`;

  const marker = new mapboxgl.Marker({
    element: el,
    anchor: 'center'
  })
    .setLngLat([building.lng, building.lat])
    .addTo(map);

  return marker;
}

export function zoomToVisibleMarkers() {
  const filtered = getFilteredBuildings();
  if (filtered.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();
  filtered.forEach(b => bounds.extend([b.lng, b.lat]));

  map.fitBounds(bounds, { padding: 50 });
}

export function updateMapMarkers() {
  const filtered = getFilteredBuildings();
  const filteredIds = new Set(filtered.map(b => b.id));

  Object.entries(markers).forEach(([id, marker]) => {
    const el = marker.getElement();
    if (filteredIds.has(id)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

export function selectMarker(buildingId) {
  const building = buildings.find(b => b.id === buildingId);
  if (!building) return;

  // Update marker elements
  Object.entries(markers).forEach(([markerId, marker]) => {
    const el = marker.getElement();
    const markerDiv = el.querySelector('.custom-marker');
    const isSelected = markerId === buildingId;

    if (isSelected) {
      markerDiv.classList.add('selected');
      el.style.zIndex = '100';
    } else {
      markerDiv.classList.remove('selected');
      el.style.zIndex = '';
    }
  });

  // Fly to marker
  map.flyTo({
    center: [building.lng, building.lat],
    zoom: Math.max(map.getZoom(), 16)
  });
}

export function deselectAllMarkers() {
  Object.values(markers).forEach(marker => {
    const el = marker.getElement();
    const markerDiv = el.querySelector('.custom-marker');
    if (markerDiv) {
      markerDiv.classList.remove('selected');
    }
    el.style.zIndex = '';
  });
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

  // Trigger button expands the widget
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    widget.classList.remove('collapsed');
  });

  // Header collapses the widget
  if (header) {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.add('collapsed');
    });
  }

  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const layerId = checkbox.dataset.layer;
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
  // Build WMS GetMap URL with bbox placeholder for Mapbox
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

  // Track active layers
  activeOverlayLayers.add(layerId);

  // Check if source already exists
  if (map.getSource(config.sourceId)) return;

  // Add WMS as raster source
  map.addSource(config.sourceId, {
    type: 'raster',
    tiles: [getWmsTileUrl(config)],
    tileSize: 256
  });

  // Add layer
  map.addLayer({
    id: config.layerId,
    type: 'raster',
    source: config.sourceId,
    paint: {
      'raster-opacity': 0.7
    }
  });
}

export function removeOverlayLayer(layerId) {
  const config = layerConfigs[layerId];
  if (!config) return;

  // Remove from tracking
  activeOverlayLayers.delete(layerId);

  // Remove layer if exists
  if (map.getLayer(config.layerId)) {
    map.removeLayer(config.layerId);
  }

  // Remove source if exists
  if (map.getSource(config.sourceId)) {
    map.removeSource(config.sourceId);
  }
}

function readdOverlayLayers() {
  // Re-add all active overlay layers after style change
  activeOverlayLayers.forEach(layerId => {
    const config = layerConfigs[layerId];
    if (!config) return;

    // Add source if not exists
    if (!map.getSource(config.sourceId)) {
      map.addSource(config.sourceId, {
        type: 'raster',
        tiles: [getWmsTileUrl(config)],
        tileSize: 256
      });
    }

    // Add layer if not exists
    if (!map.getLayer(config.layerId)) {
      map.addLayer({
        id: config.layerId,
        type: 'raster',
        source: config.sourceId,
        paint: {
          'raster-opacity': 0.7
        }
      });
    }
  });
}

// ========================================
// Layer Identify (Click to Query) - Using swisstopo REST API
// ========================================
export function setupLayerIdentify() {
  identifyPopup = new mapboxgl.Popup({ maxWidth: '350px' });

  map.on('click', async (e) => {
    if (activeOverlayLayers.size === 0) return;

    if (identifyController) {
      identifyController.abort();
    }
    identifyController = new AbortController();

    // Convert click location to LV95 coordinates
    const lv95 = wgs84ToLV95(e.lngLat.lat, e.lngLat.lng);

    // Get map bounds in LV95
    const bounds = map.getBounds();
    const sw = wgs84ToLV95(bounds.getSouth(), bounds.getWest());
    const ne = wgs84ToLV95(bounds.getNorth(), bounds.getEast());
    const mapExtent = `${sw.E},${sw.N},${ne.E},${ne.N}`;

    // Get canvas dimensions
    const canvas = map.getCanvas();
    const imageDisplay = `${canvas.width},${canvas.height},96`;

    try {
      for (const layerId of activeOverlayLayers) {
        const config = layerConfigs[layerId];
        if (!config) continue;

        // Use swisstopo REST API for identify
        const params = new URLSearchParams({
          geometry: `${lv95.E},${lv95.N}`,
          geometryType: 'esriGeometryPoint',
          geometryFormat: 'geojson',
          imageDisplay: imageDisplay,
          mapExtent: mapExtent,
          tolerance: '10',
          layers: `all:${config.layers}`,
          lang: 'de'
        });

        const response = await fetch(`https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?${params}`, {
          signal: identifyController.signal
        });

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            const feature = data.results[0];
            const props = feature.properties || feature.attributes || {};

            // Build popup content from properties
            const content = Object.entries(props)
              .filter(([k, v]) => v !== null && v !== '' && !k.startsWith('objectid') && !k.startsWith('id'))
              .slice(0, 10)
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
              break;
            }
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Identify error:', error);
      }
    }
  });
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

      // Show modal with loading state
      modal.classList.add('visible');
      modalBody.innerHTML = '<div class="layer-info-loading">Laden...</div>';
      modalTitle.textContent = layerConfigs[layerId]?.name || layerId;

      try {
        // Fetch layer legend from swisstopo API
        const response = await fetch(`https://api3.geo.admin.ch/rest/services/ech/MapServer/${layerId}/legend?lang=de`);

        if (response.ok) {
          const html = await response.text();
          modalBody.innerHTML = html || '<p>Keine Informationen verfügbar.</p>';
        } else {
          modalBody.innerHTML = '<p>Fehler beim Laden der Layer-Informationen.</p>';
        }
      } catch (error) {
        console.error('Layer info error:', error);
        modalBody.innerHTML = '<p>Fehler beim Laden der Layer-Informationen.</p>';
      }
    });
  });

  // Close modal handlers
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
    }).catch((err) => {
      console.error('Failed to copy coordinates:', err);
    });
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
        Math.pow(b.lat - contextMenuLatLng.lat, 2) +
        Math.pow(b.lng - contextMenuLatLng.lng, 2)
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
    const url = `https://map.geo.admin.ch/?E=${lv95.E}&N=${lv95.N}&zoom=10`;
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
function applyMarkerClickHandlers(selectBuildingFn) {
  Object.entries(markers).forEach(([id, marker]) => {
    const el = marker.getElement();
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectBuildingFn(id);
    });
  });
}

export function setupMarkerClickHandlers(selectBuildingFn) {
  // Store reference for context menu
  window.selectBuilding = selectBuildingFn;

  // If markers already exist, apply handlers immediately
  if (Object.keys(markers).length > 0) {
    applyMarkerClickHandlers(selectBuildingFn);
  } else {
    // Store handler for later application after markers are created
    pendingClickHandler = selectBuildingFn;
  }
}
