// ========================================
// Map Module
// Leaflet map, markers, basemaps, layers
// ========================================

import { state, buildings, getFilteredBuildings, updateURL } from './state.js';

// Map instance and markers
export let map = null;
export let markers = {};

// Basemap state
let currentBasemap = 'color';
let basemapLayer = null;

// Overlay layers
const overlayLayers = {};

// Context menu state
let contextMenuLatLng = null;

// Identify request controller
let identifyController = null;

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
    url: null,
    attribution: ''
  },
  grey: {
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO'
  },
  color: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics'
  }
};

// ========================================
// Map Initialization
// ========================================
export function initMap() {
  map = L.map('map', { zoomControl: false }).setView([47.0, 8.3], 8);

  // Add zoom control to top-right
  const zoomControl = L.control.zoom({ position: 'topright' }).addTo(map);

  // Add home button to the zoom control's container
  const homeBtn = L.DomUtil.create('a', 'leaflet-control-home', zoomControl.getContainer());
  homeBtn.href = '#';
  homeBtn.title = 'Auf aktive Gebäude zoomen';
  homeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  L.DomEvent.on(homeBtn, 'click', function(e) {
    L.DomEvent.stop(e);
    zoomToVisibleMarkers();
  });

  // Initialize with default basemap
  switchBasemapTiles(currentBasemap);

  // Create markers for all buildings
  buildings.forEach(building => {
    const marker = createMarker(building);
    markers[building.id] = marker;
    marker.addTo(map);
    if (marker.dragging) marker.dragging.disable();
  });

  // Show/hide marker labels based on zoom level
  const mapContainer = document.getElementById('map');
  function updateLabelVisibility() {
    const zoom = map.getZoom();
    mapContainer.classList.toggle('show-labels', zoom >= 15);
  }
  map.on('zoomend', updateLabelVisibility);
  updateLabelVisibility();

  // Scale bar
  setupScaleBar();
}

function setupScaleBar() {
  const scaleBarLine = document.getElementById('scale-bar-line');
  const scaleBarText = document.getElementById('scale-bar-text');

  function updateScaleBar() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
    const distances = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    let distance = distances[0];
    for (const d of distances) {
      const px = d / metersPerPixel;
      if (px >= 60 && px <= 150) { distance = d; break; }
      if (px < 60) distance = d;
    }
    const widthPx = Math.round(distance / metersPerPixel);
    scaleBarLine.style.width = widthPx + 'px';
    scaleBarText.textContent = distance >= 1000 ? (distance / 1000) + ' km' : distance + ' m';
  }

  map.on('zoomend', updateScaleBar);
  map.on('moveend', updateScaleBar);
  updateScaleBar();
}

