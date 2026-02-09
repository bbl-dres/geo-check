// ========================================
// Kanban Module
// Kanban board rendering and drag-drop
// ========================================

import { state, buildings, getFilteredBuildings, tableVisible, currentUser, getFieldDisplayValue, escapeHtml, formatDueDate, getDueDateClass } from './state.js';
import { updateMapMarkers } from './map.js';
import { updateBuildingStatus as persistStatus } from './supabase.js';
import { getCurrentUserId, getCurrentUserName, isAuthenticated } from './auth.js';

// Drag state
let draggedCard = null;
let draggedBuildingId = null;

// Callback for navigation
let onSelectBuilding = null;
let onDataChange = null;

export function setCallbacks(callbacks) {
  onSelectBuilding = callbacks.onSelectBuilding;
  onDataChange = callbacks.onDataChange;
}

// ========================================
// Render Kanban Board
// ========================================
export function renderKanbanBoard() {
  const filtered = getFilteredBuildings();

  const columns = {
    backlog: filtered.filter(b => b.kanbanStatus === 'backlog' || !b.kanbanStatus),
    inprogress: filtered.filter(b => b.kanbanStatus === 'inprogress'),
    clarification: filtered.filter(b => b.kanbanStatus === 'clarification'),
    done: filtered.filter(b => b.kanbanStatus === 'done')
  };

  Object.entries(columns).forEach(([status, items]) => {
    const container = document.getElementById(`kanban-${status}`);
    const countEl = document.getElementById(`kanban-${status}-count`);

    if (countEl) countEl.textContent = items.length.toLocaleString('de-CH');

    if (!container) return;

    container.innerHTML = items.map(building => {
      // Use confidence-based colors for consistency across the app
      const confidenceClass = building.confidence.total < 50 ? 'critical' :
                              building.confidence.total < 80 ? 'warning' : 'ok';

      // Priority icon with arrow
      const priorityIcon = getPriorityIcon(building.priority);

      // Assignee avatar or placeholder
      const assigneeHtml = building.assignee
        ? `<div class="kanban-avatar">${getInitials(building.assignee)}</div>`
        : `<span class="placeholder-badge">Zuweisen...</span>`;

      // Due date or placeholder
      const dueDateHtml = building.dueDate
        ? `<span class="kanban-card-due ${getDueDateClass(building.dueDate)}">${formatDueDate(building.dueDate)}</span>`
        : `<span class="placeholder-badge">Fällig...</span>`;

      return `
        <div class="kanban-card" draggable="true" data-building-id="${building.id}">
          <div class="kanban-card-header">
            <span class="kanban-card-id">${building.id}</span>
            ${priorityIcon}
          </div>
          <div class="kanban-card-title">${escapeHtml(building.name)}</div>
          <div class="kanban-card-meta">
            <span class="kanban-card-location">${getFieldDisplayValue(building.kanton)}</span>
            <span class="kanban-card-confidence ${confidenceClass}">${building.confidence.total}%</span>
          </div>
          <div class="kanban-card-footer">
            ${dueDateHtml}
            ${assigneeHtml}
          </div>
        </div>
      `;
    }).join('');
  });

  // Re-setup drag handlers after rendering
  setupKanbanCardHandlers();

  // Refresh icons
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ========================================
// Kanban Selection
// ========================================
export function updateKanbanSelection(selectedId) {
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.buildingId === selectedId);
  });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

function getPriorityIcon(priority) {
  const icons = {
    high: '<span class="priority-icon priority-high"><i data-lucide="chevrons-up" class="icon"></i></span>',
    medium: '<span class="priority-icon priority-medium"><i data-lucide="chevron-up" class="icon"></i></span>',
    low: '<span class="priority-icon priority-low"><i data-lucide="minus" class="icon"></i></span>'
  };
  return icons[priority] || icons.medium;
}

// ========================================
// Drag & Drop Setup
// ========================================
export function setupKanbanDragDrop() {
  const columns = document.querySelectorAll('.kanban-cards');

  columns.forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('dragenter', handleDragEnter);
    column.addEventListener('dragleave', handleDragLeave);
    column.addEventListener('drop', handleDrop);
  });
}

function setupKanbanCardHandlers() {
  const cards = document.querySelectorAll('.kanban-card[draggable="true"]');

  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', (e) => {
      if (!card.classList.contains('dragging') && onSelectBuilding) {
        onSelectBuilding(card.dataset.buildingId);
      }
    });
  });
}

// ========================================
// Drag Event Handlers
// ========================================
function handleDragStart(e) {
  draggedCard = e.target;
  draggedBuildingId = e.target.dataset.buildingId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedBuildingId);

  document.querySelectorAll('.kanban-cards').forEach(col => {
    col.classList.add('drop-target');
  });
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedCard = null;
  draggedBuildingId = null;

  document.querySelectorAll('.kanban-cards').forEach(col => {
    col.classList.remove('drop-target', 'drag-over');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  const column = e.target.closest('.kanban-cards');
  if (column) {
    column.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const column = e.target.closest('.kanban-cards');
  if (column && !column.contains(e.relatedTarget)) {
    column.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  const column = e.target.closest('.kanban-cards');
  if (!column || !draggedBuildingId) return;

  const newStatus = column.id.replace('kanban-', '');

  const building = buildings.find(b => b.id === draggedBuildingId);
  if (building && building.kanbanStatus !== newStatus) {
    building.kanbanStatus = newStatus;
    building.lastUpdate = new Date().toISOString();
    building.lastUpdateBy = currentUser;

    // Persist to Supabase
    if (!window.isDemoMode && isAuthenticated()) {
      persistStatus(building.id, newStatus, getCurrentUserId(), getCurrentUserName())
        .catch(err => console.error('Failed to persist status:', err));
    }

    renderKanbanBoard();
    updateMapMarkers();

    if (onDataChange) onDataChange();
  }

  column.classList.remove('drag-over');
}
