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
  applyMultiSelectState,
  setSearchQuery,
  setCurrentUser,
  eventsData,
  errorsData
} from './state.js';

// Supabase integration
import {
  initSupabase,
  loadAllData as loadDataFromSupabase,
  updateUserLastLogin,
  updateUserRole,
  removeUser
} from './supabase.js';

import {
  initAuth,
  onAuthStateChange,
  setupLoginForm,
  setupPasswordResetForm,
  setupUserDropdown,
  showPasswordResetModal,
  isPasswordRecoveryMode,
  updateUIForAuthState,
  getCurrentUser,
  getCurrentUserName,
  getCurrentUserId,
  isAuthenticated
} from './auth.js';

import {
  map,
  markers,
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
  const pageScrollTabs = ['statistik', 'aufgaben', 'settings'];
  document.body.classList.toggle('page-scroll-tab', pageScrollTabs.includes(tabId));
}

// ========================================
// Data Loading
// ========================================

async function loadData() {
  if (!isAuthenticated() && !window.isDemoMode) {
    console.log('Not authenticated - skipping data load');
    return;
  }

  try {
    const data = await loadDataFromSupabase();
    setData(data);
    console.log('Data loaded from Supabase');
  } catch (error) {
    console.error('Data loading error:', error);
    showAppError('Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.');
  }
}

// ========================================
// Demo Mode - Load from JSON files
// ========================================

async function loadDemoData() {
  try {
    const [buildingsRes, usersRes, eventsRes, commentsRes, errorsRes, rulesRes] = await Promise.all([
      fetch('data/buildings.json'),
      fetch('data/users.json'),
      fetch('data/events.json'),
      fetch('data/comments.json'),
      fetch('data/errors.json'),
      fetch('data/rules.json')
    ]);

    const [buildingsRaw, users, events, comments, errors, rules] = await Promise.all([
      buildingsRes.json(),
      usersRes.json(),
      eventsRes.json(),
      commentsRes.json(),
      errorsRes.json(),
      rulesRes.json()
    ]);

    // Transform buildings to attach errors and comments
    const buildings = (buildingsRaw || []).map(b => ({
      ...b,
      // Extract kanton string from object if needed
      kanton: typeof b.kanton === 'object' ? (b.kanton.sap || b.kanton.gwr || '') : b.kanton,
      // Attach errors for this building
      errors: errors[b.id] || [],
      // Attach comments for this building
      comments: comments[b.id] || []
    }));

    return {
      buildings,
      teamMembers: users || [],
      eventsData: events || [],
      commentsData: comments || {},
      errorsData: errors || {},
      rulesConfig: rules || null
    };
  } catch (error) {
    console.error('Error loading demo data:', error);
    throw error;
  }
}

