// ========================================
// Search Module
// Swisstopo location search integration
// ========================================

import { map } from './map.js';

// Search marker reference
let searchMarker = null;

// Search state
let debounceTimer = null;
let currentResults = [];
let highlightedIndex = -1;

// DOM elements
let container, input, dropdown, resultsEl, clearBtn;

// ========================================
// Initialization
// ========================================
export function setupSearch() {
  container = document.getElementById('search-container');
  input = document.getElementById('globalSearch');
  dropdown = document.getElementById('search-dropdown');
  resultsEl = document.getElementById('search-results');
  clearBtn = document.getElementById('search-clear');
  const toggle = document.getElementById('search-toggle');

  if (!container || !input || !dropdown || !resultsEl) return;

  // Toggle search expansion
  toggle?.addEventListener('click', () => {
    container.classList.add('expanded');
    input.focus();
  });

  // Input events
  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeydown);
  input.addEventListener('focus', () => {
    if (currentResults.length > 0) {
      showDropdown();
    }
  });

  // Clear button
  clearBtn?.addEventListener('click', clearSearch);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      hideDropdown();
      if (!input.value) {
        container.classList.remove('expanded');
      }
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && container.classList.contains('expanded')) {
      hideDropdown();
      input.blur();
      if (!input.value) {
        container.classList.remove('expanded');
      }
    }
  });
}

// ========================================
// Input Handling
// ========================================
function handleInput(e) {
  const query = e.target.value.trim();

  // Clear previous timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Need at least 2 characters
  if (query.length < 2) {
    hideDropdown();
    currentResults = [];
    return;
  }

  // Show loading state
  showLoading();

  // Debounce API call
  debounceTimer = setTimeout(() => {
    searchLocations(query);
  }, 300);
}

function handleKeydown(e) {
  if (!dropdown.classList.contains('visible')) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, currentResults.length - 1);
      updateHighlight();
      break;
    case 'ArrowUp':
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight();
      break;
    case 'Enter':
      e.preventDefault();
      if (highlightedIndex >= 0 && currentResults[highlightedIndex]) {
        selectResult(currentResults[highlightedIndex]);
      }
      break;
    case 'Escape':
      hideDropdown();
      break;
  }
}

function updateHighlight() {
  const items = resultsEl.querySelectorAll('.search-result');
  items.forEach((item, i) => {
    item.classList.toggle('highlighted', i === highlightedIndex);
  });

  // Scroll into view if needed
  if (highlightedIndex >= 0 && items[highlightedIndex]) {
    items[highlightedIndex].scrollIntoView({ block: 'nearest' });
  }
}

// ========================================
// API Search
// ========================================
async function searchLocations(query) {
  const url = new URL('https://api3.geo.admin.ch/rest/services/api/SearchServer');
  url.searchParams.set('searchText', query);
  url.searchParams.set('type', 'locations');
  url.searchParams.set('limit', '4');
  url.searchParams.set('sr', '4326');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    currentResults = data.results || [];
    highlightedIndex = -1;

    if (currentResults.length > 0) {
      renderResults();
    } else {
      showEmpty();
    }
  } catch (error) {
    console.error('Search error:', error);
    showEmpty('Suche fehlgeschlagen');
  }
}

// ========================================
// Results Rendering
// ========================================
function renderResults() {
  resultsEl.innerHTML = currentResults.map((result, index) => {
    const attrs = result.attrs || {};
    // Clean HTML tags from label
    const name = (attrs.label || '').replace(/<[^>]*>/g, '');
    const detail = formatDetail(attrs);

    return `
      <div class="search-result" data-index="${index}">
        <span class="search-result-name">${escapeHtml(name)}</span>
        <span class="search-result-detail">${escapeHtml(detail)}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  resultsEl.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const index = parseInt(el.dataset.index, 10);
      if (currentResults[index]) {
        selectResult(currentResults[index]);
      }
    });

    el.addEventListener('mouseenter', () => {
      highlightedIndex = parseInt(el.dataset.index, 10);
      updateHighlight();
    });
  });

  showDropdown();
}

function formatDetail(attrs) {
  const parts = [];

  // Origin type
  const originLabels = {
    zipcode: 'PLZ',
    gazetteer: 'Ort',
    address: 'Adresse',
    parcel: 'Parzelle',
    sn25: 'Ortsname'
  };
  if (attrs.origin && originLabels[attrs.origin]) {
    parts.push(originLabels[attrs.origin]);
  }

  // Detail/location info
  if (attrs.detail) {
    // Clean and add detail
    const cleanDetail = attrs.detail.replace(/<[^>]*>/g, '').trim();
    if (cleanDetail && !parts.includes(cleanDetail)) {
      parts.push(cleanDetail);
    }
  }

  return parts.join(', ') || 'Standort';
}

function showLoading() {
  resultsEl.innerHTML = '<div class="search-loading">Suche läuft...</div>';
  showDropdown();
}

function showEmpty(message = 'Keine Ergebnisse gefunden') {
  resultsEl.innerHTML = `<div class="search-empty">${escapeHtml(message)}</div>`;
  showDropdown();
}

function showDropdown() {
  dropdown.classList.add('visible');
}

function hideDropdown() {
  dropdown.classList.remove('visible');
  highlightedIndex = -1;
}

// ========================================
// Result Selection
// ========================================
function selectResult(result) {
  const attrs = result.attrs || {};

  // Get coordinates (API returns lat/lon when sr=4326)
  const lat = attrs.lat || attrs.y;
  const lon = attrs.lon || attrs.x;

  if (lat && lon && map) {
    // Remove previous search marker
    removeSearchMarker();

    // Create new marker
    searchMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: 'search-marker',
        html: '<div class="search-marker-pin"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      })
    }).addTo(map);

    // Zoom to location
    map.setView([lat, lon], 15);

    // Update input with selected name
    const name = (attrs.label || '').replace(/<[^>]*>/g, '');
    input.value = name;
  }

  hideDropdown();
}

// ========================================
// Clear Search
// ========================================
function clearSearch() {
  input.value = '';
  currentResults = [];
  highlightedIndex = -1;
  hideDropdown();
  removeSearchMarker();
  input.focus();
}

export function removeSearchMarker() {
  if (searchMarker && map) {
    map.removeLayer(searchMarker);
    searchMarker = null;
  }
}

// ========================================
// Utility
// ========================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
