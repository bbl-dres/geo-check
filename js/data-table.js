// ========================================
// Data Table Module
// Table view rendering with search, pagination, and selection
// ========================================

import {
  state,
  getFilteredBuildings,
  tableVisible,
  setTableVisible,
  updateURL,
  getTagLabel,
  formatRelativeTime,
  formatDateTime
} from './state.js';
import { map } from './map.js';

// Callback for building selection
let onSelectBuilding = null;

// Table state
let tableSearchQuery = '';
let currentPage = 1;
let pageSize = 100;

// Selection state
let selectedIds = new Set();

export function setCallbacks(callbacks) {
  onSelectBuilding = callbacks.onSelectBuilding;
}

// ========================================
// Table Visibility Toggle
// ========================================
export function toggleTableView() {
  setTableVisible(!tableVisible);
  document.getElementById('table-panel').classList.toggle('visible', tableVisible);
  document.getElementById('table-toggle-btn').classList.toggle('active', tableVisible);

  if (tableVisible) {
    renderTableView();
  }

  // Resize map after panel toggles
  if (map) {
    setTimeout(() => map.resize(), 50);
  }

  updateURL();
}

export function closeTableView() {
  setTableVisible(false);
  document.getElementById('table-panel').classList.remove('visible');
  document.getElementById('table-toggle-btn').classList.remove('active');

  if (map) {
    setTimeout(() => map.resize(), 50);
  }

  updateURL();
}

// ========================================
// Search & Filter
// ========================================
function getSearchFilteredBuildings() {
  let buildings = getFilteredBuildings();

  if (tableSearchQuery.trim()) {
    const query = tableSearchQuery.toLowerCase().trim();
    buildings = buildings.filter(b => {
      const searchFields = [
        b.id,
        b.name,
        b.kanton,
        getStatusLabel(b.kanbanStatus),
        b.assignee || ''
      ].map(f => (f || '').toLowerCase());

      return searchFields.some(field => field.includes(query));
    });
  }

  return buildings;
}

// ========================================
// Selection
// ========================================
function toggleSelection(buildingId, event) {
  event.stopPropagation();
  if (selectedIds.has(buildingId)) {
    selectedIds.delete(buildingId);
  } else {
    selectedIds.add(buildingId);
  }
  updateSelectionUI();
}