// ========================================
// Marker Functions
// ========================================
export function createMarker(building) {
  const icon = L.divIcon({
    className: 'custom-marker-container',
    html: `<div class="custom-marker ${building.priority}" data-id="${building.id}"></div>
           <span class="marker-label">${building.id}</span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const marker = L.marker([building.lat, building.lng], { icon, draggable: true });
  return marker;
}

export function zoomToVisibleMarkers() {
  const filtered = getFilteredBuildings();
  if (filtered.length === 0) return;

  const bounds = L.latLngBounds(filtered.map(b => [b.lat, b.lng]));
  map.fitBounds(bounds, { padding: [50, 50] });
}

export function updateMapMarkers() {
  const filtered = getFilteredBuildings();
  const filteredIds = new Set(filtered.map(b => b.id));

  Object.entries(markers).forEach(([id, marker]) => {
    if (filteredIds.has(id)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
  });
}

export function selectMarker(buildingId) {
  const building = buildings.find(b => b.id === buildingId);
  if (!building) return;

  // Update marker icons
  Object.entries(markers).forEach(([markerId, marker]) => {
    const isSelected = markerId === buildingId;
    const markerBuilding = buildings.find(b => b.id === markerId);
    marker.setIcon(L.divIcon({
      className: 'custom-marker-container',
      html: `<div class="custom-marker ${markerBuilding.priority} ${isSelected ? 'selected' : ''}" data-id="${markerId}"></div>
             <span class="marker-label">${markerId}</span>`,
      iconSize: isSelected ? [24, 24] : [16, 16],
      iconAnchor: isSelected ? [12, 12] : [8, 8]
    }));
  });

  // Pan to marker
  map.setView([building.lat, building.lng], Math.max(map.getZoom(), 16));
}

export function deselectAllMarkers() {
  Object.values(markers).forEach(m => m._icon?.classList.remove('selected'));
}

// ========================================
// Basemap Functions
// ========================================
export function switchBasemapTiles(basemapId) {
  const config = basemapConfigs[basemapId];

  if (basemapLayer) {
    map.removeLayer(basemapLayer);
    basemapLayer = null;
  }

  if (config.url) {
    basemapLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: 19
    });
    basemapLayer.addTo(map);
    basemapLayer.bringToBack();
  }
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
const layerConfigs = {
  parcels: {
    id: 'ch.swisstopo.amtliches-strassenverzeichnis',
    name: 'Parzellen',
    url: 'https://wms.geo.admin.ch/',
    layers: 'ch.swisstopo-vd.amtliche-vermessung'
  },
  addresses: {
    id: 'ch.bfs.gebaeude_wohnungs_register',
    name: 'GWR Adressen',
    url: 'https://wms.geo.admin.ch/',
    layers: 'ch.bfs.gebaeude_wohnungs_register'
  },
  orthophoto: {
    id: 'ch.swisstopo.swissimage',
    name: 'Orthofoto',
    url: 'https://wms.geo.admin.ch/',
    layers: 'ch.swisstopo.swissimage'
  }
};

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

export function addOverlayLayer(layerId) {
  const config = layerConfigs[layerId];
  if (!config || overlayLayers[layerId]) return;

  const layer = L.tileLayer.wms(config.url, {
    layers: config.layers,
    format: 'image/png',
    transparent: true,
    opacity: 0.7
  });

  layer.addTo(map);
  overlayLayers[layerId] = layer;
}

export function removeOverlayLayer(layerId) {
  const layer = overlayLayers[layerId];
  if (layer) {
    map.removeLayer(layer);
    delete overlayLayers[layerId];
  }
}

// ========================================
// Layer Identify (Click to Query)
// ========================================
export function setupLayerIdentify() {
  const popup = L.popup({ maxWidth: 300 });

  map.on('click', async (e) => {
    const activeLayerIds = Object.keys(overlayLayers);
    if (activeLayerIds.length === 0) return;

    if (identifyController) {
      identifyController.abort();
    }
    identifyController = new AbortController();

    const bounds = map.getBounds();
    const size = map.getSize();
    const point = map.latLngToContainerPoint(e.latlng);

    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

    try {
      for (const layerId of activeLayerIds) {
        const config = layerConfigs[layerId];
        if (!config) continue;

        const params = new URLSearchParams({
          SERVICE: 'WMS',
          VERSION: '1.3.0',
          REQUEST: 'GetFeatureInfo',
          LAYERS: config.layers,
          QUERY_LAYERS: config.layers,
          INFO_FORMAT: 'application/json',
          I: Math.round(point.x),
          J: Math.round(point.y),
          WIDTH: size.x,
          HEIGHT: size.y,
          CRS: 'EPSG:4326',
          BBOX: bbox
        });

        const response = await fetch(`${config.url}?${params}`, {
          signal: identifyController.signal
        });

        if (response.ok) {
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const props = feature.properties;
            const content = Object.entries(props)
              .filter(([k, v]) => v && !k.startsWith('gml'))
              .slice(0, 8)
              .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
              .join('<br>');

            popup
              .setLatLng(e.latlng)
              .setContent(`<div class="identify-popup"><strong>${config.name}</strong><br>${content}</div>`)
              .openOn(map);
            break;
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
    e.originalEvent.preventDefault();
    contextMenuLatLng = e.latlng;

    const lat = contextMenuLatLng.lat.toFixed(5);
    const lng = contextMenuLatLng.lng.toFixed(5);
    contextMenuCoordsText.textContent = lat + ', ' + lng;
    contextMenuCoords.classList.remove('copied');

    const mapRect = mapContainer.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 280;
    const clickX = e.containerPoint.x;
    const clickY = e.containerPoint.y;

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
      map.setView(contextMenuLatLng);
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
export function setupMarkerClickHandlers(selectBuildingFn) {
  Object.entries(markers).forEach(([id, marker]) => {
    marker.on('click', () => selectBuildingFn(id));
  });

  // Store reference for context menu
  window.selectBuilding = selectBuildingFn;
}
