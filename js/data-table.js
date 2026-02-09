// ========================================
// Data Table Module
// Table view rendering with search, pagination, and selection
// ========================================

import { ensureXLSX } from './xlsx-loader.js';
import { scheduleLucideRefresh } from './icons.js';
import {
  state,
  getFilteredBuildings,
  tableVisible,
  setTableVisible,
  updateURL,
  getTagLabel,
  getErrorType,
  formatRelativeTime,
  formatDateTime,
  getFieldDisplayValue,
  escapeHtml
} from './state.js';
import { map } from './map.js';

// Callback for building selection
let onSelectBuilding = null;

// Table state
let tableSearchQuery = '';
let currentPage = 1;
let pageSize = 100;

// Sort state
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'

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
function getSearchFilteredBuildings(preFiltered = null) {
  let buildings = preFiltered || getFilteredBuildings();

  if (tableSearchQuery.trim()) {
    const query = tableSearchQuery.toLowerCase().trim();
    buildings = buildings.filter(b => {
      const searchFields = [
        b.id,
        b.name,
        getFieldDisplayValue(b.kanton),
        getStatusLabel(b.kanbanStatus),
        b.assignee || ''
      ].map(f => (f || '').toLowerCase());

      return searchFields.some(field => field.includes(query));
    });
  }

  return buildings;
}

// ========================================
// Sorting
// ========================================
function getSortedBuildings(buildings) {
  if (!sortColumn) return buildings;

  const sorted = [...buildings];

  // Priority order mapping (high = 1, medium = 2, low = 3)
  const priorityOrder = { high: 1, medium: 2, low: 3 };

  // Status order mapping
  const statusOrder = { backlog: 1, inprogress: 2, clarification: 3, done: 4 };

  sorted.sort((a, b) => {
    let valA, valB;

    switch (sortColumn) {
      case 'priority':
        valA = priorityOrder[a.priority] || 4;
        valB = priorityOrder[b.priority] || 4;
        break;
      case 'status':
        valA = statusOrder[a.kanbanStatus] || 0;
        valB = statusOrder[b.kanbanStatus] || 0;
        break;
      case 'confidence':
        valA = a.confidence?.total ?? 0;
        valB = b.confidence?.total ?? 0;
        break;
      case 'updated':
        valA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : 0;
        valB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : 0;
        break;
      case 'id':
        valA = (a.id || '').toLowerCase();
        valB = (b.id || '').toLowerCase();
        break;
      case 'name':
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        break;
      case 'kanton':
        valA = (getFieldDisplayValue(a.kanton) || '').toLowerCase();
        valB = (getFieldDisplayValue(b.kanton) || '').toLowerCase();
        break;
      case 'portfolio':
        valA = (a.portfolio || '').toLowerCase();
        valB = (b.portfolio || '').toLowerCase();
        break;
      case 'assignee':
        valA = (a.assignee || '').toLowerCase();
        valB = (b.assignee || '').toLowerCase();
        break;
      default:
        return 0;
    }

    // Compare values
    let result;
    if (typeof valA === 'number' && typeof valB === 'number') {
      result = valA - valB;
    } else {
      result = valA < valB ? -1 : valA > valB ? 1 : 0;
    }

    return sortDirection === 'desc' ? -result : result;
  });

  return sorted;
}