function toggleSelectAllOnPage() {
  const paginatedBuildings = getPaginatedBuildings(getSearchFilteredBuildings());
  const pageIds = paginatedBuildings.map(b => b.id);
  const allSelected = pageIds.every(id => selectedIds.has(id));

  if (allSelected) {
    // Deselect all on page
    pageIds.forEach(id => selectedIds.delete(id));
  } else {
    // Select all on page
    pageIds.forEach(id => selectedIds.add(id));
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const paginatedBuildings = getPaginatedBuildings(getSearchFilteredBuildings());
  const pageIds = paginatedBuildings.map(b => b.id);
  const selectedOnPage = pageIds.filter(id => selectedIds.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected;

  // Update header checkbox
  const headerCheckbox = document.getElementById('table-select-all-header');
  if (headerCheckbox) {
    headerCheckbox.checked = allOnPageSelected;
    headerCheckbox.indeterminate = someOnPageSelected;
  }


  // Update row checkboxes
  document.querySelectorAll('.table-row-checkbox').forEach(cb => {
    cb.checked = selectedIds.has(cb.dataset.id);
  });

  // Update selection count
  const countEl = document.getElementById('table-selection-count');
  if (countEl) {
    if (selectedIds.size > 0) {
      countEl.textContent = `${selectedIds.size} ausgewählt`;
    } else {
      countEl.textContent = '';
    }
  }

  // Show/hide export selection section
  const exportSelectionSection = document.getElementById('export-selection-section');
  if (exportSelectionSection) {
    exportSelectionSection.style.display = selectedIds.size > 0 ? 'block' : 'none';
  }
}

export function getSelectedBuildings() {
  const allBuildings = getFilteredBuildings();
  return allBuildings.filter(b => selectedIds.has(b.id));
}

export function clearSelection() {
  selectedIds.clear();
  updateSelectionUI();
}

// ========================================
// Pagination
// ========================================
function getTotalPages(totalItems) {
  return Math.ceil(totalItems / pageSize);
}

function getPaginatedBuildings(buildings) {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return buildings.slice(start, end);
}

function renderPagination(totalItems, filteredCount) {
  const totalPages = Math.max(1, getTotalPages(filteredCount));
  const paginationContainer = document.getElementById('table-pagination');
  const pagesContainer = document.getElementById('pagination-pages');
  const prevBtn = document.getElementById('pagination-prev');
  const nextBtn = document.getElementById('pagination-next');

  // Always show pagination
  paginationContainer.style.display = 'flex';

  // Update prev/next buttons
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;

  // Generate page numbers
  const pages = generatePageNumbers(currentPage, totalPages);
  pagesContainer.innerHTML = pages.map(p => {
    if (p === '...') {
      return '<span class="pagination-page ellipsis">...</span>';
    }
    return `<button class="pagination-page ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }).join('');

  // Add click handlers to page buttons
  pagesContainer.querySelectorAll('.pagination-page:not(.ellipsis)').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page, 10);
      if (page !== currentPage) {
        currentPage = page;
        renderTableView();
      }
    });
  });
}

function generatePageNumbers(current, total) {
  const pages = [];

  if (total <= 7) {
    // Show all pages
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (current <= 3) {
      // Near start
      pages.push(2, 3, 4, '...', total);
    } else if (current >= total - 2) {
      // Near end
      pages.push('...', total - 3, total - 2, total - 1, total);
    } else {
      // Middle
      pages.push('...', current - 1, current, current + 1, '...', total);
    }
  }

  return pages;
}

// ========================================
// Table Rendering
// ========================================
export function renderTableView() {
  const tbody = document.getElementById('table-body');
  const totalBuildings = getFilteredBuildings();
  const filteredBuildings = getSearchFilteredBuildings();
  const paginatedBuildings = getPaginatedBuildings(filteredBuildings);

  // Ensure current page is valid
  const totalPages = getTotalPages(filteredBuildings.length);
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
    return renderTableView();
  }

  // Render table rows
  if (paginatedBuildings.length === 0) {
    if (tableSearchQuery.trim()) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Keine Treffer für «${escapeHtml(tableSearchQuery)}»</td></tr>`;
    } else {
      tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Keine Gebäude gefunden</td></tr>';
    }
  } else {
    tbody.innerHTML = paginatedBuildings.map(building => {
      const priorityClass = building.priority || 'medium';
      const statusLabel = getStatusLabel(building.kanbanStatus);
      const isChecked = selectedIds.has(building.id);

      return `
        <tr class="table-row ${state.selectedBuildingId === building.id ? 'selected' : ''}" data-id="${building.id}">
          <td class="col-checkbox">
            <input type="checkbox" class="table-row-checkbox" data-id="${building.id}" ${isChecked ? 'checked' : ''}>
          </td>
          <td>
            <div class="table-cell-id">
              <span class="priority-indicator ${priorityClass}"></span>
              <span class="building-id">${building.id}</span>
            </div>
          </td>
          <td>${building.name}</td>
          <td>${building.kanton}</td>
          <td>
            <span class="status-badge status-${building.kanbanStatus || 'backlog'}">${statusLabel}</span>
          </td>
          <td>
            <span class="confidence-value ${building.confidence.total < 50 ? 'critical' : building.confidence.total < 80 ? 'warning' : 'ok'}">
              ${building.confidence.total}%
            </span>
          </td>
          <td>
            <div class="badge-group">
              ${building.errors.map(err => `<span class="badge badge-${err.type} badge-caps badge-sm">${getTagLabel(err.type)}</span>`).join('')}
              ${building.errors.length === 0 ? '<span class="text-muted">—</span>' : ''}
            </div>
          </td>
          <td>${building.assignee ? `<span class="text-secondary">${building.assignee}</span>` : '<span class="text-muted">—</span>'}</td>
          <td class="text-muted" title="${formatDateTime(building.lastUpdate)} von ${building.lastUpdateBy || '—'}">${formatRelativeTime(building.lastUpdate)}</td>
        </tr>
      `;
    }).join('');

    // Add click handlers for rows (but not checkboxes)
    tbody.querySelectorAll('.table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        // Don't trigger row click if clicking checkbox
        if (e.target.type === 'checkbox') return;
        if (onSelectBuilding) {
          onSelectBuilding(row.dataset.id);
        }
      });
    });

    // Add click handlers for checkboxes
    tbody.querySelectorAll('.table-row-checkbox').forEach(cb => {
      cb.addEventListener('click', (e) => {
        toggleSelection(cb.dataset.id, e);
      });
    });
  }

  // Update count display in footer
  const countEl = document.getElementById('table-count');
  if (tableSearchQuery.trim() && filteredBuildings.length !== totalBuildings.length) {
    countEl.textContent = `${filteredBuildings.length} von ${totalBuildings.length} Gebäude`;
  } else {
    countEl.textContent = `${totalBuildings.length} Gebäude`;
  }

  // Render pagination
  renderPagination(totalBuildings.length, filteredBuildings.length);

  // Update selection UI
  updateSelectionUI();

  // Refresh icons
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function getStatusLabel(status) {
  const labels = {
    backlog: 'Backlog',
    inprogress: 'In Bearbeitung',
    clarification: 'Abklärung',
    done: 'Erledigt'
  };
  return labels[status] || labels.backlog;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// Export Functions
// ========================================
function exportData(format, selectionOnly) {
  const buildings = selectionOnly ? getSelectedBuildings() : getSearchFilteredBuildings();

  if (buildings.length === 0) {
    alert('Keine Daten zum Exportieren vorhanden.');
    return;
  }

  switch (format) {
    case 'csv':
      exportCSV(buildings);
      break;
    case 'xlsx':
      exportXLSX(buildings);
      break;
    case 'geojson':
      exportGeoJSON(buildings);
      break;
  }
}

function exportCSV(buildings) {
  const headers = ['ID', 'Name', 'Kanton', 'Status', 'Konfidenz', 'Priorität', 'Zugewiesen', 'Letzte Aktualisierung'];
  const rows = buildings.map(b => [
    b.id,
    `"${(b.name || '').replace(/"/g, '""')}"`,
    b.kanton,
    getStatusLabel(b.kanbanStatus),
    b.confidence.total,
    b.priority || 'medium',
    b.assignee || '',
    b.lastUpdate || ''
  ]);

  const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  downloadFile(csv, 'gebaeude-export.csv', 'text/csv;charset=utf-8');
}

function exportXLSX(buildings) {
  // For now, export as CSV with .xlsx extension
  // In production, use a library like SheetJS
  alert('XLSX-Export wird implementiert. Vorerst als CSV exportiert.');
  exportCSV(buildings);
}

function exportGeoJSON(buildings) {
  const features = buildings.map(b => ({
    type: 'Feature',
    properties: {
      id: b.id,
      name: b.name,
      kanton: b.kanton,
      status: b.kanbanStatus,
      confidence: b.confidence.total,
      priority: b.priority,
      assignee: b.assignee
    },
    geometry: {
      type: 'Point',
      coordinates: [b.coords[1], b.coords[0]] // GeoJSON uses [lon, lat]
    }
  }));

  const geojson = {
    type: 'FeatureCollection',
    features
  };

  downloadFile(JSON.stringify(geojson, null, 2), 'gebaeude-export.geojson', 'application/geo+json');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================================
// Event Listeners Setup
// ========================================
export function setupTableViewListeners() {
  document.getElementById('table-toggle-btn').addEventListener('click', toggleTableView);
  document.getElementById('table-close-btn').addEventListener('click', closeTableView);

  // Search input
  const searchInput = document.getElementById('table-search-input');
  const searchContainer = searchInput?.parentElement;
  const clearBtn = document.getElementById('table-search-clear');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      tableSearchQuery = e.target.value;
      currentPage = 1; // Reset to first page on search
      searchContainer?.classList.toggle('has-value', tableSearchQuery.length > 0);
      renderTableView();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        tableSearchQuery = '';
        searchInput.value = '';
        currentPage = 1;
        searchContainer?.classList.remove('has-value');
        renderTableView();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      tableSearchQuery = '';
      if (searchInput) searchInput.value = '';
      currentPage = 1;
      searchContainer?.classList.remove('has-value');
      renderTableView();
    });
  }

  // Pagination prev/next
  const prevBtn = document.getElementById('pagination-prev');
  const nextBtn = document.getElementById('pagination-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTableView();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const filteredBuildings = getSearchFilteredBuildings();
      const totalPages = getTotalPages(filteredBuildings.length);
      if (currentPage < totalPages) {
        currentPage++;
        renderTableView();
      }
    });
  }

  // Select all checkbox (in table header)
  const headerSelectAll = document.getElementById('table-select-all-header');
  if (headerSelectAll) {
    headerSelectAll.addEventListener('change', toggleSelectAllOnPage);
  }

  // Page size selector
  const pageSizeSelect = document.getElementById('table-page-size');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10);
      currentPage = 1; // Reset to first page when changing page size
      renderTableView();
    });
  }

  // Export dropdown
  setupExportDropdown();
}