async function startDemoMode() {
  window.isDemoMode = true;
  console.log('Starting demo mode...');

  try {
    const data = await loadDemoData();
    setData(data);
    console.log('Demo data loaded successfully');

    // Set demo user
    setCurrentUser('Demo Benutzer');

    // Store rulesConfig globally for renderRules
    window.rulesConfig = data.rulesConfig;

    // Show app
    showApp();
    hideAppError();

    // Update UI for demo user
    const loginBtn = document.getElementById('login-btn');
    const userTrigger = document.getElementById('user-trigger');
    const userInitials = document.getElementById('user-initials');
    const userDropdownName = document.getElementById('user-dropdown-name');
    const userDropdownRole = document.getElementById('user-dropdown-role');

    if (loginBtn) loginBtn.style.display = 'none';
    if (userTrigger) userTrigger.style.display = 'flex';
    if (userInitials) userInitials.textContent = 'DE';
    if (userDropdownName) userDropdownName.textContent = 'Demo Benutzer';
    if (userDropdownRole) userDropdownRole.textContent = 'Demo';

    // Re-render views
    recreateMarkers(selectBuilding);
    updateCounts();
    updateStatistik();
    renderKanbanBoard();
    if (tableVisible) renderTableView();
    renderRules();
    renderUsersTable();

    // Resize map after showing
    if (map) setTimeout(() => map.resize(), 100);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (error) {
    console.error('Demo mode error:', error);
    showAppError('Demo-Daten konnten nicht geladen werden.');
  }
}

function setupDemoButton() {
  const demoBtn = document.getElementById('demo-btn');
  if (demoBtn) {
    demoBtn.addEventListener('click', startDemoMode);
  }
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

  updateTabUI(tabId);

  // Reset scroll position when switching tabs
  const pageScrollTabs = ['statistik', 'aufgaben', 'settings'];
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
            <div class="user-avatar-small">${user.initials}</div>
            <span>${user.name}</span>
          </div>
        </td>
        <td>${roleCell}</td>
        <td class="user-last-login">${formattedLogin}</td>
        ${actionsCell}
      </tr>
    `}).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();

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

    if (typeof lucide !== 'undefined') lucide.createIcons();
    renderUsersTable();
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
}

// ========================================
// CSV Export Functions
// ========================================

/**
 * Download content as a CSV file
 */
function downloadCSV(filename, csvContent) {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Export errors report as CSV
 */
function exportErrorsReport() {
  // Flatten errorsData (keyed by building ID) into array
  const rows = [];

  // Get building info for additional context
  const buildingMap = {};
  buildings.forEach(b => {
    buildingMap[b.id] = b;
  });

  // Iterate through buildings and their errors
  for (const buildingId in errorsData) {
    const buildingErrors = errorsData[buildingId];
    const building = buildingMap[buildingId];
    const buildingName = building ? building.name : '';

    if (Array.isArray(buildingErrors)) {
      buildingErrors.forEach(error => {
        rows.push({
          buildingId: buildingId,
          buildingName: buildingName,
          checkId: error.check_id || error.checkId || '',
          description: error.description || '',
          level: error.level || ''
        });
      });
    }
  }

  if (rows.length === 0) {
    alert('Keine Fehler zum Exportieren vorhanden.');
    return;
  }

  // Create CSV content
  const headers = ['Gebäude-ID', 'Gebäudename', 'Prüf-ID', 'Beschreibung', 'Stufe'];
  const csvRows = [headers.join(';')];

  rows.forEach(row => {
    csvRows.push([
      escapeCSV(row.buildingId),
      escapeCSV(row.buildingName),
      escapeCSV(row.checkId),
      escapeCSV(row.description),
      escapeCSV(row.level)
    ].join(';'));
  });

  const csvContent = csvRows.join('\r\n');
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadCSV(`Fehlerbericht_${timestamp}.csv`, csvContent);

  // Update last run timestamp
  const timestampEl = document.getElementById('workflow-errors-time');
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
}

/**
 * Export events report as CSV
 */
function exportEventsReport() {
  if (!Array.isArray(eventsData) || eventsData.length === 0) {
    alert('Keine Ereignisse zum Exportieren vorhanden.');
    return;
  }

  // Create CSV content
  const headers = ['ID', 'Gebäude-ID', 'Typ', 'Aktion', 'Benutzer', 'Zeitstempel', 'Details'];
  const csvRows = [headers.join(';')];

  eventsData.forEach(event => {
    // Format timestamp for display
    const timestamp = event.timestamp
      ? new Date(event.timestamp).toLocaleString('de-CH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    csvRows.push([
      escapeCSV(event.id),
      escapeCSV(event.buildingId),
      escapeCSV(event.type),
      escapeCSV(event.action),
      escapeCSV(event.user),
      escapeCSV(timestamp),
      escapeCSV(event.details)
    ].join(';'));
  });

  const csvContent = csvRows.join('\r\n');
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadCSV(`Ereignisse_${timestamp}.csv`, csvContent);

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
    onPriorityChange: () => {
      renderKanbanBoard();
      if (tableVisible) renderTableView();
      updateCounts();
    },
    onDueDateChange: () => {
      renderKanbanBoard();
      if (tableVisible) renderTableView();
      updateStatistik();
    },
    onDataChange: () => {
      if (tableVisible) renderTableView();
      updateStatistik();
    }
  });

  // Kanban callbacks
  setKanbanCallbacks({
    onSelectBuilding: selectBuilding,  // No longer switches tab
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

  // Initialize Supabase client
  initSupabase();

  // Setup login form handlers (needed even before auth check)
  setupLoginForm();
  setupPasswordResetForm();
  setupUserDropdown();
  setupDemoButton();

  // Check if user arrived via password reset link
  if (isPasswordRecoveryMode()) {
    showPasswordResetModal();
  }

  // Initialize authentication
  const user = await initAuth();

  // Setup auth state change handler
  onAuthStateChange(async (event, session, appUser) => {
    console.log('Auth state changed:', event);

    if (appUser) {
      setCurrentUser(appUser.name);
    } else {
      setCurrentUser(null);
    }

    // Show/hide app based on auth state
    if (event === 'SIGNED_IN' && appUser) {
      showApp();
      hideAppError();
      // Update last login timestamp
      await updateUserLastLogin(appUser.id);
      await loadData();
      // Re-render views - recreate markers since data changed
      recreateMarkers(selectBuilding);
      updateCounts();
      updateStatistik();
      renderKanbanBoard();
      if (tableVisible) renderTableView();
      renderRules();
      renderUsersTable();
      // Resize map after showing
      if (map) setTimeout(() => map.resize(), 100);
    } else if (event === 'SIGNED_OUT') {
      showLoginLanding();
      // Clear data
      setData({ buildings: [], teamMembers: [], eventsData: {}, commentsData: {}, errorsData: {}, rulesConfig: null });
    }

    // Update UI for auth state
    updateUIForAuthState();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  // Check if already authenticated
  if (user) {
    setCurrentUser(user.name);
    console.log('Logged in as:', user.name);
    showApp();

    // Load data
    await loadData();

    // Update auth UI
    updateUIForAuthState();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Store rulesConfig globally for renderRules and render settings tab content
    import('./state.js').then(mod => {
      window.rulesConfig = mod.rulesConfig;
      renderRules();
      renderUsersTable();
    });
  } else {
    // Not authenticated - show login landing
    showLoginLanding();
    console.log('Not authenticated - showing login page');
  }

  // Initialize map (needed for both states, will show when app is visible)
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
  setupFieldToggle();
  setupImageWidget();
  setupRunChecksButton();
  setupUserEditButton();

  // Setup chart filter callback (cross-filtering updates other views)
  setChartFilterCallback(() => {
    updateMapMarkers();
    renderKanbanBoard();
    if (tableVisible) renderTableView();
  });

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
