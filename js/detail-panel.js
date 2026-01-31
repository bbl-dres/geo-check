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
  getTagLabel,
  getDataLabel,
  formatRelativeTime,
  formatDateTime
} from './state.js';
import { map, markers } from './map.js';

// Status options for dropdown
const statusOptions = [
  { value: 'backlog', label: 'Backlog', icon: 'layers' },
  { value: 'inprogress', label: 'In Bearbeitung', icon: 'play-circle' },
  { value: 'clarification', label: 'Abklärung', icon: 'help-circle' },
  { value: 'done', label: 'Erledigt', icon: 'check-circle' }
];

// Callbacks for external updates
let onStatusChange = null;
let onAssigneeChange = null;
let onDataChange = null;

export function setCallbacks(callbacks) {
  onStatusChange = callbacks.onStatusChange;
  onAssigneeChange = callbacks.onAssigneeChange;
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

  detailPanel.classList.add('visible');
  if (map) {
    // Resize map after panel shows
    setTimeout(() => map.resize(), 50);
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

  // Errors
  document.getElementById('error-cards').innerHTML = building.errors.length > 0
    ? building.errors.map(error => `
        <div class="error-card ${error.severity}">
          <div class="error-card-header">
            <span class="badge badge-${error.type} badge-caps badge-sm">${getTagLabel(error.type)}</span>
            <span class="error-card-title">${error.title}</span>
          </div>
          <div class="error-card-desc">${error.description}</div>
        </div>
      `).join('')
    : '<p class="empty-text">Keine Fehler gefunden.</p>';

  // Update error count badge
  const errorCountEl = document.getElementById('error-count');
  const fehlerAccordion = document.querySelector('[data-accordion="fehler"]');
  if (building.errors.length > 0) {
    errorCountEl.textContent = building.errors.length;
    errorCountEl.style.display = '';
    fehlerAccordion.classList.add('open');
  } else {
    errorCountEl.style.display = 'none';
    fehlerAccordion.classList.remove('open');
  }

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

  // Status dropdown
  renderStatusDisplay(building);

  // Assignee dropdown
  renderAssigneeDisplay(building);

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
export function renderDataComparison(building) {
  const container = document.getElementById('data-comparison');
  const isEditMode = state.editMode;

  const currentLat = state.editedCoords ? state.editedCoords.lat : building.lat;
  const currentLng = state.editedCoords ? state.editedCoords.lng : building.lng;
  const sapCoords = `${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`;

  container.innerHTML = Object.entries(building.data).map(([key, val]) => {
    const isCoords = key === 'coords';
    const sapValue = isCoords ? sapCoords : val.sap;
    const gwrValue = val.gwr;
    const isMatch = val.match;
    const matchIcon = isMatch
      ? '<i data-lucide="check" class="match-icon match"></i>'
      : '<i data-lucide="x" class="match-icon mismatch"></i>';

    if (isEditMode) {
      if (isCoords) {
        return `
          <tr class="data-row edit-row">
            <td class="col-attr">${getDataLabel(key)}</td>
            <td class="col-sap edit-cell">
              <span class="coords-value" id="edit-coords-display">${sapValue}</span>
            </td>
            <td class="col-gwr gwr-locked">${gwrValue}</td>
            <td class="col-match"></td>
          </tr>
        `;
      } else {
        return `
          <tr class="data-row edit-row">
            <td class="col-attr">${getDataLabel(key)}</td>
            <td class="col-sap edit-cell">
              <input type="text" class="edit-input" data-field="${key}" value="${sapValue === '—' || sapValue === 'Fehlt' ? '' : sapValue}" placeholder="${gwrValue !== '—' ? gwrValue : ''}">
            </td>
            <td class="col-gwr gwr-locked">${gwrValue}</td>
            <td class="col-match"></td>
          </tr>
        `;
      }
    } else {
      return `
        <tr class="data-row">
          <td class="col-attr">${getDataLabel(key)}</td>
          <td class="col-sap">${sapValue}</td>
          <td class="col-gwr">${gwrValue}</td>
          <td class="col-match">${matchIcon}</td>
        </tr>
      `;
    }
  }).join('');

  updateEditButton();
}

// ========================================
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

  state.originalBuildingData = JSON.parse(JSON.stringify(building.data));
  state.editedCoords = { lat: building.lat, lng: building.lng };
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
    document.querySelectorAll('.edit-input').forEach(input => {
      const field = input.dataset.field;
      const newValue = input.value.trim() || '—';
      if (building.data[field]) {
        building.data[field].sap = newValue;
        building.data[field].match = newValue === building.data[field].gwr;
      }
    });

    if (state.editedCoords) {
      building.lat = state.editedCoords.lat;
      building.lng = state.editedCoords.lng;
      if (building.data.coords) {
        building.data.coords.sap = `${state.editedCoords.lat.toFixed(4)}, ${state.editedCoords.lng.toFixed(4)}`;
        const gwrCoords = building.data.coords.gwr;
        if (gwrCoords && gwrCoords !== '—') {
          const [gwrLat, gwrLng] = gwrCoords.split(',').map(s => parseFloat(s.trim()));
          const tolerance = 0.001;
          building.data.coords.match =
            Math.abs(state.editedCoords.lat - gwrLat) < tolerance &&
            Math.abs(state.editedCoords.lng - gwrLng) < tolerance;
        }
      }
    }

    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = 'M. Keller';
  } else {
    if (state.originalBuildingData) {
      building.data = state.originalBuildingData;
    }
    if (marker) {
      // Mapbox: setLngLat uses [lng, lat] order
      marker.setLngLat([building.lng, building.lat]);
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
// Status Dropdown
// ========================================
function renderStatusDisplay(building) {
  const container = document.getElementById('status-display');
  const currentStatus = building.kanbanStatus || 'backlog';
  const currentOption = statusOptions.find(s => s.value === currentStatus) || statusOptions[0];

  const options = statusOptions.map(opt => `
    <button class="status-option ${currentStatus === opt.value ? 'selected' : ''}" data-status="${opt.value}">
      <span>${opt.label}</span>
    </button>
  `).join('');

  container.innerHTML = `
    <button class="status-trigger" type="button">
      <span>${currentOption.label}</span>
      <i data-lucide="chevron-down" class="icon-sm status-chevron"></i>
    </button>
    <div class="status-dropdown">
      ${options}
    </div>
  `;

  const trigger = container.querySelector('.status-trigger');
  let outsideClickHandler = null;

  const closeDropdown = () => {
    container.classList.remove('open');
    if (outsideClickHandler) {
      document.removeEventListener('click', outsideClickHandler);
      outsideClickHandler = null;
    }
  };

  trigger.addEventListener('click', (e) => {
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
  });

  container.querySelectorAll('.status-option').forEach(option => {
    option.addEventListener('click', () => {
      const newStatus = option.dataset.status;
      closeDropdown();
      updateBuildingStatus(building.id, newStatus);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateBuildingStatus(buildingId, newStatus) {
  const building = buildings.find(b => b.id === buildingId);
  if (building) {
    building.kanbanStatus = newStatus;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = 'M. Keller';

    renderStatusDisplay(building);

    if (onStatusChange) onStatusChange();
  }
}

// ========================================
// Assignee Dropdown
// ========================================
function renderAssigneeDisplay(building) {
  const container = document.getElementById('assignee-display');
  const currentAssignee = building.assignee;
  const member = currentAssignee ? teamMembers.find(m => m.name === currentAssignee) : null;

  let triggerContent;
  if (currentAssignee) {
    triggerContent = `<span class="assignee-name">${currentAssignee}</span>`;
  } else {
    triggerContent = `<span class="assignee-empty-text">Zuweisen...</span>`;
  }

  const options = teamMembers.map(m => `
    <button class="assignee-option ${currentAssignee === m.name ? 'selected' : ''}" data-assignee="${m.name}">
      <span>${m.name}</span>
    </button>
  `).join('');

  const unassignOption = currentAssignee ? `
    <div class="assignee-divider"></div>
    <button class="assignee-option unassign" data-assignee="">
      <span>Zuweisung aufheben</span>
    </button>
  ` : '';

  container.innerHTML = `
    <button class="assignee-trigger" type="button">
      ${triggerContent}
      <i data-lucide="chevron-down" class="icon-sm assignee-chevron"></i>
    </button>
    <div class="assignee-dropdown">
      ${options}
      ${unassignOption}
    </div>
  `;

  const trigger = container.querySelector('.assignee-trigger');
  let outsideClickHandler = null;

  const closeDropdown = () => {
    container.classList.remove('open');
    if (outsideClickHandler) {
      document.removeEventListener('click', outsideClickHandler);
      outsideClickHandler = null;
    }
  };

  trigger.addEventListener('click', (e) => {
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
  });

  container.querySelectorAll('.assignee-option').forEach(option => {
    option.addEventListener('click', () => {
      const newAssignee = option.dataset.assignee || null;
      closeDropdown();
      assignBuilding(building.id, newAssignee);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function assignBuilding(buildingId, assigneeName) {
  const building = buildings.find(b => b.id === buildingId);
  if (building) {
    building.assignee = assigneeName;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = 'M. Keller';

    renderAssigneeDisplay(building);

    if (onAssigneeChange) onAssigneeChange();
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
    author: 'M. Keller',
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
