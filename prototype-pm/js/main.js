// ========================================
// Main Entry Point
// Initialization, data loading, event setup
// ========================================

import {
  state,
  buildings,
  teamMembers,
  setData,
  getFilteredBuildings,
  tableVisible,
  setTableVisible,
  parseURL,
  updateURL,
  toggleFilter,
  setupMultiSelectFilter,
  applyMultiSelectState,
  populateMultiSelectOptions,
  getFieldDisplayValue,
  setSearchQuery,
  setCurrentUser,
  rulesConfig,
  escapeHtml
} from './state.js';

// Data layer (static JSON in demo mode)
import {
  loadAllData as loadDataFromSupabase,
  fetchErrorsForExport,
  fetchEventsForExport,
  updateUserRole,
  removeUser
} from './supabase.js';

import {
  initAuth,
  setupLoginForm,
  setupUserDropdown,
  updateUIForAuthState
} from './auth.js';

import {
  map,
  initMap,
  updateMapMarkers,
  recreateMarkers,
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
  setupFieldToggle,
  setupImageWidget,
  setCallbacks as setDetailPanelCallbacks
} from './detail-panel.js';

import {
  renderKanbanBoard,
  setupKanbanDragDrop,
  setCallbacks as setKanbanCallbacks,
  updateKanbanSelection
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
  updateStatistik,
  setChartFilterCallback,
  clearChartFilters
} from './statistics.js';

import { setupSearch, removeSearchMarker } from './search.js';
import { scheduleLucideRefresh } from './icons.js';
import { ensureXLSX } from './xlsx-loader.js';

// ========================================
// Tab UI Helper
// ========================================
function updateTabUI(tabId) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  // Toggle page-scroll mode for non-map tabs
  const pageScrollTabs = ['statistik', 'aufgaben', 'settings', 'api'];
  document.body.classList.toggle('page-scroll-tab', pageScrollTabs.includes(tabId));
}

// ========================================
// Data Loading
// ========================================

let _loadDataPromise = null;

async function loadData() {
  // Re-entrancy guard: if a load is already in flight, return the same promise
  if (_loadDataPromise) return _loadDataPromise;

  _loadDataPromise = (async () => {
    try {
      const data = await loadDataFromSupabase();
      setData(data);
      populateFilterDropdowns();
    } catch (error) {
      console.error('Data loading error:', error);
      showAppError('Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.');
    } finally {
      _loadDataPromise = null;
    }
  })();

  return _loadDataPromise;
}

// ========================================
// Dynamic Filter Population
// ========================================

function populateFilterDropdowns() {
  // Status labels and order (workflow sequence)
  const STATUS_ORDER = ['backlog', 'inprogress', 'clarification', 'done'];
  const STATUS_LABELS = {
    backlog: 'Offen',
    inprogress: 'In Bearbeitung',
    clarification: 'Rückfrage',
    done: 'Erledigt'
  };

  // Confidence class definitions
  const CONFIDENCE_CLASSES = [
    { value: 'critical', label: 'Kritisch', title: 'Konfidenz unter 50%' },
    { value: 'warning', label: 'Warnung', title: 'Konfidenz 50–80%' },
    { value: 'ok', label: 'OK', title: 'Konfidenz über 80%' }
  ];

  // --- Kanton ---
  const kantonValues = [...new Set(
    buildings.map(b => getFieldDisplayValue(b.kanton)).filter(Boolean)
  )].sort();
  populateMultiSelectOptions('filter-kanton', kantonValues.map(v => ({ value: v, label: v })));

  // --- Portfolio ---
  const portfolioValues = [...new Set(
    buildings.map(b => b.portfolio).filter(Boolean)
  )].sort();
  populateMultiSelectOptions('filter-portfolio', portfolioValues.map(v => ({ value: v, label: v })));

  // --- Status (fixed workflow order) ---
  const statusPresent = new Set(buildings.map(b => b.kanbanStatus).filter(Boolean));
  const statusOptions = STATUS_ORDER
    .filter(s => statusPresent.has(s))
    .map(s => ({ value: s, label: STATUS_LABELS[s] || s }));
  populateMultiSelectOptions('filter-status', statusOptions);

  // --- Confidence (only classes present in data) ---
  const confClasses = new Set(buildings.map(b => {
    const conf = b.confidence?.total;
    if (conf == null) return null;
    if (conf < 50) return 'critical';
    if (conf < 80) return 'warning';
    return 'ok';
  }).filter(Boolean));
  const confOptions = CONFIDENCE_CLASSES.filter(c => confClasses.has(c.value));
  populateMultiSelectOptions('filter-confidence', confOptions);

  // --- Assignee ---
  const assigneeNames = [...new Set(
    buildings.map(b => b.assignee).filter(Boolean)
  )].sort();
  const assigneeOptions = [
    { value: '', label: 'Nicht zugewiesen' },
    ...assigneeNames.map(name => ({ value: name, label: name }))
  ];
  populateMultiSelectOptions('filter-assignee', assigneeOptions);
}

