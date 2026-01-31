// ========================================
// Main Entry Point
// Initialization, data loading, event setup
// ========================================

import {
  state,
  buildings,
  setData,
  tableVisible,
  setTableVisible,
  parseURL,
  updateURL,
  toggleFilter,
  setupMultiSelectFilter,
  applyMultiSelectState
} from './state.js';

import {
  map,
  markers,
  initMap,
  updateMapMarkers,
  selectMarker,
  deselectAllMarkers,
  setupBasemapSelector,
  setupLayerWidget,
  setupLayerIdentify,
  setupLayerInfoButtons,
  setupContextMenu,
  setupMarkerClickHandlers
} from './map.js';

import {
  renderDetailPanel,
  enterEditMode,
  exitEditMode,
  submitComment,
  cancelComment,
  setupDetailPanelResize,
  setupAccordions,
  setCallbacks as setDetailPanelCallbacks
} from './detail-panel.js';

import {
  renderKanbanBoard,
  setupKanbanDragDrop,
  setCallbacks as setKanbanCallbacks
} from './kanban.js';

import {
  renderTableView,
  setupTableViewListeners,
  setupTableResize,
  setCallbacks as setTableCallbacks,
  resetTableState
} from './data-table.js';

import {
  updateCounts,
  updateStatistik
} from './statistics.js';

import { setupSearch, removeSearchMarker } from './search.js';

// ========================================
// Data Loading
// ========================================
async function loadData() {
  try {
    const [buildingsRes, usersRes, eventsRes, commentsRes, errorsRes, rulesRes] = await Promise.all([
      fetch('data/buildings.json'),
      fetch('data/users.json'),
      fetch('data/events.json'),
      fetch('data/comments.json'),
      fetch('data/errors.json'),
      fetch('data/rules.json')
    ]);

    const buildingsData = await buildingsRes.json();
    const usersData = await usersRes.json();
    const eventsData = await eventsRes.json();
    const commentsData = await commentsRes.json();
    const errorsData = await errorsRes.json();
    const rulesConfig = await rulesRes.json();

    // Enrich buildings with related data
    buildingsData.forEach(b => {
      b.errors = errorsData[b.id] || [];
      b.comments = commentsData[b.id] || [];
    });

    setData({
      buildings: buildingsData,
      teamMembers: usersData,
      eventsData,
      commentsData,
      errorsData,
      rulesConfig
    });

    console.log(`Loaded ${buildingsData.length} buildings, ${usersData.length} team members, ${Object.keys(eventsData).length} event sets, ${Object.keys(errorsData).length} error sets, ${Object.keys(commentsData).length} comment sets`);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// ========================================
// URL State Application
// ========================================
function applyURLState() {
  const shouldShowTable = parseURL();

  // Apply tab UI
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.currentTab);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${state.currentTab}`);
  });

  // Apply filters UI
  document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    const filterName = chip.dataset.filter;
    if (filterName === 'my-tasks') {
      chip.classList.toggle('active', state.activeFilters.myTasks);
    } else if (state.activeFilters.hasOwnProperty(filterName)) {
      chip.classList.toggle('active', state.activeFilters[filterName]);
    }
  });

  // Apply multi-select filter checkboxes
  applyMultiSelectState('filter-kanton', state.filterKanton);
  applyMultiSelectState('filter-confidence', state.filterConfidence);
  applyMultiSelectState('filter-portfolio', state.filterPortfolio);
  applyMultiSelectState('filter-assignee', state.filterAssignee);

  // Apply table visibility
  setTableVisible(shouldShowTable);
  document.getElementById('table-panel').classList.toggle('visible', tableVisible);
  document.getElementById('table-toggle-btn').classList.toggle('active', tableVisible);

  // Set initial URL state
  updateURL(true);
}

// ========================================
// Pop State Handler (Browser Back/Forward)
// ========================================
function handlePopState(event) {
  if (event.state) {
    state.currentTab = event.state.currentTab || 'karte';
    state.selectedBuildingId = event.state.selectedBuildingId || null;
    state.activeFilters = event.state.activeFilters || { high: false, medium: false, low: false, myTasks: false };
    state.filterKanton = event.state.filterKanton || [];
    state.filterConfidence = event.state.filterConfidence || [];
    state.filterPortfolio = event.state.filterPortfolio || [];
    state.filterAssignee = event.state.filterAssignee || [];
    setTableVisible(event.state.tableVisible !== undefined ? event.state.tableVisible : true);

    // Apply tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === state.currentTab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${state.currentTab}`);
    });

    // Update filter chips UI
    document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
      const filterName = chip.dataset.filter;
      if (filterName === 'my-tasks') {
        chip.classList.toggle('active', state.activeFilters.myTasks);
      } else if (state.activeFilters.hasOwnProperty(filterName)) {
        chip.classList.toggle('active', state.activeFilters[filterName]);
      }
    });

    // Update multi-select dropdowns
    applyMultiSelectState('filter-kanton', state.filterKanton);
    applyMultiSelectState('filter-confidence', state.filterConfidence);
    applyMultiSelectState('filter-portfolio', state.filterPortfolio);
    applyMultiSelectState('filter-assignee', state.filterAssignee);

    // Update table visibility
    document.getElementById('table-panel').classList.toggle('visible', tableVisible);
    document.getElementById('table-toggle-btn').classList.toggle('active', tableVisible);

    // Render views
    updateMapMarkers();
    updateCounts();

    if (state.selectedBuildingId) {
      const building = buildings.find(b => b.id === state.selectedBuildingId);
      if (building) {
        selectMarker(state.selectedBuildingId);
        renderDetailPanel(building);
      }
    } else {
      renderDetailPanel(null);
    }

    if (tableVisible) renderTableView();

    if (state.currentTab === 'karte') {
      setTimeout(() => map.resize(), 100);
    }
  }
}