function setupExportDropdown() {
  const exportBtn = document.getElementById('table-export-btn');
  const exportDropdown = document.getElementById('table-export-dropdown');

  if (!exportBtn || !exportDropdown) return;

  // Toggle dropdown
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('visible');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!exportDropdown.contains(e.target) && !exportBtn.contains(e.target)) {
      exportDropdown.classList.remove('visible');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      exportDropdown.classList.remove('visible');
    }
  });

  // Export items
  exportDropdown.querySelectorAll('.export-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.export;
      const [scope, format] = action.split('-');
      exportData(format, scope === 'selection');
      exportDropdown.classList.remove('visible');
    });
  });
}

// ========================================
// Table Resize
// ========================================
export function setupTableResize() {
  const resizeHandle = document.getElementById('table-resize-handle');
  const tablePanel = document.getElementById('table-panel');
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = tablePanel.offsetHeight;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaY = startY - e.clientY;
    const newHeight = Math.min(Math.max(startHeight + deltaY, 100), window.innerHeight * 0.7);
    tablePanel.style.height = newHeight + 'px';
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
    startY = e.touches[0].clientY;
    startHeight = tablePanel.offsetHeight;
    resizeHandle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const deltaY = startY - e.touches[0].clientY;
    const newHeight = Math.min(Math.max(startHeight + deltaY, 100), window.innerHeight * 0.7);
    tablePanel.style.height = newHeight + 'px';
    if (map) map.resize();
  });

  document.addEventListener('touchend', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
    }
  });
}

// Reset table state (called when global filters change)
export function resetTableState() {
  currentPage = 1;
  // Don't clear selection on filter change - user may want to keep it
}