// ========================================
// App State (Login/App visibility)
// ========================================

function showLoginLanding() {
  document.getElementById('login-landing')?.classList.add('visible');
  document.getElementById('app-container')?.classList.remove('visible');
}

function showApp() {
  document.getElementById('login-landing')?.classList.remove('visible');
  document.getElementById('app-container')?.classList.add('visible');
}

function showAppError(message) {
  const errorEl = document.getElementById('app-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

function hideAppError() {
  const errorEl = document.getElementById('app-error');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}

// ========================================
// URL State Application
// ========================================
function applyURLState() {
  const shouldShowTable = parseURL();

  // Apply tab UI
  updateTabUI(state.currentTab);

  // Lazy-load API tab if navigated to directly via URL
  if (state.currentTab === 'api') {
    initAPITab();
  }

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
  applyMultiSelectState('filter-status', state.filterStatus);
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
    state.filterStatus = event.state.filterStatus || [];
    state.filterAssignee = event.state.filterAssignee || [];
    setTableVisible(event.state.tableVisible !== undefined ? event.state.tableVisible : true);

    // Apply tab
    updateTabUI(state.currentTab);

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
    applyMultiSelectState('filter-status', state.filterStatus);
    applyMultiSelectState('filter-assignee', state.filterAssignee);

    // Update table visibility
    document.getElementById('table-panel').classList.toggle('visible', tableVisible);
    document.getElementById('table-toggle-btn').classList.toggle('active', tableVisible);

    // Render views
    const filtered = getFilteredBuildings();
    updateMapMarkers(filtered);
    updateCounts(filtered);

    if (state.selectedBuildingId) {
      const building = buildings.find(b => b.id === state.selectedBuildingId);
      if (building) {
        selectMarker(state.selectedBuildingId);
        renderDetailPanel(building);
      }
    } else {
      renderDetailPanel(null);
    }

    if (tableVisible) renderTableView(filtered);

    if (state.currentTab === 'karte') {
      setTimeout(() => map.resize(), 100);
    } else if (state.currentTab === 'api') {
      initAPITab();
    }
  }
}

// ========================================
// Validation (Demo: no-op)
// ========================================
async function checkSingleBuilding(buildingId) {
  console.log(`[Demo] Check single building: ${buildingId} — no-op`);
  return null;
}

// ========================================
// API Tab (Demo: static message)
// ========================================
let apiLoaded = false;

function initAPITab() {
  if (apiLoaded) return;

  const loading = document.getElementById('api-loading');
  if (loading) {
    loading.innerHTML = `
      <i data-lucide="info" class="icon-lg"></i>
      <p>API-Dokumentation ist im Demo-Modus nicht verfügbar.</p>
      <p style="font-size: var(--font-sm); color: var(--text-muted)">Die Rule-Engine API benötigt eine aktive Supabase-Instanz.</p>`;
    scheduleLucideRefresh();
  }
  apiLoaded = true;
}

// ========================================
// Tab Switching
// ========================================
function switchTab(tabId, shouldUpdateURL = true) {
  state.currentTab = tabId;

  updateTabUI(tabId);

  // Reset scroll position when switching tabs
  const pageScrollTabs = ['statistik', 'aufgaben', 'settings', 'api'];
  if (pageScrollTabs.includes(tabId)) {
    window.scrollTo(0, 0);
  }

  // Detail panel visibility: show only on karte and aufgaben tabs
  const detailPanel = document.getElementById('detail-panel');
  const showDetailPanel = ['karte', 'aufgaben'].includes(tabId) && state.selectedBuildingId;
  if (detailPanel) {
    detailPanel.classList.toggle('visible', showDetailPanel);
  }

  // Resize map if switching to karte tab
  if (tabId === 'karte' && map) {
    setTimeout(() => map.resize(), 100);
  }

  // Lazy-load API iframe on first visit
  if (tabId === 'api') {
    initAPITab();
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

    // Update kanban selection
    updateKanbanSelection(id);

    // Update map
    selectMarker(id);

    // Render detail panel
    renderDetailPanel(building);
  }

  if (shouldUpdateURL) {
    updateURL();
  }
}

// ========================================
// Filter Application
// ========================================
function applyFilters(shouldUpdateURL = true) {
  const filtered = getFilteredBuildings();
  updateMapMarkers(filtered);
  updateCounts(filtered);
  updateStatistik(filtered);
  renderKanbanBoard(filtered);

  // Reset table pagination when global filters change
  resetTableState();

  if (tableVisible) {
    renderTableView(filtered);
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
    state.filterStatus = [];
    state.filterAssignee = [];

    // Clear location search
    document.getElementById('globalSearch').value = '';
    removeSearchMarker();

    // Clear chart filters
    clearChartFilters();

    document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
      chip.classList.remove('active');
    });

    applyMultiSelectState('filter-kanton', []);
    applyMultiSelectState('filter-confidence', []);
    applyMultiSelectState('filter-portfolio', []);
    applyMultiSelectState('filter-status', []);
    applyMultiSelectState('filter-assignee', []);

    applyFilters();
  });
}

