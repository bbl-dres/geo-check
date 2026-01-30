// ========================================
// Kanban Module
// Kanban board rendering and drag-drop
// ========================================

import { state, buildings, getFilteredBuildings, tableVisible } from './state.js';
import { updateMapMarkers } from './map.js';

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
    const countEl = document.getElementById(`count-kanban-${status}`);

    if (countEl) countEl.textContent = items.length;

    if (!container) return;

    container.innerHTML = items.map(building => {
      const priorityClass = building.priority || 'medium';
      const confidenceClass = building.confidence.total < 50 ? 'critical' :
                              building.confidence.total < 80 ? 'warning' : 'ok';

      const assigneeHtml = building.assignee
        ? `<div class="kanban-card-assignee">
             <div class="kanban-avatar">${getInitials(building.assignee)}</div>
           </div>`
        : '';

      return `
        <div class="kanban-card" draggable="true" data-building-id="${building.id}">
          <div class="kanban-card-header">
            <span class="kanban-card-id">${building.id}</span>
            <span class="priority-indicator ${priorityClass}"></span>
          </div>
          <div class="kanban-card-title">${building.name}</div>
          <div class="kanban-card-meta">
            <span class="kanban-card-location">${building.kanton}</span>
            <span class="kanban-card-confidence ${confidenceClass}">${building.confidence.total}%</span>
          </div>
          <div class="kanban-card-footer">
            <div class="kanban-card-errors">
              ${building.errors.length > 0 ? `<span class="error-count">${building.errors.length}</span>` : ''}
            </div>
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

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
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
    building.lastUpdateBy = 'M. Keller';

    renderKanbanBoard();
    updateMapMarkers();

    if (onDataChange) onDataChange();
  }

  column.classList.remove('drag-over');
}