function handleSort(column) {
  if (sortColumn === column) {
    // Toggle direction or clear sort
    if (sortDirection === 'asc') {
      sortDirection = 'desc';
    } else {
      // Clear sort on third click
      sortColumn = null;
      sortDirection = 'asc';
    }
  } else {
    // New column, start with ascending
    sortColumn = column;
    sortDirection = 'asc';
  }
  currentPage = 1; // Reset to first page
  renderTableView();
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('.buildings-table thead th[data-col]');
  headers.forEach(th => {
    const col = th.dataset.col;
    // Remove existing sort classes and indicators
    th.classList.remove('sort-asc', 'sort-desc', 'sortable');
    th.classList.add('sortable');

    if (col === sortColumn) {
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function setupTableSorting() {
  const thead = document.querySelector('.buildings-table thead');
  if (!thead) return;

  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;

    const col = th.dataset.col;
    // Skip non-sortable columns (errors has multiple values)
    if (col === 'errors') return;

    handleSort(col);
  });
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

function getSelectedBuildings() {
  const allBuildings = getFilteredBuildings();
  return allBuildings.filter(b => selectedIds.has(b.id));
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
export function renderTableView(preFiltered = null) {
  const tbody = document.getElementById('table-body');
  const totalBuildings = preFiltered || getFilteredBuildings();
  const filteredBuildings = getSearchFilteredBuildings(totalBuildings);
  const sortedBuildings = getSortedBuildings(filteredBuildings);
  const paginatedBuildings = getPaginatedBuildings(sortedBuildings);

  // Update header sort indicators
  updateSortIndicators();

  // Ensure current page is valid
  const totalPages = getTotalPages(filteredBuildings.length);
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
    return renderTableView();
  }

  // Render table rows
  if (paginatedBuildings.length === 0) {
    if (tableSearchQuery.trim()) {
      tbody.innerHTML = `<tr><td colspan="12" class="table-empty">Keine Treffer für «${escapeHtml(tableSearchQuery)}»</td></tr>`;
    } else {
      tbody.innerHTML = '<tr><td colspan="12" class="table-empty">Keine Gebäude gefunden</td></tr>';
    }
  } else {
    tbody.innerHTML = paginatedBuildings.map(building => {
      // Use confidence-based colors for consistency across the app
      const confidenceClass = building.confidence.total < 50 ? 'critical' : building.confidence.total < 80 ? 'warning' : 'ok';
      const statusLabel = getStatusLabel(building.kanbanStatus);
      const isChecked = selectedIds.has(building.id);

      return `
        <tr class="table-row ${state.selectedBuildingId === building.id ? 'selected' : ''}" data-id="${building.id}">
          <td class="col-checkbox">
            <input type="checkbox" class="table-row-checkbox" data-id="${building.id}" ${isChecked ? 'checked' : ''}>
          </td>
          <td data-col="priority">${getPriorityLabel(building.priority)}</td>
          <td data-col="id">
            <div class="table-cell-id">
              <span class="priority-indicator ${confidenceClass}"></span>
              <span class="building-id">${building.id}</span>
            </div>
          </td>
          <td data-col="name">${escapeHtml(building.name || '')}</td>
          <td data-col="kanton">${getFieldDisplayValue(building.kanton)}</td>
          <td data-col="portfolio">${building.portfolio || '<span class="text-muted">—</span>'}</td>
          <td data-col="status">
            <span class="status-badge status-${building.kanbanStatus || 'backlog'}">${statusLabel}</span>
          </td>
          <td data-col="confidence">
            <span class="confidence-value ${building.confidence.total < 50 ? 'critical' : building.confidence.total < 80 ? 'warning' : 'ok'}">
              ${building.confidence.total}%
            </span>
          </td>
          <td data-col="errors">
            <div class="badge-group">
              ${building.errors.map(err => { const type = getErrorType(err.checkId); return `<span class="badge badge-${type} badge-caps badge-sm">${getTagLabel(type)}</span>`; }).join('')}
              ${building.errors.length === 0 ? '<span class="text-muted">—</span>' : ''}
            </div>
          </td>
          <td data-col="assignee">${building.assignee ? `<span class="text-secondary">${escapeHtml(building.assignee)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td data-col="updated" class="text-muted" title="${formatDateTime(building.lastUpdate)} von ${escapeHtml(building.lastUpdateBy || '—')}">${formatRelativeTime(building.lastUpdate)}</td>
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
  scheduleLucideRefresh();

  // Reapply column visibility to newly rendered rows
  applyInitialColumnVisibility();
}

function getStatusLabel(status) {
  const labels = {
    backlog: 'Offen',
    inprogress: 'In Bearbeitung',
    clarification: 'Rückfrage',
    done: 'Erledigt'
  };
  return labels[status] || labels.backlog;
}

function getPriorityLabel(priority) {
  const labels = {
    high: '<span class="priority-badge priority-high"><i data-lucide="chevrons-up" class="icon"></i>Hoch</span>',
    medium: '<span class="priority-badge priority-medium"><i data-lucide="chevron-up" class="icon"></i>Mittel</span>',
    low: '<span class="priority-badge priority-low"><i data-lucide="minus" class="icon"></i>Niedrig</span>'
  };
  return labels[priority] || '<span class="text-muted">—</span>';
}

// ========================================
// Export Functions
// ========================================
async function exportData(format, selectionOnly) {
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
      await exportXLSX(buildings);
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
    getFieldDisplayValue(b.kanton) || '',
    getStatusLabel(b.kanbanStatus),
    b.confidence.total,
    b.priority || 'medium',
    b.assignee || '',
    b.lastUpdate || ''
  ]);

  const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  downloadFile(csv, 'gebaeude-export.csv', 'text/csv;charset=utf-8');
}

async function exportXLSX(buildings) {
  await ensureXLSX();
  const headers = ['ID', 'Name', 'Kanton', 'Status', 'Konfidenz', 'Priorität', 'Zugewiesen', 'Letzte Aktualisierung'];
  const rows = buildings.map(b => [
    b.id,
    b.name || '',
    getFieldDisplayValue(b.kanton) || '',
    getStatusLabel(b.kanbanStatus),
    b.confidence.total,
    b.priority || 'medium',
    b.assignee || '',
    b.lastUpdate || ''
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gebäude');
  XLSX.writeFile(wb, 'gebaeude-export.xlsx');
}

function exportGeoJSON(buildings) {
  const features = buildings.map(b => ({
    type: 'Feature',
    properties: {
      id: b.id,
      name: b.name,
      kanton: getFieldDisplayValue(b.kanton) || '',
      status: b.kanbanStatus,
      confidence: b.confidence.total,
      priority: b.priority,
      assignee: b.assignee
    },
    geometry: {
      type: 'Point',
      coordinates: [b.mapLng, b.mapLat] // GeoJSON uses [lon, lat]
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

  // Table sorting
  setupTableSorting();

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

  // Column visibility dropdown
  setupColumnVisibility();
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
// Column Visibility
// ========================================
function setupColumnVisibility() {
  const columnsBtn = document.getElementById('table-columns-btn');
  const columnsDropdown = document.getElementById('table-columns-dropdown');
  const table = document.querySelector('.buildings-table');

  if (!columnsBtn || !columnsDropdown || !table) return;

  // Toggle dropdown
  columnsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    columnsDropdown.classList.toggle('visible');
    // Close export dropdown if open
    document.getElementById('table-export-dropdown')?.classList.remove('visible');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!columnsDropdown.contains(e.target) && !columnsBtn.contains(e.target)) {
      columnsDropdown.classList.remove('visible');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      columnsDropdown.classList.remove('visible');
    }
  });

  // Column visibility checkboxes
  columnsDropdown.querySelectorAll('input[data-col]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const col = checkbox.dataset.col;
      const isVisible = checkbox.checked;
      toggleColumnVisibility(col, isVisible);
    });
  });

  // Apply initial visibility (Portfolio hidden by default)
  applyInitialColumnVisibility();
}

function toggleColumnVisibility(col, isVisible) {
  const table = document.querySelector('.buildings-table');
  if (!table) return;

  // Find all th and td with this data-col
  const cells = table.querySelectorAll(`[data-col="${col}"]`);
  cells.forEach(cell => {
    cell.classList.toggle('col-hidden', !isVisible);
  });
}

function applyInitialColumnVisibility() {
  const dropdown = document.getElementById('table-columns-dropdown');
  if (!dropdown) return;

  dropdown.querySelectorAll('input[data-col]').forEach(checkbox => {
    const col = checkbox.dataset.col;
    const isVisible = checkbox.checked;
    toggleColumnVisibility(col, isVisible);
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