// ========================================
// Rules Display
// ========================================
function renderRules() {
  const container = document.getElementById('rules-container');

  if (!container || !rulesConfig) {
    if (container) container.innerHTML = '<div class="rules-empty">Keine Regeln verfügbar</div>';
    return;
  }

  const severityLabels = rulesConfig.severityLevels || {
    error: { label: 'Fehler', priority: 1 },
    warning: { label: 'Warnung', priority: 2 },
    info: { label: 'Hinweis', priority: 3 }
  };

  const operatorLabels = rulesConfig.operators || {};

  // Summary counts
  const totalRules = rulesConfig.ruleSets.reduce((sum, rs) => sum + rs.rules.length, 0);
  const activeSets = rulesConfig.ruleSets.filter(rs => rs.enabled).length;

  const html = rulesConfig.ruleSets.map(ruleSet => {
    const rulesHtml = ruleSet.rules.map(rule => {
      const sev = severityLabels[rule.severity] || { label: rule.severity };
      const fieldDisplay = Array.isArray(rule.attribute) ? rule.attribute.join(', ') : (rule.attribute || '—');
      const operatorDisplay = operatorLabels[rule.operator] || rule.operator;
      return `
        <tr class="rules-table-row">
          <td class="rules-table-cell rules-table-id">${escapeHtml(rule.id)}</td>
          <td class="rules-table-cell">
            <span class="rule-name">${escapeHtml(rule.name)}</span>
            <span class="rule-description">${escapeHtml(rule.description)}</span>
          </td>
          <td class="rules-table-cell"><code class="rule-field">${escapeHtml(fieldDisplay)}</code></td>
          <td class="rules-table-cell">${escapeHtml(operatorDisplay)}</td>
          <td class="rules-table-cell">${escapeHtml(sev.label)}</td>
          <td class="rules-table-cell">${escapeHtml(rule.message || '')}</td>
        </tr>
      `;
    }).join('');

    const enabledStatus = ruleSet.enabled ? 'Aktiv' : 'Inaktiv';
    const enabledClass = ruleSet.enabled ? 'enabled' : 'disabled';

    return `
      <div class="rule-set" data-ruleset-id="${escapeHtml(ruleSet.id)}">
        <button class="rule-set-header" type="button">
          <div class="rule-set-info">
            <span class="rule-set-name">${escapeHtml(ruleSet.name)}</span>
            <span class="rule-set-count">${ruleSet.rules.length} Regeln</span>
            <span class="rule-set-status ${enabledClass}">${enabledStatus}</span>
          </div>
          <i data-lucide="chevron-down" class="icon-sm rule-set-chevron"></i>
        </button>
        <div class="rule-set-content">
          <p class="rule-set-description">${escapeHtml(ruleSet.description)}</p>
          <table class="rules-table">
            <colgroup>
              <col class="col-id">
              <col class="col-regel">
              <col class="col-feld">
              <col class="col-operator">
              <col class="col-stufe">
              <col class="col-meldung">
            </colgroup>
            <thead>
              <tr>
                <th>ID</th>
                <th>Regel</th>
                <th>Feld</th>
                <th>Operator</th>
                <th>Stufe</th>
                <th>Meldung</th>
              </tr>
            </thead>
            <tbody>
              ${rulesHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="rules-summary">
      <span>${totalRules} Regeln</span>
      <span class="rules-summary-sep"></span>
      <span>${rulesConfig.ruleSets.length} Regelsets</span>
      <span class="rules-summary-sep"></span>
      <span>${activeSets} aktiv</span>
    </div>
    ${html}
  `;

  scheduleLucideRefresh();

  container.querySelectorAll('.rule-set-header').forEach(header => {
    header.addEventListener('click', () => {
      const ruleSet = header.closest('.rule-set');
      ruleSet.classList.toggle('expanded');
    });
  });
}

// User management edit mode state
let usersEditMode = false;

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  const thead = document.querySelector('.users-table thead tr');
  if (!tbody) return;

  // Update header based on edit mode
  if (thead) {
    thead.innerHTML = usersEditMode
      ? `<th>Benutzer</th><th>Rolle</th><th>Letzter Login</th><th></th>`
      : `<th>Benutzer</th><th>Rolle</th><th>Letzter Login</th>`;
  }

  import('./state.js').then(mod => {
    const users = mod.teamMembers;
    const colSpan = usersEditMode ? 4 : 3;
    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-message">Keine Benutzer vorhanden</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const loginDate = user.lastLogin ? new Date(user.lastLogin) : null;
      const formattedLogin = loginDate
        ? loginDate.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

      // Role cell - either static text or dropdown
      const roleCell = usersEditMode
        ? `<select class="user-role-select" data-user-id="${user.id}">
            <option value="Leser" ${user.role === 'Leser' ? 'selected' : ''}>Leser</option>
            <option value="Bearbeiter" ${user.role === 'Bearbeiter' ? 'selected' : ''}>Bearbeiter</option>
            <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>`
        : user.role;

      // Actions cell - only in edit mode
      const actionsCell = usersEditMode
        ? `<td class="user-actions">
            <button class="btn btn-ghost btn-sm btn-remove-user" data-user-id="${user.id}" title="Entfernen">
              <i data-lucide="trash-2" class="icon-sm"></i>
            </button>
          </td>`
        : '';

      return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-small">${escapeHtml(user.initials)}</div>
            <span>${escapeHtml(user.name)}</span>
          </div>
        </td>
        <td>${roleCell}</td>
        <td class="user-last-login">${formattedLogin}</td>
        ${actionsCell}
      </tr>
    `}).join('');

    scheduleLucideRefresh();

    // Attach event handlers in edit mode
    if (usersEditMode) {
      // Role change handlers
      tbody.querySelectorAll('.user-role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
          const userId = parseInt(e.target.dataset.userId);
          const newRole = e.target.value;
          try {
            await updateUserRole(userId, newRole);
            // Update local state
            const user = users.find(u => u.id === userId);
            if (user) user.role = newRole;
          } catch (error) {
            console.error('Error updating role:', error);
            alert('Fehler beim Aktualisieren der Rolle');
            renderUsersTable(); // Reset to previous state
          }
        });
      });

      // Remove user handlers
      tbody.querySelectorAll('.btn-remove-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const userId = parseInt(e.currentTarget.dataset.userId);
          const user = users.find(u => u.id === userId);
          if (!user) return;

          if (confirm(`Benutzer "${user.name}" wirklich entfernen?`)) {
            try {
              await removeUser(userId);
              // Reload data and re-render
              await loadData();
              renderUsersTable();
            } catch (error) {
              console.error('Error removing user:', error);
              alert('Fehler beim Entfernen des Benutzers');
            }
          }
        });
      });
    }
  });
}

function setupUserEditButton() {
  const editBtn = document.getElementById('btn-edit-users');
  if (!editBtn) return;

  editBtn.addEventListener('click', () => {
    usersEditMode = !usersEditMode;

    // Update button appearance
    if (usersEditMode) {
      editBtn.innerHTML = '<i data-lucide="check" class="icon-sm"></i> Fertig';
      editBtn.classList.add('active');
    } else {
      editBtn.innerHTML = '<i data-lucide="pencil" class="icon-sm"></i> Bearbeiten';
      editBtn.classList.remove('active');
    }

    scheduleLucideRefresh();
    renderUsersTable();
  });
}

function setupRunChecksButton() {
  const runBtn = document.getElementById('run-all-checks');
  if (!runBtn) return;

  runBtn.addEventListener('click', () => {
    alert('Demo-Modus: Prüfungen benötigen eine aktive Rule-Engine.');
  });
}

/** Format current timestamp in Swiss locale */
function formatNowSwiss() {
  const now = new Date();
  return now.toLocaleDateString('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }) + ', ' + now.toLocaleTimeString('de-CH', {
    hour: '2-digit', minute: '2-digit'
  });
}

function setupGwrEnrichButton() {
  const runBtn = document.getElementById('run-gwr-enrich');
  if (!runBtn) return;

  runBtn.addEventListener('click', () => {
    alert('Demo-Modus: GWR-Aktualisierung benötigt eine aktive Datenbankverbindung.');
  });
}

// ========================================
// Main Event Listeners
// ========================================
function setupEventListeners() {
  // Logo → default view
  document.querySelector('.logo')?.addEventListener('click', () => switchTab('karte'));

  // Tab switching
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Footer API link
  document.getElementById('footer-api-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('api');
  });

  // Detail panel close button
  document.getElementById('detail-close-btn').addEventListener('click', () => {
    if (state.editMode) {
      exitEditMode(false);
    }
    state.selectedBuildingId = null;
    renderDetailPanel(null);
    deselectAllMarkers();
    updateKanbanSelection(null);  // Clear kanban selection
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
  setupMultiSelectFilter('filter-kanton', 'filterKanton', applyFilters);
  setupMultiSelectFilter('filter-confidence', 'filterConfidence', applyFilters);
  setupMultiSelectFilter('filter-portfolio', 'filterPortfolio', applyFilters);
  setupMultiSelectFilter('filter-status', 'filterStatus', applyFilters);
  setupMultiSelectFilter('filter-assignee', 'filterAssignee', applyFilters);

  // Correct button
  document.getElementById('btn-correct').addEventListener('click', enterEditMode);

  // Edit cancel button
  document.getElementById('btn-edit-cancel').addEventListener('click', () => exitEditMode(false));

  // Edit save button
  document.getElementById('btn-edit-save').addEventListener('click', () => exitEditMode(true));

  // Global search
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    setSearchQuery(e.target.value);
    applyFilters();
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

  // Export handlers
  const exportErrorsBtn = document.getElementById('export-errors');
  if (exportErrorsBtn) {
    exportErrorsBtn.addEventListener('click', exportErrorsReport);
  }

  const exportEventsBtn = document.getElementById('export-events');
  if (exportEventsBtn) {
    exportEventsBtn.addEventListener('click', exportEventsReport);
  }

  const pruefplanBtn = document.getElementById('download-pruefplan');
  if (pruefplanBtn) {
    pruefplanBtn.addEventListener('click', exportPruefplanCSV);
  }
}

// ========================================
// Excel Export Functions (SheetJS)
// ========================================

/**
 * Download an array-of-arrays as an .xlsx file using SheetJS (lazy-loaded)
 */
async function downloadXLSX(filename, sheetData, sheetName) {
  await ensureXLSX();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Daten');
  XLSX.writeFile(wb, filename);
}

/**
 * Export errors report as Excel
 * Authenticated: fresh query from Supabase | Demo: in-memory JSON data
 */
async function exportErrorsReport() {
  const btn = document.getElementById('export-errors');
  const item = btn?.closest('.workflow-item');
  const progressEl = document.getElementById('progress-export-errors');
  const progressFill = progressEl?.querySelector('.workflow-progress-fill');
  const progressText = progressEl?.querySelector('.workflow-progress-text');

  function setRunning(running) {
    if (btn) {
      btn.disabled = running;
      if (running) {
        btn.innerHTML = '<span class="spinner"></span> Exportieren...';
      } else {
        btn.innerHTML = '<i data-lucide="download" class="icon-sm"></i>\n                  Exportieren';
        scheduleLucideRefresh();
      }
    }
    if (item) item.classList.toggle('running', running);
    if (progressEl) progressEl.hidden = !running;
  }

  function updateProgress(loaded, total) {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${loaded.toLocaleString('de-CH')} / ${total.toLocaleString('de-CH')} Fehler geladen (${pct}%)`;
  }

  setRunning(true);
  updateProgress(0, 0);

  try {
    let buildingMap = {};

    console.group('📊 Fehlerbericht Export');
    console.log('Fetching errors with pagination...');
    const { errors: sourceErrors, buildings: buildingsList } = await fetchErrorsForExport((loaded, total) => {
      updateProgress(loaded, total);
      console.log(`  Loaded ${loaded} / ${total} errors`);
    });
    buildingsList.forEach(b => { buildingMap[b.id] = b; });
    console.log('All errors fetched, building Excel file...');

    const rows = [];
    for (const buildingId in sourceErrors) {
      const buildingErrors = sourceErrors[buildingId];
      const building = buildingMap[buildingId];
      const buildingName = building ? building.name : '';

      if (Array.isArray(buildingErrors)) {
        buildingErrors.forEach(error => {
          rows.push([
            buildingId,
            buildingName,
            error.check_id || error.checkId || '',
            error.description || '',
            error.level || ''
          ]);
        });
      }
    }

    if (rows.length === 0) {
      alert('Keine Fehler zum Exportieren vorhanden.');
      console.log('No errors to export.');
      console.groupEnd();
      return;
    }

    const headers = ['Gebäude-ID', 'Gebäudename', 'Prüf-ID', 'Beschreibung', 'Stufe'];
    const timestamp = new Date().toISOString().slice(0, 10);
    await downloadXLSX(`Fehlerbericht_${timestamp}.xlsx`, [headers, ...rows], 'Fehlerbericht');

    console.log(`Export complete: ${rows.length.toLocaleString('de-CH')} rows written.`);
    console.groupEnd();

    // Update last run timestamp
    const timestampEl = document.getElementById('workflow-errors-time');
    if (timestampEl) timestampEl.textContent = formatNowSwiss();
  } catch (error) {
    console.error('Error exporting errors report:', error);
    console.groupEnd?.();
    alert('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
  } finally {
    setRunning(false);
  }
}

/**
 * Export events report as Excel
 * Authenticated: fresh query from Supabase | Demo: in-memory JSON data
 */
async function exportEventsReport() {
  const btn = document.getElementById('export-events');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Exportieren...';
  }

  try {
    const sourceEvents = await fetchEventsForExport();

    if (!Array.isArray(sourceEvents) || sourceEvents.length === 0) {
      alert('Keine Ereignisse zum Exportieren vorhanden.');
      return;
    }

    const headers = ['ID', 'Gebäude-ID', 'Typ', 'Aktion', 'Benutzer', 'Zeitstempel', 'Details'];
    const rows = sourceEvents.map(event => [
      event.id || '',
      event.buildingId || event.building_id || '',
      event.type || '',
      event.action || '',
      event.user || event.user_name || '',
      event.timestamp
        ? new Date(event.timestamp).toLocaleString('de-CH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '',
      event.details || ''
    ]);

    const timestamp = new Date().toISOString().slice(0, 10);
    await downloadXLSX(`Ereignisse_${timestamp}.xlsx`, [headers, ...rows], 'Ereignisse');

    // Update last run timestamp
    const timestampEl = document.getElementById('workflow-events-time');
    if (timestampEl) {
      const now = new Date();
      timestampEl.textContent = now.toLocaleString('de-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', ',');
    }
  } catch (error) {
    console.error('Error exporting events report:', error);
    alert('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download" class="icon-sm"></i>\n                  Exportieren';
      scheduleLucideRefresh();
    }
  }
}

/**
 * Export Prüfplan (rules) as Excel
 */
async function exportPruefplanCSV() {
  if (!rulesConfig || !rulesConfig.ruleSets) {
    alert('Keine Regeln zum Exportieren vorhanden.');
    return;
  }

  const operatorLabels = rulesConfig.operators || {};
  const severityLabels = rulesConfig.severityLevels || {};

  const headers = ['Regelset', 'ID', 'Name', 'Beschreibung', 'Feld', 'Operator', 'Wert', 'Stufe', 'Meldung'];
  const rows = [];

  rulesConfig.ruleSets.forEach(ruleSet => {
    ruleSet.rules.forEach(rule => {
      rows.push([
        ruleSet.name,
        rule.id,
        rule.name,
        rule.description,
        Array.isArray(rule.attribute) ? rule.attribute.join(', ') : (rule.attribute || ''),
        operatorLabels[rule.operator] || rule.operator,
        rule.value != null ? `${rule.value}${rule.unit ? ' ' + rule.unit : ''}` : '',
        severityLabels[rule.severity]?.label || rule.severity,
        rule.message || ''
      ]);
    });
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  await downloadXLSX(`Pruefplan_${timestamp}.xlsx`, [headers, ...rows], 'Prüfplan');
}

// ========================================
// Module Callbacks Setup
// ========================================
function setupModuleCallbacks() {
  // Detail panel callbacks
  setDetailPanelCallbacks({
    onStatusChange: () => {
      const filtered = getFilteredBuildings();
      renderKanbanBoard(filtered);
      if (tableVisible) renderTableView(filtered);
      updateCounts(filtered);
      updateStatistik(filtered);
    },
    onAssigneeChange: () => {
      const filtered = getFilteredBuildings();
      renderKanbanBoard(filtered);
      if (tableVisible) renderTableView(filtered);
      updateCounts(filtered);
    },
    onPriorityChange: () => {
      const filtered = getFilteredBuildings();
      renderKanbanBoard(filtered);
      if (tableVisible) renderTableView(filtered);
      updateCounts(filtered);
    },
    onDueDateChange: () => {
      const filtered = getFilteredBuildings();
      renderKanbanBoard(filtered);
      if (tableVisible) renderTableView(filtered);
      updateStatistik(filtered);
    },
    onDataChange: () => {
      const filtered = getFilteredBuildings();
      updateMapMarkers(filtered);
      renderKanbanBoard(filtered);
      if (tableVisible) renderTableView(filtered);
      updateCounts(filtered);
      updateStatistik(filtered);
    },
    onCheckBuilding: checkSingleBuilding
  });

  // Kanban callbacks
  setKanbanCallbacks({
    onSelectBuilding: selectBuilding,  // No longer switches tab
    onDataChange: () => {
      const filtered = getFilteredBuildings();
      if (tableVisible) renderTableView(filtered);
    }
  });

  // Table callbacks
  setTableCallbacks({
    onSelectBuilding: selectBuilding
  });
}

// ========================================
// Demo Mode Entry
// ========================================
async function enterDemoMode() {
  const user = await initAuth();
  setCurrentUser(user.name);
  showApp();
  hideAppError();

  await loadData();

  updateUIForAuthState();
  scheduleLucideRefresh();

  recreateMarkers(selectBuilding);

  const filtered = getFilteredBuildings();
  updateCounts(filtered);
  updateStatistik(filtered);
  renderKanbanBoard(filtered);
  if (tableVisible) renderTableView(filtered);
  renderRules();
  renderUsersTable();

  if (map) setTimeout(() => map.resize(), 100);
}

// Check URL param for auto-demo
function shouldAutoDemo() {
  return new URLSearchParams(window.location.search).has('demo');
}

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Setup auth UI (no-ops in demo, but keeps event listeners working)
  setupLoginForm();
  setupUserDropdown();

  // Show login landing initially
  showLoginLanding();

  // Wire up demo button(s) — enter demo mode on click
  document.querySelectorAll('[data-action="demo"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await enterDemoMode();
    });
  });

  // Login form also enters demo mode (no real auth backend)
  const landingForm = document.getElementById('landing-login-form');
  if (landingForm) {
    landingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await enterDemoMode();
    });
  }

  // Initialize map (needed for both states, will show when app is visible)
  initMap();

  // If ?demo in URL, enter demo mode automatically
  if (shouldAutoDemo()) {
    await enterDemoMode();
  }

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
  setupFieldToggle();
  setupImageWidget();
  setupRunChecksButton();
  setupGwrEnrichButton();
  setupUserEditButton();

  // Setup chart filter callback (cross-filtering updates other views)
  setChartFilterCallback(() => {
    const filtered = getFilteredBuildings();
    updateMapMarkers(filtered);
    renderKanbanBoard(filtered);
    if (tableVisible) renderTableView(filtered);
  });

  // Update counts and statistics
  const initialFiltered = getFilteredBuildings();
  updateCounts(initialFiltered);
  updateStatistik(initialFiltered);

  // Apply building selection from URL
  if (state.selectedBuildingId) {
    selectBuilding(state.selectedBuildingId, false);
  }

  // Render table if visible
  if (tableVisible) renderTableView();

  // Listen for browser back/forward
  window.addEventListener('popstate', handlePopState);
});
