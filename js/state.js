// ========================================
// State Management Module
// Central state, URL sync, and filtering
// ========================================

// Current user (centralized for easy swapping)
export const currentUser = 'M. Keller';

// Application state
export const state = {
  selectedBuildingId: null,
  activeFilters: {
    high: false,
    medium: false,
    low: false,
    myTasks: false
  },
  filterKanton: [],
  filterConfidence: [],
  filterPortfolio: [],
  filterStatus: [],
  filterAssignee: [],
  currentTab: 'karte',
  editMode: false,
  originalBuildingData: null,
  editedCoords: null
};

// Data stores (populated by main.js)
export let buildings = [];
export let teamMembers = [];
export let eventsData = {};
export let commentsData = {};
export let errorsData = {};
export let rulesConfig = null;

// Search query
let searchQuery = '';

// Table visibility
export let tableVisible = true;

// Set data (called from main.js after loading)
export function setData(data) {
  buildings = data.buildings || [];
  teamMembers = data.teamMembers || [];
  eventsData = data.eventsData || {};
  commentsData = data.commentsData || {};
  errorsData = data.errorsData || {};
  rulesConfig = data.rulesConfig || null;
}

export function setTableVisible(visible) {
  tableVisible = visible;
}

export function setSearchQuery(query) {
  searchQuery = query;
}

export function getSearchQuery() {
  return searchQuery;
}

// ========================================
// URL Navigation
// ========================================
export function updateURL(replace = false) {
  const params = new URLSearchParams();

  params.set('tab', state.currentTab);

  if (state.selectedBuildingId) {
    params.set('id', state.selectedBuildingId);
  }

  const defaultFilters = { high: false, medium: false, low: false, myTasks: false };
  const filterDiff = [];
  Object.entries(state.activeFilters).forEach(([key, value]) => {
    if (value !== defaultFilters[key]) {
      filterDiff.push(value ? key : `-${key}`);
    }
  });
  if (filterDiff.length > 0) {
    params.set('filters', filterDiff.join(','));
  }

  if (state.filterKanton.length > 0) params.set('kanton', state.filterKanton.join(','));
  if (state.filterConfidence.length > 0) params.set('confidence', state.filterConfidence.join(','));
  if (state.filterPortfolio.length > 0) params.set('portfolio', state.filterPortfolio.join(','));
  if (state.filterStatus.length > 0) params.set('status', state.filterStatus.join(','));
  if (state.filterAssignee.length > 0) params.set('assignee', state.filterAssignee.join(','));

  if (!tableVisible) params.set('table', '0');

  const newURL = `${window.location.pathname}?${params.toString()}`;
  if (replace) {
    window.history.replaceState({ ...state, tableVisible }, '', newURL);
  } else {
    window.history.pushState({ ...state, tableVisible }, '', newURL);
  }
}

export function parseURL() {
  const params = new URLSearchParams(window.location.search);

  const tab = params.get('tab');
  if (tab && ['karte', 'aufgaben', 'statistik', 'settings'].includes(tab)) {
    state.currentTab = tab;
  }

  const buildingId = params.get('id');
  if (buildingId) {
    state.selectedBuildingId = buildingId;
  }

  const filters = params.get('filters');
  if (filters) {
    filters.split(',').forEach(filter => {
      if (filter.startsWith('-')) {
        const key = filter.substring(1);
        if (state.activeFilters.hasOwnProperty(key)) {
          state.activeFilters[key] = false;
        }
      } else if (filter === 'myTasks') {
        state.activeFilters.myTasks = true;
      } else if (state.activeFilters.hasOwnProperty(filter)) {
        state.activeFilters[filter] = true;
      }
    });
  }

  const kantonParam = params.get('kanton');
  const confidenceParam = params.get('confidence');
  const portfolioParam = params.get('portfolio');
  const statusParam = params.get('status');
  const assigneeParam = params.get('assignee');
  state.filterKanton = kantonParam ? kantonParam.split(',') : [];
  state.filterConfidence = confidenceParam ? confidenceParam.split(',') : [];
  state.filterPortfolio = portfolioParam ? portfolioParam.split(',') : [];
  state.filterStatus = statusParam ? statusParam.split(',') : [];
  state.filterAssignee = assigneeParam ? assigneeParam.split(',') : [];

  return params.get('table') !== '0';
}