// ========================================
// Tab Switching
// ========================================
function switchTab(tabId, shouldUpdateURL = true) {
  state.currentTab = tabId;

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  // Resize map if switching to karte tab
  if (tabId === 'karte' && map) {
    setTimeout(() => map.resize(), 100);
  }

  if (shouldUpdateURL) {
    updateURL();
  }
}

// ========================================
// Building Selection
// ========================================
function selectBuilding(id, shouldUpdateURL = true) {
  state.selectedBuildingId = id;
  const building = buildings.find(b => b.id === id);

  if (building) {
    // Update list selection
    document.querySelectorAll('.list-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === id);
    });

    // Update table selection
    document.querySelectorAll('.table-row').forEach(row => {
      row.classList.toggle('selected', row.dataset.id === id);
    });

    // Update map
    selectMarker(id);

    // Render detail panel
    renderDetailPanel(building);
  }

  if (shouldUpdateURL) {
    updateURL();
  }
}

function selectBuildingAndSwitch(id) {
  selectBuilding(id);
  switchTab('karte');
}

// ========================================
// Filter Application
// ========================================
function applyFilters(shouldUpdateURL = true) {
  updateMapMarkers();
  updateCounts();
  updateStatistik();
  renderKanbanBoard();

  // Reset table pagination when global filters change
  resetTableState();

  if (tableVisible) {
    renderTableView();
  }

  if (shouldUpdateURL) {
    updateURL();
  }
}

// ========================================
// Search (handled by search.js module)
// ========================================

