// ========================================
// Detail Panel Module
// Building detail view, edit mode, dropdowns
// ========================================

import {
  state,
  buildings,
  teamMembers,
  eventsData,
  commentsData,
  tableVisible,
  currentUser,
  getTagLabel,
  getDataLabel,
  formatRelativeTime,
  formatDateTime,
  formatDisplayDate,
  getFieldDisplayValue,
  lookupGwrByEgid
} from './state.js';
import { map, markers } from './map.js';

// Store cleanup functions to prevent memory leaks from duplicate event listeners
const dropdownCleanup = new Map();

// ========================================
// Dropdown Factory
// ========================================
function createDropdown(config) {
  const {
    containerId,
    cleanupKey,
    options,
    currentValue,
    dataAttribute,
    triggerClass,
    optionClass,
    getTriggerContent,
    getOptionContent,
    extraClasses = '',
    scrollable = false,
    extraOptions = '',
    onSelect
  } = config;

  const container = document.getElementById(containerId);
  if (!container) return;

  // Clean up previous event listeners
  if (dropdownCleanup.has(cleanupKey)) {
    dropdownCleanup.get(cleanupKey)();
  }

  const optionsHtml = options.map(opt => {
    const isSelected = currentValue === opt.value;
    const content = getOptionContent ? getOptionContent(opt) : `<span>${opt.label}</span>`;
    return `
      <button class="dropdown-option-base ${optionClass} ${isSelected ? 'selected' : ''}" data-${dataAttribute}="${opt.value}">
        ${content}
      </button>
    `;
  }).join('');

  container.classList.add('dropdown-base');
  if (extraClasses) {
    extraClasses.split(' ').forEach(cls => cls && container.classList.add(cls));
  }

  container.innerHTML = `
    <button class="dropdown-trigger-base ${triggerClass}" type="button">
      ${getTriggerContent()}
      <i data-lucide="chevron-down" class="icon-sm dropdown-chevron-base"></i>
    </button>
    <div class="dropdown-menu-base ${scrollable ? 'scrollable' : ''}">
      ${optionsHtml}
      ${extraOptions}
    </div>
  `;

  // Handle triggerClass with multiple classes (extract first for selector)
  const triggerSelector = triggerClass.split(' ')[0];
  const trigger = container.querySelector(`.${triggerSelector}`);
  let outsideClickHandler = null;

  const closeDropdown = () => {
    container.classList.remove('open');
    if (outsideClickHandler) {
      document.removeEventListener('click', outsideClickHandler);
      outsideClickHandler = null;
    }
  };

  const handleTriggerClick = (e) => {
    e.stopPropagation();
    const isOpen = container.classList.toggle('open');
    if (isOpen) {
      outsideClickHandler = (evt) => {
        if (!container.contains(evt.target)) {
          closeDropdown();
        }
      };
      document.addEventListener('click', outsideClickHandler);
    } else {
      closeDropdown();
    }
  };

  trigger.addEventListener('click', handleTriggerClick);

  container.querySelectorAll(`.${optionClass}`).forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset[dataAttribute];
      closeDropdown();
      onSelect(value);
    });
  });

  // Store cleanup function
  dropdownCleanup.set(cleanupKey, () => {
    trigger.removeEventListener('click', handleTriggerClick);
    closeDropdown();
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Status options for dropdown
const statusOptions = [
  { value: 'backlog', label: 'Backlog', icon: 'layers' },
  { value: 'inprogress', label: 'In Bearbeitung', icon: 'play-circle' },
  { value: 'clarification', label: 'Abklärung', icon: 'help-circle' },
  { value: 'done', label: 'Erledigt', icon: 'check-circle' }
];

// Priority options for dropdown
const priorityOptions = [
  { value: 'high', label: 'Hoch', icon: 'chevrons-up' },
  { value: 'medium', label: 'Mittel', icon: 'chevron-up' },
  { value: 'low', label: 'Niedrig', icon: 'minus' }
];

// Callbacks for external updates
let onStatusChange = null;
let onAssigneeChange = null;
let onPriorityChange = null;
let onDueDateChange = null;
let onDataChange = null;

export function setCallbacks(callbacks) {
  onStatusChange = callbacks.onStatusChange;
  onAssigneeChange = callbacks.onAssigneeChange;
  onPriorityChange = callbacks.onPriorityChange;
  onDueDateChange = callbacks.onDueDateChange;
  onDataChange = callbacks.onDataChange;
}

// ========================================
// Main Render Function
// ========================================
export function renderDetailPanel(building) {
  const detailPanel = document.getElementById('detail-panel');
  const wasVisible = detailPanel.classList.contains('visible');

  if (!building) {
    detailPanel.classList.remove('visible');
    if (map) {
      // Resize map after panel hides - use longer delay for CSS to settle
      setTimeout(() => map.resize(), 50);
    }
    return;
  }

  // Only show detail panel on karte and aufgaben tabs
  const currentTab = state.currentTab || 'karte';
  const showOnTab = ['karte', 'aufgaben'].includes(currentTab);

  if (showOnTab) {
    detailPanel.classList.add('visible');
    if (map) {
      // Resize map after panel shows
      setTimeout(() => map.resize(), 50);
    }
  }

  document.getElementById('detail-title').textContent = building.name;
  document.getElementById('detail-sap-id').textContent = building.id;

  // Confidence
  const totalClass = building.confidence.total < 50 ? 'critical' :
                     building.confidence.total < 80 ? 'warning' : 'ok';
  document.getElementById('confidence-total').textContent = building.confidence.total + '%';
  document.getElementById('confidence-total').className = 'confidence-total ' + totalClass;

  ['georef', 'sap', 'gwr'].forEach(key => {
    const val = building.confidence[key];
    const barClass = val < 50 ? 'critical' : val < 80 ? 'warning' : 'ok';
    document.getElementById(`bar-${key}`).style.width = val + '%';
    document.getElementById(`bar-${key}`).className = 'confidence-bar-fill ' + barClass;
    document.getElementById(`val-${key}`).textContent = val + '%';
  });

  // Errors - render as table
  const errorTable = document.getElementById('error-table');
  const errorTbody = document.getElementById('error-tbody');
  const errorEmptyState = document.getElementById('error-empty-state');
  const errorCountEl = document.getElementById('error-count');
  const fehlerAccordion = document.querySelector('[data-accordion="fehler"]');

  if (building.errors.length > 0) {
    errorTable.style.display = '';
    errorEmptyState.style.display = 'none';
    errorTbody.innerHTML = building.errors.map(error => {
      const levelLabel = error.level === 'error' ? 'Fehler' : error.level === 'warning' ? 'Warnung' : 'Info';
      return `
        <tr>
          <td>${error.checkId}</td>
          <td>${error.description}</td>
          <td class="level-${error.level}">${levelLabel}</td>
        </tr>
      `;
    }).join('');
    errorCountEl.textContent = building.errors.length;
    errorCountEl.style.display = '';
    fehlerAccordion.classList.add('open');
  } else {
    errorTable.style.display = 'none';
    errorEmptyState.style.display = '';
    errorTbody.innerHTML = '';
    errorCountEl.style.display = 'none';
    fehlerAccordion.classList.remove('open');
  }

  // Image widget
  currentImageIndex = 0; // Reset when switching buildings
  renderImageWidget(building);

  // Data comparison
  renderDataComparison(building);

  // Comments
  document.getElementById('comments-list').innerHTML = building.comments.length > 0
    ? building.comments.map(comment => `
        <div class="comment ${comment.system ? 'system' : ''}">
          <div class="comment-header">
            <span class="comment-author">${comment.author}</span>
            <span class="comment-date">${comment.date}</span>
          </div>
          <div class="comment-text">${comment.text}</div>
        </div>
      `).join('')
    : '<p class="empty-text">Keine Kommentare.</p>';

  // Comments count badge
  const commentsCountEl = document.getElementById('comments-count');
  if (building.comments.length > 0) {
    commentsCountEl.textContent = building.comments.length;
    commentsCountEl.style.display = '';
  } else {
    commentsCountEl.style.display = 'none';
  }

  // Priority dropdown
  renderPriorityDisplay(building);

  // Status dropdown
  renderStatusDisplay(building);

  // Assignee dropdown
  renderAssigneeDisplay(building);

  // Due date display
  renderDueDateDisplay(building);

  // Events log
  renderEventsLog(building.id);

  // Refresh icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Update edit button state
  updateEditButton();
}

// ========================================
// Data Comparison Table
// ========================================

// Fields that follow the three-value comparison pattern (sap, gwr, korrektur)
// Primary fields: essential for address verification, always visible
// 'coords' is a virtual field that combines lat/lng into one row
// NOTE: 'inGwr' is a special first row (dropdown) before EGID
const PRIMARY_FIELDS = [
  'egid',  // Key field for GWR lookup (editable in GWR column)
  'plz', 'ort', 'strasse', 'hausnummer',
  'coords'
];

// Secondary fields: supplementary context, hidden by default
const SECONDARY_FIELDS = [
  'country', 'kanton', 'gemeinde', 'zusatz',
  'egrid', 'parcelArea', 'footprintArea',
  'gkat', 'gklas', 'gbaup'
];

// Combined for iteration (primary first, then secondary)
const COMPARED_FIELDS = [...PRIMARY_FIELDS, ...SECONDARY_FIELDS];

// Fields editable in the Korrektur column (all comparison fields except coords)
const KORREKTUR_EDITABLE_FIELDS = [
  'plz', 'ort', 'strasse', 'hausnummer',
  'country', 'kanton', 'gemeinde', 'zusatz',
  'egrid', 'parcelArea', 'footprintArea',
  'gkat', 'gklas', 'gbaup'
];

// All real data fields (for edit mode saving)
const ALL_DATA_FIELDS = [
  'plz', 'ort', 'strasse', 'hausnummer', 'egid',
  'country', 'kanton', 'gemeinde', 'zusatz',
  'egrid', 'parcelArea', 'footprintArea',
  'gkat', 'gklas', 'gbaup', 'lat', 'lng'
];

// Track whether secondary fields are visible
let showSecondaryFields = false;

// Helper to format coordinates as "lat, lng"
function formatCoords(lat, lng) {
  const latStr = lat ? parseFloat(lat).toFixed(4) : '';
  const lngStr = lng ? parseFloat(lng).toFixed(4) : '';
  if (!latStr && !lngStr) return '';
  return `${latStr}, ${lngStr}`;
}

export function renderDataComparison(building) {
  const container = document.getElementById('data-comparison');
  const isEditMode = state.editMode;

  // Get current lat/lng (from edit state or building mapLat/mapLng)
  const currentLat = state.editedCoords ? state.editedCoords.lat : building.mapLat;
  const currentLng = state.editedCoords ? state.editedCoords.lng : building.mapLng;

  // Build rows HTML
  let rowsHtml = '';

  // First row: "Gebäude im GWR?" (inGwr) - special dropdown row
  const inGwrRow = renderInGwrRow(building, isEditMode);
  rowsHtml += inGwrRow;

  // Render data comparison fields
  rowsHtml += COMPARED_FIELDS.map(key => {
    // Special handling for combined coordinates row
    if (key === 'coords') {
      const sapCoords = formatCoords(building.lat?.sap, building.lng?.sap);
      const gwrCoords = formatCoords(building.lat?.gwr, building.lng?.gwr);
      const korrekturCoords = currentLat && currentLng
        ? `${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`
        : '';
      const isMatch = building.lat?.match && building.lng?.match;
      const matchIcon = isMatch
        ? '<i data-lucide="check" class="match-icon match"></i>'
        : '<i data-lucide="x" class="match-icon mismatch"></i>';

      if (isEditMode) {
        return `
          <tr class="data-row edit-row">
            <td class="col-attr">Koordinaten</td>
            <td class="col-sap ref-locked">${sapCoords}</td>
            <td class="col-gwr ref-locked">${gwrCoords}</td>
            <td class="col-korrektur edit-cell">
              <span class="edit-locked" id="edit-coords-display">${korrekturCoords}</span>
              <span class="edit-hint">Marker ziehen</span>
            </td>
            <td class="col-match"></td>
          </tr>
        `;
      } else {
        return `
          <tr class="data-row">
            <td class="col-attr">Koordinaten</td>
            <td class="col-sap">${sapCoords}</td>
            <td class="col-gwr">${gwrCoords}</td>
            <td class="col-korrektur">${korrekturCoords}</td>
            <td class="col-match">${matchIcon}</td>
          </tr>
        `;
      }
    }

    // Special handling for EGID - editable in GWR column
    if (key === 'egid') {
      return renderEgidRow(building, isEditMode);
    }

    const field = building[key];
    if (!field) return '';

    const isSecondary = SECONDARY_FIELDS.includes(key);
    const hiddenClass = isSecondary && !showSecondaryFields ? ' hidden' : '';

    const sapValue = field.sap || '';
    const gwrValue = field.gwr || '';
    const korrekturValue = field.korrektur || '';

    // Display value uses priority: korrektur > gwr > sap
    const displayValue = getFieldDisplayValue(field);

    const isMatch = field.match;
    const matchIcon = isMatch
      ? '<i data-lucide="check" class="match-icon match"></i>'
      : '<i data-lucide="x" class="match-icon mismatch"></i>';

    if (isEditMode) {
      // In edit mode: SAP and GWR are read-only, Korrektur is editable
      const isKorrekturEditable = KORREKTUR_EDITABLE_FIELDS.includes(key);
      const korrekturCell = isKorrekturEditable
        ? `<input type="text" class="edit-input" data-field="${key}" data-column="korrektur" value="${korrekturValue}">`
        : `<span class="edit-locked">${korrekturValue}</span>`;

      return `
        <tr class="data-row edit-row${isSecondary ? ' secondary-field' : ''}${hiddenClass}">
          <td class="col-attr">${getDataLabel(key)}</td>
          <td class="col-sap ref-locked">${sapValue}</td>
          <td class="col-gwr ref-locked">${gwrValue}</td>
          <td class="col-korrektur edit-cell">${korrekturCell}</td>
          <td class="col-match"></td>
        </tr>
      `;
    } else {
      // In view mode: show actual korrektur value (empty if not set)
      return `
        <tr class="data-row${isSecondary ? ' secondary-field' : ''}${hiddenClass}">
          <td class="col-attr">${getDataLabel(key)}</td>
          <td class="col-sap">${sapValue}</td>
          <td class="col-gwr">${gwrValue}</td>
          <td class="col-korrektur">${korrekturValue}</td>
          <td class="col-match">${matchIcon}</td>
        </tr>
      `;
    }
  }).join('');

  container.innerHTML = rowsHtml;

  // Setup event handlers for edit mode
  if (isEditMode) {
    setupEditModeHandlers(building);
  }

  updateEditButton();
}

// ========================================
// InGwr Row (Is Building in GWR?)
// ========================================
function renderInGwrRow(building, isEditMode) {
  const inGwr = building.inGwr;
  const displayText = inGwr === true ? 'Ja' : inGwr === false ? 'Nein' : '—';

  if (isEditMode) {
    // Dropdown only in GWR column
    return `
      <tr class="data-row edit-row ingwr-row">
        <td class="col-attr">Gebäude im GWR?</td>
        <td class="col-sap ref-locked">—</td>
        <td class="col-gwr edit-cell">
          <select class="edit-select" id="edit-inGwr">
            <option value="" ${inGwr === null || inGwr === undefined ? 'selected' : ''}>—</option>
            <option value="true" ${inGwr === true ? 'selected' : ''}>Ja</option>
            <option value="false" ${inGwr === false ? 'selected' : ''}>Nein</option>
          </select>
        </td>
        <td class="col-korrektur ref-locked">—</td>
        <td class="col-match"></td>
      </tr>
    `;
  } else {
    return `
      <tr class="data-row ingwr-row">
        <td class="col-attr">Gebäude im GWR?</td>
        <td class="col-sap">—</td>
        <td class="col-gwr">${displayText}</td>
        <td class="col-korrektur">—</td>
        <td class="col-match"></td>
      </tr>
    `;
  }
}

// ========================================
// EGID Row (Special: GWR column is editable)
// ========================================
function renderEgidRow(building, isEditMode) {
  const field = building.egid;
  if (!field) return '';

  const sapValue = field.sap || '';
  const gwrValue = building.gwrEgid || field.gwr || '';
  const korrekturValue = field.korrektur || '';

  const displayValue = getFieldDisplayValue(field);
  const isMatch = field.match;
  const matchIcon = isMatch
    ? '<i data-lucide="check" class="match-icon match"></i>'
    : '<i data-lucide="x" class="match-icon mismatch"></i>';

  if (isEditMode) {
    // EGID: SAP read-only, GWR editable (triggers API lookup), Korrektur read-only
    return `
      <tr class="data-row edit-row egid-row">
        <td class="col-attr">${getDataLabel('egid')}</td>
        <td class="col-sap ref-locked">${sapValue}</td>
        <td class="col-gwr edit-cell">
          <input type="text" class="edit-input" id="edit-gwrEgid" data-field="gwrEgid" value="${gwrValue}" placeholder="EGID eingeben">
          <button type="button" class="btn-gwr-lookup" id="btn-gwr-lookup" title="GWR-Daten abrufen">
            <i data-lucide="search" class="icon-sm"></i>
          </button>
        </td>
        <td class="col-korrektur ref-locked">${korrekturValue || '—'}</td>
        <td class="col-match"></td>
      </tr>
    `;
  } else {
    return `
      <tr class="data-row egid-row">
        <td class="col-attr">${getDataLabel('egid')}</td>
        <td class="col-sap">${sapValue}</td>
        <td class="col-gwr">${gwrValue}</td>
        <td class="col-korrektur">${korrekturValue}</td>
        <td class="col-match">${matchIcon}</td>
      </tr>
    `;
  }
}

// ========================================
// Edit Mode Event Handlers
// ========================================
function setupEditModeHandlers(building) {
  // GWR EGID lookup button
  const lookupBtn = document.getElementById('btn-gwr-lookup');
  const egidInput = document.getElementById('edit-gwrEgid');

  if (lookupBtn && egidInput) {
    lookupBtn.addEventListener('click', async () => {
      const egid = egidInput.value.trim();
      if (!egid) {
        alert('Bitte EGID eingeben');
        return;
      }

      lookupBtn.disabled = true;
      lookupBtn.innerHTML = '<i data-lucide="loader-2" class="icon-sm spin"></i>';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      try {
        const gwrData = await lookupGwrByEgid(egid);

        if (!gwrData) {
          alert('Kein Gebäude mit dieser EGID gefunden');
          return;
        }

        // Populate GWR column values in the building object (temporary for edit mode)
        // These will be saved when user clicks "Speichern"
        building.gwrEgid = egid;

        // Update field GWR values from API response
        const fieldsToUpdate = ['plz', 'ort', 'strasse', 'hausnummer', 'kanton', 'gemeinde', 'egrid', 'gkat', 'gklas', 'gbaup', 'footprintArea'];
        fieldsToUpdate.forEach(fieldName => {
          if (building[fieldName] && gwrData[fieldName]) {
            building[fieldName].gwr = gwrData[fieldName];
          }
        });

        // Update coordinates if available
        if (gwrData.lat && gwrData.lng) {
          if (building.lat) building.lat.gwr = String(gwrData.lat);
          if (building.lng) building.lng.gwr = String(gwrData.lng);
        }

        // Set inGwr to true since we found the building
        building.inGwr = true;

        // Re-render the comparison table with updated GWR data
        renderDataComparison(building);

        if (typeof lucide !== 'undefined') lucide.createIcons();

      } catch (error) {
        console.error('GWR lookup error:', error);
        alert('Fehler beim Abrufen der GWR-Daten');
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.innerHTML = '<i data-lucide="search" class="icon-sm"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });

    // Also trigger lookup on Enter key in EGID input
    egidInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lookupBtn.click();
      }
    });
  }
}

// ========================================
// Toggle Secondary Fields
// ========================================
export function toggleSecondaryFields() {
  showSecondaryFields = !showSecondaryFields;

  // Update button text
  const toggleBtn = document.getElementById('btn-toggle-fields');
  if (toggleBtn) {
    const icon = showSecondaryFields ? 'chevron-up' : 'chevron-down';
    const text = showSecondaryFields ? 'Weniger Attribute' : 'Mehr Attribute';
    toggleBtn.innerHTML = `<i data-lucide="${icon}" class="icon-sm"></i> ${text}`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Toggle visibility of secondary field rows
  const secondaryRows = document.querySelectorAll('.secondary-field');
  secondaryRows.forEach(row => {
    row.classList.toggle('hidden', !showSecondaryFields);
  });
}

export function setupFieldToggle() {
  const toggleBtn = document.getElementById('btn-toggle-fields');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSecondaryFields);
  }
}

// Edit Mode
// ========================================
function updateEditButton() {
  const btnCorrect = document.getElementById('btn-correct');
  const editActionsContainer = document.getElementById('edit-actions');

  if (state.editMode) {
    btnCorrect.style.display = 'none';
    if (editActionsContainer) {
      editActionsContainer.style.display = 'flex';
    }
  } else {
    btnCorrect.style.display = 'flex';
    if (editActionsContainer) {
      editActionsContainer.style.display = 'none';
    }
  }
}

// Store drag handler reference for cleanup
let currentDragHandler = null;

export function enterEditMode() {
  if (!state.selectedBuildingId) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building) return;

  // Store original values for all data fields (flat structure)
  state.originalBuildingData = {};
  ALL_DATA_FIELDS.forEach(field => {
    if (building[field]) {
      state.originalBuildingData[field] = JSON.parse(JSON.stringify(building[field]));
    }
  });
  // Also store inGwr and gwrEgid
  state.originalBuildingData.inGwr = building.inGwr;
  state.originalBuildingData.gwrEgid = building.gwrEgid;
  state.originalBuildingData.mapLat = building.mapLat;
  state.originalBuildingData.mapLng = building.mapLng;

  state.editedCoords = {
    lat: building.mapLat,
    lng: building.mapLng
  };
  state.editMode = true;

  const marker = markers[building.id];
  if (marker) {
    // Mapbox: enable dragging
    marker.setDraggable(true);

    // Add draggable class to marker element for visual feedback
    const markerEl = marker.getElement();
    if (markerEl) {
      markerEl.classList.add('draggable');
    }

    // Mapbox drag event handler
    currentDragHandler = () => {
      const lngLat = marker.getLngLat();
      state.editedCoords = { lat: lngLat.lat, lng: lngLat.lng };
      // Update combined coords display
      const coordsDisplay = document.getElementById('edit-coords-display');
      if (coordsDisplay) {
        coordsDisplay.textContent = `${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)}`;
      }
    };
    marker.on('drag', currentDragHandler);
  }

  renderDataComparison(building);

  document.getElementById('detail-panel')?.classList.add('edit-mode');
  document.querySelector('.map-panel')?.classList.add('edit-mode');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function exitEditMode(save) {
  if (!state.selectedBuildingId) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building) return;

  const marker = markers[building.id];

  if (save) {
    // Save inGwr dropdown value
    const inGwrSelect = document.getElementById('edit-inGwr');
    if (inGwrSelect) {
      const val = inGwrSelect.value;
      building.inGwr = val === 'true' ? true : val === 'false' ? false : null;
    }

    // Save gwrEgid from the GWR column input
    const gwrEgidInput = document.getElementById('edit-gwrEgid');
    if (gwrEgidInput) {
      building.gwrEgid = gwrEgidInput.value.trim();
    }

    // Save edited korrektur values
    document.querySelectorAll('.edit-input[data-column="korrektur"]').forEach(input => {
      const field = input.dataset.field;
      const newValue = input.value.trim();
      if (building[field]) {
        building[field].korrektur = newValue;
        // Recalculate match: true when sap === gwr === display value
        // Display value is korrektur if set, else gwr, else sap
        const sap = building[field].sap || '';
        const gwr = building[field].gwr || '';
        const displayVal = newValue || gwr || sap;
        building[field].match = (sap === gwr) && (gwr === displayVal);
      }
    });

    // Save coordinates to mapLat/mapLng
    if (state.editedCoords) {
      building.mapLat = state.editedCoords.lat;
      building.mapLng = state.editedCoords.lng;

      // Also update lat/lng korrektur fields for display
      const newLatValue = state.editedCoords.lat.toFixed(4);
      const newLngValue = state.editedCoords.lng.toFixed(4);

      if (building.lat) building.lat.korrektur = newLatValue;
      if (building.lng) building.lng.korrektur = newLngValue;

      // Update match for lat/lng
      const tolerance = 0.001;
      const latVal = state.editedCoords.lat;
      const lngVal = state.editedCoords.lng;

      const sapLat = building.lat?.sap ? parseFloat(building.lat.sap) : null;
      const sapLng = building.lng?.sap ? parseFloat(building.lng.sap) : null;
      const gwrLat = building.lat?.gwr ? parseFloat(building.lat.gwr) : null;
      const gwrLng = building.lng?.gwr ? parseFloat(building.lng.gwr) : null;

      const latSapMatch = sapLat !== null && Math.abs(latVal - sapLat) < tolerance;
      const latGwrMatch = gwrLat !== null && Math.abs(latVal - gwrLat) < tolerance;
      const lngSapMatch = sapLng !== null && Math.abs(lngVal - sapLng) < tolerance;
      const lngGwrMatch = gwrLng !== null && Math.abs(lngVal - gwrLng) < tolerance;

      if (building.lat) building.lat.match = latSapMatch && latGwrMatch;
      if (building.lng) building.lng.match = lngSapMatch && lngGwrMatch;
    }

    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = currentUser;
  } else {
    // Restore original values (flat structure)
    if (state.originalBuildingData) {
      ALL_DATA_FIELDS.forEach(field => {
        if (state.originalBuildingData[field]) {
          building[field] = state.originalBuildingData[field];
        }
      });
      // Restore inGwr, gwrEgid, and map coordinates
      building.inGwr = state.originalBuildingData.inGwr;
      building.gwrEgid = state.originalBuildingData.gwrEgid;
      building.mapLat = state.originalBuildingData.mapLat;
      building.mapLng = state.originalBuildingData.mapLng;
    }
    if (marker) {
      // Mapbox: setLngLat uses [lng, lat] order
      marker.setLngLat([building.mapLng, building.mapLat]);
    }
  }

  if (marker) {
    // Mapbox: disable dragging
    marker.setDraggable(false);

    // Remove draggable class from marker element
    const markerEl = marker.getElement();
    if (markerEl) {
      markerEl.classList.remove('draggable');
    }

    // Remove drag event handler
    if (currentDragHandler) {
      marker.off('drag', currentDragHandler);
      currentDragHandler = null;
    }
  }

  state.editMode = false;
  state.originalBuildingData = null;
  state.editedCoords = null;

  document.getElementById('detail-panel')?.classList.remove('edit-mode');
  document.querySelector('.map-panel')?.classList.remove('edit-mode');

  renderDataComparison(building);

  if (onDataChange) onDataChange();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ========================================
// Priority Dropdown
// ========================================
function renderPriorityDisplay(building) {
  const currentPriority = building.priority || 'medium';
  const currentOption = priorityOptions.find(p => p.value === currentPriority) || priorityOptions[1];

  createDropdown({
    containerId: 'priority-display',
    cleanupKey: 'priority',
    options: priorityOptions,
    currentValue: currentPriority,
    dataAttribute: 'priority',
    triggerClass: `priority-trigger priority-${currentPriority}`,
    optionClass: 'priority-option',
    extraClasses: 'flex-1',
    getTriggerContent: () => `<span>${currentOption.label}</span>`,
    onSelect: (value) => updateBuildingPriority(building.id, value)
  });
}

function updateBuildingPriority(buildingId, newPriority) {
  const building = buildings.find(b => b.id === buildingId);
  if (building) {
    building.priority = newPriority;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = currentUser;

    renderPriorityDisplay(building);

    if (onPriorityChange) onPriorityChange();
  }
}

// ========================================
// Status Dropdown
// ========================================
function renderStatusDisplay(building) {
  const currentStatus = building.kanbanStatus || 'backlog';
  const currentOption = statusOptions.find(s => s.value === currentStatus) || statusOptions[0];

  createDropdown({
    containerId: 'status-display',
    cleanupKey: 'status',
    options: statusOptions,
    currentValue: currentStatus,
    dataAttribute: 'status',
    triggerClass: 'status-trigger',
    optionClass: 'status-option',
    extraClasses: 'flex-1',
    getTriggerContent: () => `<span>${currentOption.label}</span>`,
    onSelect: (value) => updateBuildingStatus(building.id, value)
  });
}

function updateBuildingStatus(buildingId, newStatus) {
  const building = buildings.find(b => b.id === buildingId);
  if (building) {
    building.kanbanStatus = newStatus;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = currentUser;

    renderStatusDisplay(building);

    if (onStatusChange) onStatusChange();
  }
}

// ========================================
// Assignee Dropdown
// ========================================
function renderAssigneeDisplay(building) {
  const currentAssignee = building.assignee;
  const assigneeOptions = teamMembers.map(m => ({ value: m.name, label: m.name }));

  const unassignOption = currentAssignee ? `
    <div class="dropdown-divider assignee-divider"></div>
    <button class="dropdown-option-base assignee-option unassign" data-assignee="">
      <span>Zuweisung aufheben</span>
    </button>
  ` : '';

  createDropdown({
    containerId: 'assignee-display',
    cleanupKey: 'assignee',
    options: assigneeOptions,
    currentValue: currentAssignee,
    dataAttribute: 'assignee',
    triggerClass: 'assignee-trigger',
    optionClass: 'assignee-option',
    scrollable: true,
    extraOptions: unassignOption,
    getTriggerContent: () => currentAssignee
      ? `<span class="assignee-name">${currentAssignee}</span>`
      : `<span class="assignee-empty-text">Zuweisen...</span>`,
    onSelect: (value) => assignBuilding(building.id, value || null)
  });
}

function assignBuilding(buildingId, assigneeName) {
  const building = buildings.find(b => b.id === buildingId);
  if (building) {
    building.assignee = assigneeName;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = currentUser;

    renderAssigneeDisplay(building);

    if (onAssigneeChange) onAssigneeChange();
  }
}

// ========================================
// Due Date Display
// ========================================
function renderDueDateDisplay(building) {
  const container = document.getElementById('duedate-display');
  if (!container) return;

  // Add dropdown-base class for consistent styling with other dropdowns
  container.classList.add('dropdown-base', 'flex-1');

  const currentDueDate = building.dueDate;
  const hasDate = !!currentDueDate;

  // Calculate due date status
  let statusClass = '';
  if (hasDate) {
    const dueDate = new Date(currentDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateOnly = new Date(dueDate);
    dateOnly.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dateOnly - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      statusClass = 'overdue';
    } else if (diffDays <= 7) {
      statusClass = 'soon';
    }
  }

  // Format date for display
  const formattedDate = hasDate ? formatDisplayDate(currentDueDate) : '';

  // Format date for input value (YYYY-MM-DD)
  const inputValue = hasDate ? currentDueDate : '';

  container.innerHTML = `
    <button class="dropdown-trigger-base duedate-trigger ${hasDate ? statusClass : ''}" type="button">
      ${hasDate ? `
        <span class="duedate-value">${formattedDate}</span>
      ` : `
        <span class="duedate-empty-text">Datum setzen...</span>
      `}
      <input type="date" class="duedate-input" value="${inputValue}">
      <i data-lucide="chevron-down" class="icon-sm dropdown-chevron-base"></i>
    </button>
  `;

  // Setup event handlers
  const dateInput = container.querySelector('.duedate-input');
  const duedateTrigger = container.querySelector('.duedate-trigger');

  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      const newDate = e.target.value || null;
      updateBuildingDueDate(building.id, newDate);
    });
  }

  // Click on trigger opens the date picker
  if (duedateTrigger && dateInput) {
    duedateTrigger.addEventListener('click', () => {
      dateInput.showPicker();
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateBuildingDueDate(buildingId, newDueDate) {
  const building = buildings.find(b => b.id === buildingId);
  if (building) {
    building.dueDate = newDueDate;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = currentUser;

    renderDueDateDisplay(building);

    if (onDueDateChange) onDueDateChange();
  }
}

// ========================================
// Events Log
// ========================================
function renderEventsLog(buildingId) {
  const container = document.getElementById('events-list');
  const buildingEvents = eventsData[buildingId] || [];

  if (buildingEvents.length === 0) {
    container.innerHTML = '<p class="empty-text">Keine Ereignisse.</p>';
    return;
  }

  container.innerHTML = buildingEvents.map(event => `
    <div class="event-item">
      <div class="event-icon ${event.type}">
        <i data-lucide="${getEventIcon(event.type)}" class="icon-sm"></i>
      </div>
      <div class="event-content">
        <div class="event-title">${event.title}</div>
        <div class="event-meta">${event.user} · ${formatEventTime(event.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

function getEventIcon(type) {
  const icons = {
    status: 'git-branch',
    edit: 'pencil',
    comment: 'message-square',
    assign: 'user-check',
    create: 'plus-circle'
  };
  return icons[type] || 'activity';
}

function formatEventTime(timestamp) {
  return formatRelativeTime(timestamp);
}

// ========================================
// Comments
// ========================================
export function submitComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text || !state.selectedBuildingId) return;

  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building) return;

  const newComment = {
    author: currentUser,
    date: new Date().toLocaleDateString('de-CH'),
    text: text,
    system: false
  };

  building.comments.push(newComment);
  input.value = '';

  renderDetailPanel(building);
}

export function cancelComment() {
  document.getElementById('comment-input').value = '';
}

// ========================================
// Panel Resize
// ========================================
export function setupDetailPanelResize() {
  const resizeHandle = document.getElementById('detail-resize-handle');
  const detailPanel = document.getElementById('detail-panel');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = detailPanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaX = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + deltaX, 280), 600);
    detailPanel.style.width = newWidth + 'px';
    if (map) map.resize();
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // Touch support
  resizeHandle.addEventListener('touchstart', (e) => {
    isResizing = true;
    startX = e.touches[0].clientX;
    startWidth = detailPanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const deltaX = startX - e.touches[0].clientX;
    const newWidth = Math.min(Math.max(startWidth + deltaX, 280), 600);
    detailPanel.style.width = newWidth + 'px';
    if (map) map.resize();
  });

  document.addEventListener('touchend', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
    }
  });
}

// ========================================
// Accordions
// ========================================
export function setupAccordions() {
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const accordion = header.closest('.accordion');
      accordion.classList.toggle('open');
    });
  });
}

// ========================================
// Image Widget
// ========================================
let currentImageIndex = 0;

export function renderImageWidget(building) {
  const images = building.images || [];
  const emptyState = document.getElementById('image-empty-state');
  const carousel = document.getElementById('image-carousel');
  const imagesCountEl = document.getElementById('images-count');

  // Update count badge (show only when there are images)
  if (images.length > 0) {
    imagesCountEl.textContent = images.length;
    imagesCountEl.style.display = '';
  } else {
    imagesCountEl.style.display = 'none';
  }
  // Section is always visible (open by default in HTML)

  // Show/hide states
  if (images.length === 0) {
    emptyState.style.display = '';
    carousel.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  carousel.style.display = '';

  // Reset index if out of bounds
  if (currentImageIndex >= images.length) {
    currentImageIndex = 0;
  }

  // Render current image
  const currentImage = images[currentImageIndex];
  const carouselImage = document.getElementById('carousel-image');
  carouselImage.src = currentImage.url;
  carouselImage.alt = currentImage.filename || 'Gebäudebild';

  // Update filename overlay
  document.getElementById('carousel-filename').textContent = currentImage.filename || 'Bild';

  // Render dots
  const dotsContainer = document.getElementById('carousel-dots');
  dotsContainer.innerHTML = '';

  // Only show dots if more than one image
  if (images.length > 1) {
    dotsContainer.style.display = '';
    images.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = `carousel-dot${index === currentImageIndex ? ' active' : ''}`;
      dot.type = 'button';
      dot.title = `Bild ${index + 1}`;
      dot.addEventListener('click', () => {
        currentImageIndex = index;
        renderImageWidget(building);
      });
      dotsContainer.appendChild(dot);
    });
  } else {
    dotsContainer.style.display = 'none';
  }

  // Show/hide nav buttons (only for multiple images)
  document.getElementById('carousel-prev').style.visibility = images.length > 1 ? 'visible' : 'hidden';
  document.getElementById('carousel-next').style.visibility = images.length > 1 ? 'visible' : 'hidden';
}

function navigateCarousel(direction) {
  if (!state.selectedBuildingId) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building || !building.images || building.images.length === 0) return;

  const images = building.images;
  if (direction === 'prev') {
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
  } else {
    currentImageIndex = (currentImageIndex + 1) % images.length;
  }
  renderImageWidget(building);
}

function handleImageUpload(files) {
  if (!state.selectedBuildingId || !files || files.length === 0) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building) return;

  if (!building.images) {
    building.images = [];
  }

  // Process each file (mock - in real app would upload to server)
  Array.from(files).forEach(file => {
    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      alert('Datei zu gross (max. 10MB)');
      return;
    }

    // Create object URL for preview (in real app, use server URL)
    const url = URL.createObjectURL(file);
    building.images.push({
      id: Date.now() + Math.random(),
      url: url,
      filename: file.name,
      uploadDate: new Date().toISOString(),
      uploadedBy: currentUser
    });
  });

  // Update timestamps
  building.lastUpdate = new Date().toISOString();
  building.lastUpdateBy = currentUser;

  // Jump to last uploaded image
  currentImageIndex = building.images.length - 1;
  renderImageWidget(building);
}

function deleteCurrentImage() {
  if (!state.selectedBuildingId) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building || !building.images || building.images.length === 0) return;

  // Confirm deletion
  if (!confirm('Bild wirklich löschen?')) return;

  // Remove current image
  const removed = building.images.splice(currentImageIndex, 1)[0];

  // Revoke object URL if it was a blob
  if (removed && removed.url && removed.url.startsWith('blob:')) {
    URL.revokeObjectURL(removed.url);
  }

  // Update timestamps
  building.lastUpdate = new Date().toISOString();
  building.lastUpdateBy = currentUser;

  // Adjust index
  if (currentImageIndex >= building.images.length && building.images.length > 0) {
    currentImageIndex = building.images.length - 1;
  }

  renderImageWidget(building);
}

function openFullscreen() {
  if (!state.selectedBuildingId) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building || !building.images || building.images.length === 0) return;

  const currentImage = building.images[currentImageIndex];
  if (!currentImage) return;

  // Create fullscreen modal if it doesn't exist
  let modal = document.getElementById('image-fullscreen-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'image-fullscreen-modal';
    modal.className = 'image-fullscreen-modal';
    modal.innerHTML = `
      <button class="image-fullscreen-close" type="button">
        <i data-lucide="x" class="icon"></i>
      </button>
      <img src="" alt="Vollbild">
    `;
    document.body.appendChild(modal);

    // Close on click outside or on close button
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.image-fullscreen-close')) {
        modal.classList.remove('visible');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('visible')) {
        modal.classList.remove('visible');
      }
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  modal.querySelector('img').src = currentImage.url;
  modal.classList.add('visible');
}

function downloadCurrentImage() {
  if (!state.selectedBuildingId) return;
  const building = buildings.find(b => b.id === state.selectedBuildingId);
  if (!building || !building.images || building.images.length === 0) return;

  const currentImage = building.images[currentImageIndex];
  if (!currentImage) return;

  // Create a temporary link to trigger download
  const link = document.createElement('a');
  link.href = currentImage.url;
  link.download = currentImage.filename || 'download';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function setupImageWidget() {
  // Navigation buttons
  document.getElementById('carousel-prev')?.addEventListener('click', () => navigateCarousel('prev'));
  document.getElementById('carousel-next')?.addEventListener('click', () => navigateCarousel('next'));

  // Delete button
  document.getElementById('carousel-delete')?.addEventListener('click', deleteCurrentImage);

  // Download button
  document.getElementById('carousel-download')?.addEventListener('click', downloadCurrentImage);

  // Fullscreen button
  document.getElementById('carousel-fullscreen')?.addEventListener('click', openFullscreen);

  // Upload from empty state
  document.getElementById('image-upload-input')?.addEventListener('change', (e) => {
    handleImageUpload(e.target.files);
    e.target.value = ''; // Reset to allow same file
  });

  // Upload from add button in carousel actions
  document.getElementById('carousel-add-input')?.addEventListener('change', (e) => {
    handleImageUpload(e.target.files);
    e.target.value = '';
  });

  // Keyboard navigation when carousel is focused
  document.getElementById('image-carousel')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') navigateCarousel('prev');
    if (e.key === 'ArrowRight') navigateCarousel('next');
  });
}