// ========================================
// Filtering
// ========================================
export function getFilteredBuildings() {
  let filtered = buildings;

  // Priority filters (if any selected, filter to those)
  const priorityFilters = ['high', 'medium', 'low'].filter(p => state.activeFilters[p]);
  if (priorityFilters.length > 0) {
    filtered = filtered.filter(b => priorityFilters.includes(b.priority));
  }

  // My tasks filter
  if (state.activeFilters.myTasks) {
    filtered = filtered.filter(b => b.assignee === currentUser);
  }

  // Kanton filter
  if (state.filterKanton.length > 0) {
    filtered = filtered.filter(b => state.filterKanton.includes(b.kanton));
  }

  // Confidence filter
  if (state.filterConfidence.length > 0) {
    filtered = filtered.filter(b => {
      const conf = b.confidence.total;
      return state.filterConfidence.some(range => {
        if (range === 'critical') return conf < 50;
        if (range === 'warning') return conf >= 50 && conf < 80;
        if (range === 'ok') return conf >= 80;
        return false;
      });
    });
  }

  // Portfolio filter
  if (state.filterPortfolio.length > 0) {
    filtered = filtered.filter(b => state.filterPortfolio.includes(b.portfolio));
  }

  // Status filter
  if (state.filterStatus.length > 0) {
    filtered = filtered.filter(b => state.filterStatus.includes(b.kanbanStatus));
  }

  // Assignee filter
  if (state.filterAssignee.length > 0) {
    filtered = filtered.filter(b => {
      // Empty string means "Nicht zugewiesen" (unassigned)
      if (state.filterAssignee.includes('')) {
        if (!b.assignee) return true;
      }
      return state.filterAssignee.includes(b.assignee);
    });
  }

  // Search query (with null safety for missing properties)
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(b =>
      (b.name?.toLowerCase() || '').includes(q) ||
      (b.id?.toLowerCase() || '').includes(q) ||
      (b.address?.toLowerCase() || '').includes(q) ||
      (b.kanton?.toLowerCase() || '').includes(q)
    );
  }

  return filtered;
}

export function toggleFilter(filterName, shouldUpdateURL = true) {
  if (filterName === 'my-tasks') {
    state.activeFilters.myTasks = !state.activeFilters.myTasks;
  } else if (state.activeFilters.hasOwnProperty(filterName)) {
    state.activeFilters[filterName] = !state.activeFilters[filterName];
  }

  document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    const name = chip.dataset.filter;
    if (name === 'my-tasks') {
      chip.classList.toggle('active', state.activeFilters.myTasks);
    } else if (state.activeFilters.hasOwnProperty(name)) {
      chip.classList.toggle('active', state.activeFilters[name]);
    }
  });

  if (shouldUpdateURL) {
    updateURL();
  }
}

// ========================================
// Multi-Select Filter Dropdowns
// ========================================
export function setupMultiSelectFilter(elementId, stateKey, onChange = null) {
  const container = document.getElementById(elementId);
  if (!container) return;

  const trigger = container.querySelector('.multi-select-trigger');
  const dropdown = container.querySelector('.multi-select-dropdown');
  const checkboxes = container.querySelectorAll('.multi-select-option input[type="checkbox"]');
  const countBadge = container.querySelector('.multi-select-count');

  if (!trigger) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.multi-select.open').forEach(el => {
      if (el !== container) el.classList.remove('open');
    });
    container.classList.toggle('open');
  });

  const updateSelection = () => {
    const selected = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    state[stateKey] = selected;

    if (countBadge) {
      countBadge.textContent = selected.length;
      countBadge.style.display = selected.length > 0 ? '' : 'none';
    }

    updateURL();

    // Call onChange callback if provided
    if (onChange) onChange();
  };

  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', updateSelection);
  });

  // Handle "All" and "None" action buttons
  const actionButtons = container.querySelectorAll('.multi-select-action');
  actionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      checkboxes.forEach(cb => {
        cb.checked = action === 'all';
      });
      updateSelection();
    });
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove('open');
    }
  });
}

export function applyMultiSelectState(elementId, selectedValues) {
  const container = document.getElementById(elementId);
  if (!container) return;

  const checkboxes = container.querySelectorAll('.multi-select-option input[type="checkbox"]');
  const countBadge = container.querySelector('.multi-select-count');

  checkboxes.forEach(cb => {
    cb.checked = selectedValues.includes(cb.value);
  });

  if (countBadge) {
    countBadge.textContent = selectedValues.length;
    countBadge.style.display = selectedValues.length > 0 ? '' : 'none';
  }
}

// ========================================
// Utility Functions
// ========================================
export function getTagLabel(tag) {
  const labels = {
    georef: 'GEOREF',
    sap: 'SAP',
    gwr: 'GWR',
    address: 'Adresse'
  };
  return labels[tag] || tag.toUpperCase();
}

export function getDataLabel(key) {
  const labels = {
    egid: 'EGID',
    address: 'Adresse',
    plz: 'PLZ',
    ort: 'Ort',
    coords: 'Koordinaten',
    buildingClass: 'Gebäudeklasse',
    area: 'Fläche'
  };
  return labels[key] || key;
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
  return date.toLocaleDateString('de-CH');
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) {
    return 'Heute';
  }
  if (dateOnly.getTime() === tomorrow.getTime()) {
    return 'Morgen';
  }

  // Format as "15. Feb 2026" for Swiss German locale
  return date.toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