// ========================================
// Filter Toggle
// ========================================
function setupFilterToggle() {
  const filterToggle = document.getElementById('filter-toggle');
  const filterBar = document.getElementById('filter-bar');
  const filterReset = document.getElementById('filter-reset');
  let filterBarVisible = true;

  filterToggle.addEventListener('click', () => {
    filterBarVisible = !filterBarVisible;
    filterBar.classList.toggle('hidden', !filterBarVisible);
    filterToggle.classList.toggle('active', filterBarVisible);
  });

  filterReset.addEventListener('click', () => {
    state.activeFilters = { high: false, medium: false, low: false, myTasks: false };
    state.filterKanton = [];
    state.filterConfidence = [];
    state.filterPortfolio = [];
    state.filterAssignee = [];

    // Clear location search
    document.getElementById('globalSearch').value = '';
    removeSearchMarker();

    document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
      chip.classList.remove('active');
    });

    applyMultiSelectState('filter-kanton', []);
    applyMultiSelectState('filter-confidence', []);
    applyMultiSelectState('filter-portfolio', []);
    applyMultiSelectState('filter-assignee', []);

    applyFilters();
  });
}

// ========================================
// Modal Functions
// ========================================
function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

// ========================================
// Rules Display
// ========================================
function renderRules() {
  const container = document.getElementById('rules-container');
  const rulesConfig = window.rulesConfig;

  if (!container || !rulesConfig) {
    if (container) container.innerHTML = '<div class="rules-empty">Keine Regeln verfügbar</div>';
    return;
  }

  const severityLabels = rulesConfig.severityLevels || {
    error: { label: 'Fehler', priority: 1 },
    warning: { label: 'Warnung', priority: 2 },
    info: { label: 'Hinweis', priority: 3 }
  };

  const html = rulesConfig.ruleSets.map(ruleSet => {
    const rulesHtml = ruleSet.rules.map(rule => {
      const severityInfo = severityLabels[rule.severity] || { label: rule.severity };
      return `
        <div class="rule-item">
          <span class="rule-severity ${rule.severity}"></span>
          <div class="rule-details">
            <div class="rule-header">
              <span class="rule-name">${rule.name}</span>
              <span class="rule-id">${rule.id}</span>
            </div>
            <p class="rule-description">${rule.description}</p>
            <div class="rule-meta">
              <span class="rule-tag">${Array.isArray(rule.attribute) ? rule.attribute.join(', ') : rule.attribute}</span>
              <span class="rule-tag">${rule.operator}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const enabledStatus = ruleSet.enabled ? 'Aktiv' : 'Inaktiv';
    const enabledClass = ruleSet.enabled ? 'enabled' : 'disabled';

    return `
      <div class="rule-set" data-ruleset-id="${ruleSet.id}">
        <button class="rule-set-header" type="button">
          <div class="rule-set-info">
            <span class="rule-set-name">${ruleSet.name}</span>
            <span class="rule-set-count">${ruleSet.rules.length} Regeln</span>
            <span class="rule-set-status ${enabledClass}">${enabledStatus}</span>
          </div>
          <i data-lucide="chevron-down" class="icon-sm rule-set-chevron"></i>
        </button>
        <div class="rule-set-content">
          <p class="rule-set-description">${ruleSet.description}</p>
          <div class="rules-list">
            ${rulesHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  if (typeof lucide !== 'undefined') lucide.createIcons();

  container.querySelectorAll('.rule-set-header').forEach(header => {
    header.addEventListener('click', () => {
      const ruleSet = header.closest('.rule-set');
      ruleSet.classList.toggle('expanded');
    });
  });
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  import('./state.js').then(mod => {
    const users = mod.teamMembers;
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-message">Keine Benutzer vorhanden</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(user => `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-small">${user.initials}</div>
            <span>${user.name}</span>
          </div>
        </td>
        <td>${user.role}</td>
        <td><span class="user-status active">Aktiv</span></td>
        <td>
          <button class="action-btn-icon" title="Bearbeiten">
            <i data-lucide="pencil" class="icon-sm"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}

function setupRunChecksButton() {
  const runBtn = document.getElementById('run-all-checks');
  const lastCheckEl = document.getElementById('last-check-time');

  if (runBtn) {
    runBtn.addEventListener('click', () => {
      alert('Prüfung wird gestartet. Die Ergebnisse werden in Kürze angezeigt.');

      // Update last check timestamp
      if (lastCheckEl) {
        const now = new Date();
        const formatted = now.toLocaleDateString('de-CH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) + ', ' + now.toLocaleTimeString('de-CH', {
          hour: '2-digit',
          minute: '2-digit'
        });
        lastCheckEl.textContent = formatted;
      }
    });
  }
}

// ========================================
// Main Event Listeners
// ========================================
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Detail panel close button
  document.getElementById('detail-close-btn').addEventListener('click', () => {
    if (state.editMode) {
      exitEditMode(false);
    }
    state.selectedBuildingId = null;
    renderDetailPanel(null);
    deselectAllMarkers();
    updateURL();
  });

  // Filter chips
  document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleFilter(chip.dataset.filter);
      applyFilters();
    });
  });

  // Multi-select filter dropdowns
  setupMultiSelectFilter('filter-kanton', 'filterKanton');
  setupMultiSelectFilter('filter-confidence', 'filterConfidence');
  setupMultiSelectFilter('filter-portfolio', 'filterPortfolio');
  setupMultiSelectFilter('filter-assignee', 'filterAssignee');

  // Correct button
  document.getElementById('btn-correct').addEventListener('click', enterEditMode);

  // Edit cancel button
  document.getElementById('btn-edit-cancel').addEventListener('click', () => exitEditMode(false));

  // Edit save button
  document.getElementById('btn-edit-save').addEventListener('click', () => exitEditMode(true));

  // Global search
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    filterBySearch(e.target.value);
  });

  // Close modals on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        modal.classList.remove('active');
      });
    }
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Comment handlers
  document.getElementById('btn-submit-comment').addEventListener('click', submitComment);
  document.getElementById('btn-cancel-comment').addEventListener('click', cancelComment);
  document.getElementById('comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submitComment();
    }
  });
}

