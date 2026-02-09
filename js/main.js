// ========================================
// Main Entry Point
// Initialization, data loading, event setup
// ========================================

import {
  state,
  buildings,
  setData,
  getFilteredBuildings,
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
  errorsData,
  rulesConfig
} from './state.js';

// Supabase integration
import {
  initSupabase,
  getSupabase,
  SUPABASE_URL,
  SUPABASE_KEY,
  loadAllData as loadDataFromSupabase,
  fetchErrorsForExport,
  fetchEventsForExport,
  updateUserLastLogin,
  updateUserRole,
  removeUser,
  updateBuildingGwrFields,
  buildGwrUpdateRow,
  batchUpdateBuildingGwrFields
} from './supabase.js';

import {
  initAuth,
  onAuthStateChange,
  setupLoginForm,
  setupPasswordResetForm,
  setupForgotPasswordForm,
  setupInviteForm,
  setupUserDropdown,
  showPasswordResetModal,
  isPasswordRecoveryMode,
  updateUIForAuthState,
  isAuthenticated
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
  if (!isAuthenticated() && !window.isDemoMode) {
    return;
  }

  // Re-entrancy guard: if a load is already in flight, return the same promise
  if (_loadDataPromise) return _loadDataPromise;

  _loadDataPromise = (async () => {
    try {
      const data = await loadDataFromSupabase();
      setData(data);
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

    // Group events by buildingId for keyed lookup in detail panel
    const eventsGrouped = {};
    (events || []).forEach(e => {
      if (!eventsGrouped[e.buildingId]) eventsGrouped[e.buildingId] = [];
      eventsGrouped[e.buildingId].push(e);
    });

    return {
      buildings,
      teamMembers: users || [],
      eventsData: eventsGrouped,
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

  try {
    const data = await loadDemoData();
    setData(data);

    // Set demo user
    setCurrentUser('Demo Benutzer');

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

    scheduleLucideRefresh();
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
// Edge Function Helper
// ========================================
async function invokeEdgeFunction(path, method = 'GET') {
  const supabase = getSupabase();

  // Get a fresh session JWT (refreshes automatically if expired)
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ========================================
// API Tab — Swagger UI (lazy-loaded, spec fetched directly)
// ========================================
const SWAGGER_CSS_URL = 'https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css';
const SWAGGER_JS_URL = 'https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js';
let swaggerPromise = null;
let apiLoaded = false;

function loadSwaggerUI() {
  if (typeof SwaggerUIBundle !== 'undefined') return Promise.resolve();
  if (swaggerPromise) return swaggerPromise;

  // Fetch CSS as text and inject as inline <style> (CSP allows 'unsafe-inline')
  const cssReady = fetch(SWAGGER_CSS_URL)
    .then(r => { if (!r.ok) throw new Error(`CSS ${r.status}`); return r.text(); })
    .then(css => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    });

  const jsReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SWAGGER_JS_URL;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Swagger JS konnte nicht geladen werden'));
    document.head.appendChild(script);
  });

  swaggerPromise = Promise.all([cssReady, jsReady]).catch(err => {
    swaggerPromise = null;
    throw err;
  });

  return swaggerPromise;
}

async function initAPITab() {
  if (apiLoaded) return;

  const loading = document.getElementById('api-loading');
  const container = document.getElementById('swagger-ui');

  // Reset loading UI in case of a previous error
  loading.style.display = '';
  loading.innerHTML = `
    <i data-lucide="loader" class="icon-lg spinner"></i>
    <p>API-Dokumentation wird geladen...</p>`;
  container.style.display = 'none';
  scheduleLucideRefresh();

  try {
    // Load Swagger UI CSS + JS in parallel
    await loadSwaggerUI();

    // Fetch OpenAPI spec directly (no auth needed — verify_jwt = false)
    const specUrl = `${SUPABASE_URL}/functions/v1/rule-engine/openapi.json`;
    const response = await fetch(specUrl, {
      headers: { 'apikey': SUPABASE_KEY }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const spec = await response.json();

    // Hide loading, show Swagger container
    loading.style.display = 'none';
    container.style.display = 'block';

    // Render Swagger UI
    SwaggerUIBundle({
      spec,
      dom_id: '#swagger-ui',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    });

    apiLoaded = true;
  } catch (err) {
    console.error('API docs error:', err);
    loading.innerHTML = `
      <i data-lucide="alert-circle" class="icon-lg"></i>
      <p>API-Dokumentation konnte nicht geladen werden.</p>
      <p style="font-size: var(--font-sm); color: var(--text-muted)">${err.message}</p>
      <button class="btn btn-ghost btn-sm" style="margin-top: var(--space-md)">
        <i data-lucide="refresh-cw" class="icon-sm"></i> Erneut versuchen
      </button>`;
    loading.querySelector('button').addEventListener('click', () => initAPITab());
    scheduleLucideRefresh();
  }
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
          <td class="rules-table-cell rules-table-id">${rule.id}</td>
          <td class="rules-table-cell">
            <span class="rule-name">${rule.name}</span>
            <span class="rule-description">${rule.description}</span>
          </td>
          <td class="rules-table-cell"><code class="rule-field">${fieldDisplay}</code></td>
          <td class="rules-table-cell">${operatorDisplay}</td>
          <td class="rules-table-cell">${sev.label}</td>
          <td class="rules-table-cell">${rule.message || ''}</td>
        </tr>
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
            <div class="user-avatar-small">${user.initials}</div>
            <span>${user.name}</span>
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
  const abortBtn = document.getElementById('abort-all-checks');
  const progressEl = document.getElementById('progress-all-checks');
  const lastCheckEl = document.getElementById('workflow-checks-time');

  if (!runBtn) return;

  let aborted = false;

  function setRunning(running) {
    const item = runBtn.closest('.workflow-item');
    if (running) {
      runBtn.innerHTML = '<i data-lucide="loader-circle" class="icon-sm"></i> Läuft...';
      runBtn.classList.add('running');
      abortBtn.hidden = false;
      progressEl.hidden = false;
      item.classList.add('running');
    } else {
      runBtn.innerHTML = '<i data-lucide="play" class="icon-sm"></i> Ausführen';
      runBtn.classList.remove('running');
      abortBtn.hidden = true;
      progressEl.hidden = true;
      item.classList.remove('running');
      progressEl.querySelector('.workflow-progress-fill').style.width = '0%';
    }
    scheduleLucideRefresh();
  }

  function updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressEl.querySelector('.workflow-progress-fill').style.width = `${pct}%`;
    progressEl.querySelector('.workflow-progress-text').textContent = `${current} / ${total}`;
  }

  abortBtn.addEventListener('click', () => { aborted = true; });

  runBtn.addEventListener('click', async () => {
    aborted = false;
    setRunning(true);

    try {
      let offset = 0;
      const limit = 50;
      let totalBuildings = 0;
      let totalErrors = 0;
      let hasMore = true;
      let chunk = 0;

      console.group('[Checks] Alle Prüfungen ausführen');
      console.log('Starte Prüfung…');

      while (hasMore) {
        if (aborted) {
          console.warn(`Abgebrochen bei Offset ${offset}`);
          break;
        }

        chunk++;
        const data = await invokeEdgeFunction(
          `rule-engine/check-all?offset=${offset}&limit=${limit}`,
          'POST'
        );

        totalBuildings = data.totalBuildings;
        totalErrors += data.totalErrors;
        hasMore = data.hasMore;
        offset = data.nextOffset ?? offset + limit;

        const processed = Math.min(offset, totalBuildings);
        console.log(`Chunk ${chunk}: ${processed}/${totalBuildings} geprüft, ${data.totalErrors} Fehler in diesem Batch`);
        updateProgress(processed, totalBuildings);
      }

      // Update last check timestamp
      if (lastCheckEl) {
        lastCheckEl.textContent = formatNowSwiss();
      }

      if (aborted) {
        console.warn(`Ergebnis: Abgebrochen — ${Math.min(offset, totalBuildings)}/${totalBuildings} geprüft, ${totalErrors} Fehler`);
        alert(`Prüfung abgebrochen: ${Math.min(offset, totalBuildings)}/${totalBuildings} Gebäude geprüft.`);
      } else {
        console.log(`Ergebnis: ${totalBuildings} Gebäude geprüft, ${totalErrors} Fehler gefunden`);
        alert(`Prüfung abgeschlossen: ${totalBuildings} Gebäude geprüft, ${totalErrors} Fehler gefunden.`);
      }

      console.groupEnd();

      // Reload data to reflect updated confidence/errors
      const freshData = await loadDataFromSupabase();
      setData(freshData);

      // Re-render all views with fresh data
      recreateMarkers(selectBuilding);
      applyFilters();

      // Refresh detail panel if a building is selected
      if (state.selectedBuildingId) {
        const updatedBuilding = buildings.find(b => b.id === state.selectedBuildingId);
        if (updatedBuilding) renderDetailPanel(updatedBuilding);
      }

    } catch (err) {
      console.error('[Checks] Fehlgeschlagen:', err);
      console.groupEnd();
      alert(`Fehler bei der Prüfung: ${err.message}`);
    } finally {
      setRunning(false);
    }
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

// ========================================
// GWR Enrich: Swisstopo API → Update GWR values
// ========================================
const SWISSTOPO_FIND_URL = 'https://api3.geo.admin.ch/rest/services/ech/MapServer/find';

/**
 * Fetch GWR data for a single EGID from the Swisstopo API.
 * Returns mapped field values or null if not found.
 */
async function fetchGwrByEgid(egid) {
  const params = new URLSearchParams({
    layer: 'ch.bfs.gebaeude_wohnungs_register',
    searchText: egid,
    searchField: 'egid',
    returnGeometry: 'true',
    contains: 'false',
    sr: '4326'
  });

  const response = await fetch(`${SWISSTOPO_FIND_URL}?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.results || data.results.length === 0) return null;

  const a = data.results[0].attributes;
  const geom = data.results[0].geometry;

  // Map GWR API attributes to our field keys
  return {
    egid: String(a.egid ?? ''),
    egrid: a.egrid || '',
    plz: String(a.dplz4 ?? ''),
    ort: a.dplzname || '',
    strasse: a.strname || '',
    hausnummer: String(a.deinr ?? ''),
    gemeinde: a.ggdename || '',
    bfsNr: String(a.ggdenr ?? ''),
    kanton: a.gdekt || '',
    country: 'CH',
    gstat: String(a.gstat ?? ''),
    gkat: String(a.gkat ?? ''),
    gklas: String(a.gklas ?? ''),
    gbaup: String(a.gbaup ?? ''),
    gbauj: String(a.gbauj ?? ''),
    gastw: String(a.gastw ?? ''),
    ganzwhg: String(a.ganzwhg ?? ''),
    garea: String(a.garea ?? ''),
    lat: geom ? String(geom.y) : '',
    lng: geom ? String(geom.x) : '',
  };
}

function setupGwrEnrichButton() {
  const runBtn = document.getElementById('run-gwr-enrich');
  const abortBtn = document.getElementById('abort-gwr-enrich');
  const progressEl = document.getElementById('progress-gwr-enrich');
  const timeEl = document.getElementById('workflow-gwr-time');

  if (!runBtn) return;

  let aborted = false;

  function setRunning(running) {
    const item = runBtn.closest('.workflow-item');
    if (running) {
      runBtn.innerHTML = '<i data-lucide="loader-circle" class="icon-sm"></i> Läuft...';
      runBtn.classList.add('running');
      abortBtn.hidden = false;
      progressEl.hidden = false;
      item.classList.add('running');
    } else {
      runBtn.innerHTML = '<i data-lucide="play" class="icon-sm"></i> Ausführen';
      runBtn.classList.remove('running');
      abortBtn.hidden = true;
      progressEl.hidden = true;
      item.classList.remove('running');
      progressEl.querySelector('.workflow-progress-fill').style.width = '0%';
    }
    scheduleLucideRefresh();
  }

  function updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressEl.querySelector('.workflow-progress-fill').style.width = `${pct}%`;
    progressEl.querySelector('.workflow-progress-text').textContent = `${current} / ${total}`;
  }

  abortBtn.addEventListener('click', () => { aborted = true; });

  runBtn.addEventListener('click', async () => {
    aborted = false;
    setRunning(true);

    try {
      // Filter buildings that have a GWR EGID value
      const withEgid = buildings.filter(b => b.egid?.gwr);
      const total = withEgid.length;

      console.group('[GWR] Daten aktualisieren');
      console.log(`${total} Gebäude mit GWR-EGID gefunden`);

      if (total === 0) {
        alert('Keine Gebäude mit GWR-EGID gefunden.');
        console.groupEnd();
        return;
      }

      let updated = 0;
      let notFound = 0;
      let errors = 0;
      const batchSize = 20;  // max concurrent Swisstopo requests

      for (let i = 0; i < total; i += batchSize) {
        if (aborted) {
          console.warn(`Abgebrochen bei ${i}/${total}`);
          break;
        }

        const batch = withEgid.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        try {
          // Phase 1: Fetch all GWR data in parallel (max 20 concurrent)
          const fetchResults = await Promise.allSettled(
            batch.map(building => fetchGwrByEgid(building.egid.gwr))
          );

          // Phase 2: Build DB rows from results
          const dbRows = [];
          for (let j = 0; j < batch.length; j++) {
            const r = fetchResults[j];
            if (r.status === 'fulfilled') {
              const gwrData = r.value;
              dbRows.push(buildGwrUpdateRow(batch[j].id, batch[j], gwrData));
              if (gwrData) updated++;
              else notFound++;
            } else {
              errors++;
              console.error(`  Fetch fehlgeschlagen (${batch[j].id}):`, r.reason);
            }
          }

          // Phase 3: Single batch upsert to Supabase
          if (dbRows.length > 0) {
            await batchUpdateBuildingGwrFields(dbRows);
          }
        } catch (batchErr) {
          errors += batch.length;
          console.error(`  Batch ${batchNum} fehlgeschlagen:`, batchErr);
        }

        // Update progress
        const done = Math.min(i + batchSize, total);
        console.log(`Batch ${batchNum}: ${done}/${total} — ${updated} OK, ${notFound} nicht gefunden, ${errors} Fehler`);
        updateProgress(done, total);
      }

      // Update last run timestamp
      if (timeEl) {
        timeEl.textContent = formatNowSwiss();
      }

      const summary = `${updated} aktualisiert, ${notFound} nicht gefunden, ${errors} Fehler`;
      if (aborted) {
        console.warn(`Ergebnis (abgebrochen): ${summary}`);
        alert(`GWR Aktualisierung abgebrochen:\n${summary}`);
      } else {
        console.log(`Ergebnis: ${summary}`);
        alert(`GWR Aktualisierung abgeschlossen:\n${updated} aktualisiert\n${notFound} nicht im GWR gefunden\n${errors} Fehler`);
      }

      console.groupEnd();

      // Reload data to reflect changes
      const data = await loadDataFromSupabase();
      setData(data);
      applyFilters();

    } catch (err) {
      console.error('[GWR] Fehlgeschlagen:', err);
      console.groupEnd();
      alert(`Fehler bei GWR-Aktualisierung: ${err.message}`);
    } finally {
      setRunning(false);
    }
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
    let sourceErrors;
    let buildingMap = {};

    if (isAuthenticated() && !window.isDemoMode) {
      console.group('📊 Fehlerbericht Export');
      console.log('Fetching errors with pagination...');
      const { errors, buildings: buildingsList } = await fetchErrorsForExport((loaded, total) => {
        updateProgress(loaded, total);
        console.log(`  Loaded ${loaded} / ${total} errors`);
      });
      sourceErrors = errors;
      buildingsList.forEach(b => { buildingMap[b.id] = b; });
      console.log('All errors fetched, building Excel file...');
    } else {
      sourceErrors = errorsData;
      buildings.forEach(b => { buildingMap[b.id] = b; });
    }

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
    let sourceEvents;

    if (isAuthenticated() && !window.isDemoMode) {
      sourceEvents = await fetchEventsForExport();
    } else {
      // eventsData is keyed by buildingId — flatten to array for export
      sourceEvents = Object.values(eventsData).flat();
    }

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
      if (tableVisible) renderTableView(filtered);
      updateStatistik(filtered);
    }
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
  setupForgotPasswordForm();
  setupInviteForm();
  setupUserDropdown();
  setupDemoButton();

  // Check if user arrived via password reset or invite link
  if (isPasswordRecoveryMode()) {
    showPasswordResetModal();
  }

  // Show login landing immediately (prevents blank screen while auth resolves)
  showLoginLanding();

  // Initialize authentication
  let user = null;
  try {
    user = await initAuth();
  } catch (err) {
    console.error('Auth initialization failed:', err);
  }

  // Track whether we already handled the initial session
  let initialLoadDone = false;

  // Setup auth state change handler (fires on future sign-in/sign-out)
  onAuthStateChange(async (event, _session, appUser) => {
    if (appUser) {
      setCurrentUser(appUser.name);
    } else {
      setCurrentUser(null);
    }

    // Skip the initial SIGNED_IN if we already handled it below
    if (event === 'SIGNED_IN' && initialLoadDone) {
      // This is a fresh sign-in (not the initial session replay)
      showApp();
      hideAppError();
      await updateUserLastLogin(appUser.id);
      await loadData();
      recreateMarkers(selectBuilding);
      updateCounts();
      updateStatistik();
      renderKanbanBoard();
      if (tableVisible) renderTableView();
      renderRules();
      renderUsersTable();
      if (map) setTimeout(() => map.resize(), 100);
    } else if (event === 'SIGNED_OUT') {
      showLoginLanding();
      setData({ buildings: [], teamMembers: [], eventsData: {}, commentsData: {}, errorsData: {}, rulesConfig: null });
    }

    updateUIForAuthState();
    scheduleLucideRefresh();
  });

  // Handle initial auth state
  if (user) {
    initialLoadDone = true;
    setCurrentUser(user.name);
    showApp();

    await loadData();

    updateUIForAuthState();
    scheduleLucideRefresh();

    renderRules();
    renderUsersTable();
  } else {
    initialLoadDone = true;
    showLoginLanding();
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