// ========================================
// Module Callbacks Setup
// ========================================
function setupModuleCallbacks() {
  // Detail panel callbacks
  setDetailPanelCallbacks({
    onStatusChange: () => {
      renderKanbanBoard();
      if (tableVisible) renderTableView();
      updateCounts();
      updateStatistik();
    },
    onAssigneeChange: () => {
      renderKanbanBoard();
      if (tableVisible) renderTableView();
      updateCounts();
    },
    onDataChange: () => {
      if (tableVisible) renderTableView();
      updateStatistik();
    }
  });

  // Kanban callbacks
  setKanbanCallbacks({
    onSelectBuilding: selectBuildingAndSwitch,
    onDataChange: () => {
      if (tableVisible) renderTableView();
    }
  });

  // Table callbacks
  setTableCallbacks({
    onSelectBuilding: selectBuilding
  });
}

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Load data
  await loadData();

  // Store rulesConfig globally for renderRules and render settings tab content
  import('./state.js').then(mod => {
    window.rulesConfig = mod.rulesConfig;
    renderRules();
    renderUsersTable();
  });

  // Initialize map
  initMap();

  // Setup module callbacks
  setupModuleCallbacks();

  // Setup marker click handlers
  setupMarkerClickHandlers(selectBuilding);

  // Parse URL and apply initial state
  applyURLState();

  // Render initial views
  renderKanbanBoard();
  setupKanbanDragDrop();

  // Setup all event listeners and UI components
  setupEventListeners();
  setupTableViewListeners();
  setupSearch();
  setupFilterToggle();
  setupTableResize();
  setupDetailPanelResize();
  setupBasemapSelector();
  setupLayerWidget();
  setupLayerIdentify();
  setupLayerInfoButtons();
  setupContextMenu();
  setupAccordions();
  setupRunChecksButton();

  // Update counts and statistics
  updateCounts();
  updateStatistik();

  // Apply building selection from URL
  if (state.selectedBuildingId) {
    selectBuilding(state.selectedBuildingId, false);
  }

  // Render table if visible
  if (tableVisible) renderTableView();

  // Listen for browser back/forward
  window.addEventListener('popstate', handlePopState);

  // Expose functions for inline onclick handlers
  window.openModal = openModal;
  window.closeModal = closeModal;
});
