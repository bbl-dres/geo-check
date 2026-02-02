// ========================================
// Statistics Module
// Statistics tab calculations and ApexCharts
// ========================================

import { buildings, getFilteredBuildings } from './state.js';

// Chart instances
let charts = {
  confidence: null,
  status: null,
  source: null,
  duedate: null,
  assignee: null,
  priority: null
};

// Cross-filter state (separate from main filters)
let chartFilters = {
  confidence: null,  // e.g., 'critical', 'warning', 'moderate', 'success'
  status: null,      // e.g., 'backlog', 'inprogress', 'clarification', 'done'
  source: null,      // e.g., 'georef', 'gwr', 'sap', 'address'
  duedate: null,     // e.g., 'overdue', 'thisweek', 'later', 'none'
  assignee: null,    // e.g., 'M. Keller'
  priority: null     // e.g., 'high', 'medium', 'low'
};

// Callback for when chart filter changes
let onChartFilterChange = null;

export function setChartFilterCallback(callback) {
  onChartFilterChange = callback;
}

// Get filtered buildings with chart filters applied
function getChartFilteredBuildings() {
  let filtered = getFilteredBuildings();

  // Apply chart-specific filters (aligned with main filters: 50/80 thresholds)
  if (chartFilters.confidence) {
    filtered = filtered.filter(b => {
      const conf = b.confidence.total;
      if (chartFilters.confidence === 'critical') return conf < 50;
      if (chartFilters.confidence === 'warning') return conf >= 50 && conf < 80;
      if (chartFilters.confidence === 'ok') return conf >= 80;
      return true;
    });
  }

  if (chartFilters.status) {
    filtered = filtered.filter(b => b.kanbanStatus === chartFilters.status ||
      (chartFilters.status === 'backlog' && !b.kanbanStatus));
  }

  if (chartFilters.duedate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    filtered = filtered.filter(b => {
      if (!b.dueDate) return chartFilters.duedate === 'none';
      const dueDate = new Date(b.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (chartFilters.duedate === 'overdue') return dueDate < today;
      if (chartFilters.duedate === 'thisweek') return dueDate >= today && dueDate <= weekFromNow;
      if (chartFilters.duedate === 'later') return dueDate > weekFromNow;
      return true;
    });
  }

  if (chartFilters.assignee) {
    if (chartFilters.assignee === 'unassigned') {
      filtered = filtered.filter(b => !b.assignee);
    } else {
      filtered = filtered.filter(b => b.assignee === chartFilters.assignee);
    }
  }

  if (chartFilters.priority) {
    filtered = filtered.filter(b => b.priority === chartFilters.priority);
  }

  if (chartFilters.source) {
    filtered = filtered.filter(b => {
      if (chartFilters.source === 'georef') return b.confidence.georef < 80;
      if (chartFilters.source === 'gwr') return b.confidence.gwr < 80;
      if (chartFilters.source === 'sap') return b.confidence.sap < 80;
      if (chartFilters.source === 'address') return b.data && b.data.address && !b.data.address.match;
      return true;
    });
  }

  return filtered;
}

// Check if any chart filter is active
function hasActiveChartFilter() {
  return Object.values(chartFilters).some(v => v !== null);
}

// Clear all chart filters
export function clearChartFilters() {
  Object.keys(chartFilters).forEach(key => chartFilters[key] = null);
  updateStatistik();
  if (onChartFilterChange) onChartFilterChange();
}

// Toggle a chart filter
function toggleChartFilter(chartName, value) {
  if (chartFilters[chartName] === value) {
    chartFilters[chartName] = null;  // Deselect
  } else {
    chartFilters[chartName] = value;  // Select
  }
  updateStatistik();
  if (onChartFilterChange) onChartFilterChange();
}

// ========================================
// Chart Theme / Colors (matching CSS tokens)
// ========================================
const chartColors = {
  // Primary brand
  primary: '#1a365d',      // --federal-blue
  primaryDark: '#152c4f',  // --federal-blue-dark

  // Functional colors (muted versions for charts)
  critical: '#dc2626',     // --color-critical
  warning: '#d97706',      // --color-warning
  success: '#059669',      // --color-success

  // Neutral
  muted: '#868e96',        // --text-muted
  subtle: '#adb5bd',       // lighter muted

  // Confidence buckets (aligned with main filters: 50/80 thresholds)
  confidence: {
    critical: '#dc2626',   // --color-critical (<50%)
    warning: '#d97706',    // --color-warning (50-80%)
    ok: '#059669'          // --color-success (>=80%)
  },

  // Kanban status
  status: {
    backlog: '#868e96',    // --text-muted
    inprogress: '#1a365d', // --federal-blue
    clarification: '#d97706', // --color-warning
    done: '#059669'        // --color-success
  },

  // Data sources (matching --type-* tokens)
  source: {
    georef: '#6366f1',     // --type-geo
    gwr: '#059669',        // --type-gwr
    sap: '#0891b2',        // --type-sap
    address: '#7c3aed'     // --type-address
  },

  // Priority (matching the filter chip colors - all muted grey for icons)
  priority: {
    high: '#1a365d',     // --federal-blue (important but not alarming)
    medium: '#868e96',   // --text-muted
    low: '#adb5bd'       // lighter muted
  }
};

const baseChartOptions = {
  chart: {
    fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    toolbar: { show: false },
    animations: {
      enabled: true,
      easing: 'easeinout',
      speed: 300
    }
  },
  grid: {
    borderColor: '#dee2e6',  // --border-default
    strokeDashArray: 4
  },
  tooltip: {
    theme: 'light',
    style: { fontSize: '13px' }
  },
  states: {
    hover: { filter: { type: 'darken', value: 0.9 } },
    active: { filter: { type: 'darken', value: 0.8 } }
  }
};

// ========================================
// Update Counts (Filter Bar)
// ========================================
export function updateCounts() {
  const counts = { high: 0, medium: 0, low: 0 };
  buildings.forEach(b => {
    if (counts[b.priority] !== undefined) counts[b.priority]++;
  });

  Object.entries(counts).forEach(([priority, count]) => {
    const el = document.getElementById(`count-${priority}`);
    if (el) el.textContent = `(${count})`;
  });

  const filtered = getFilteredBuildings();
  const filteredCountEl = document.getElementById('filtered-count');
  const totalCountEl = document.getElementById('total-count');
  if (filteredCountEl) filteredCountEl.textContent = filtered.length;
  if (totalCountEl) totalCountEl.textContent = buildings.length;
}

// ========================================
// Update Statistics Tab
// ========================================
export function updateStatistik() {
  const filtered = getChartFilteredBuildings();

  if (filtered.length === 0 && !hasActiveChartFilter()) {
    document.getElementById('stat-progress').textContent = '0/0';
    document.getElementById('stat-progress-pct').textContent = '0% erledigt';
    document.getElementById('stat-quality').textContent = '—';
    document.getElementById('stat-critical').textContent = '0';
    document.getElementById('stat-inprogress').textContent = '0';
    document.getElementById('stat-unassigned').textContent = '0';
    document.getElementById('stat-overdue').textContent = '0';
    return;
  }

  // Calculate KPIs for PM dashboard
  const totalCount = filtered.length;
  const doneCount = filtered.filter(b => b.kanbanStatus === 'done').length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const avgConfidence = filtered.length > 0
    ? Math.round(filtered.reduce((sum, b) => sum + b.confidence.total, 0) / filtered.length)
    : 0;

  const criticalCount = filtered.filter(b => b.confidence.total < 50).length;
  const inProgressCount = filtered.filter(b => b.kanbanStatus === 'inprogress').length;
  const unassignedCount = filtered.filter(b => !b.assignee).length;

  // Calculate overdue
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueCount = filtered.filter(b => {
    if (!b.dueDate) return false;
    const dueDate = new Date(b.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today && b.kanbanStatus !== 'done';
  }).length;

  // Update KPI cards
  document.getElementById('stat-progress').textContent = `${doneCount.toLocaleString('de-CH')}/${totalCount.toLocaleString('de-CH')}`;
  document.getElementById('stat-progress-pct').textContent = `${progressPct}% erledigt`;
  document.getElementById('stat-quality').textContent = avgConfidence + '%';
  document.getElementById('stat-critical').textContent = criticalCount.toLocaleString('de-CH');
  document.getElementById('stat-inprogress').textContent = inProgressCount.toLocaleString('de-CH');
  document.getElementById('stat-unassigned').textContent = unassignedCount.toLocaleString('de-CH');
  document.getElementById('stat-overdue').textContent = overdueCount.toLocaleString('de-CH');

  // Update charts
  renderConfidenceChart(filtered);
  renderStatusChart(filtered);
  renderSourceChart(filtered);
  renderDueDateChart(filtered);
  renderAssigneeChart(filtered);
  renderPriorityChart(filtered);
}

// ========================================
// Confidence Distribution Chart
// ========================================
function renderConfidenceChart(filtered) {
  const confBuckets = { critical: 0, warning: 0, ok: 0 };
  filtered.forEach(b => {
    const conf = b.confidence.total;
    if (conf < 50) confBuckets.critical++;
    else if (conf < 80) confBuckets.warning++;
    else confBuckets.ok++;
  });

  const options = {
    ...baseChartOptions,
    series: [{
      name: 'Gebäude',
      data: [confBuckets.critical, confBuckets.warning, confBuckets.ok]
    }],
    chart: {
      ...baseChartOptions.chart,
      type: 'bar',
      height: 220,
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const categories = ['critical', 'warning', 'ok'];
          toggleChartFilter('confidence', categories[config.dataPointIndex]);
        }
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '60%',
        distributed: true
      }
    },
    colors: [chartColors.confidence.critical, chartColors.confidence.warning, chartColors.confidence.ok],
    xaxis: {
      categories: ['<50%', '50-80%', '≥80%'],
      labels: { style: { fontSize: '12px' } }
    },
    yaxis: {
      labels: { style: { fontSize: '12px' } }
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: '12px', fontWeight: 600 }
    }
  };

  if (charts.confidence) {
    charts.confidence.updateOptions(options);
  } else {
    charts.confidence = new ApexCharts(document.getElementById('chart-confidence'), options);
    charts.confidence.render();
  }
}

// ========================================
// Status Distribution Chart (Donut)
// ========================================
function renderStatusChart(filtered) {
  const statusCounts = { backlog: 0, inprogress: 0, clarification: 0, done: 0 };
  filtered.forEach(b => {
    const status = b.kanbanStatus || 'backlog';
    if (statusCounts[status] !== undefined) statusCounts[status]++;
  });

  const options = {
    ...baseChartOptions,
    series: [statusCounts.backlog, statusCounts.inprogress, statusCounts.clarification, statusCounts.done],
    chart: {
      ...baseChartOptions.chart,
      type: 'donut',
      height: 220,
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const statuses = ['backlog', 'inprogress', 'clarification', 'done'];
          toggleChartFilter('status', statuses[config.dataPointIndex]);
        }
      }
    },
    labels: ['Offen', 'In Bearbeitung', 'Rückfrage', 'Erledigt'],
    colors: [chartColors.status.backlog, chartColors.status.inprogress, chartColors.status.clarification, chartColors.status.done],
    plotOptions: {
      pie: {
        donut: {
          size: '60%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Gesamt',
              fontSize: '14px',
              fontWeight: 600,
              formatter: () => filtered.length
            }
          }
        }
      }
    },
    legend: {
      position: 'bottom',
      fontSize: '12px'
    },
    dataLabels: {
      enabled: false
    }
  };

  if (charts.status) {
    charts.status.updateOptions(options);
  } else {
    charts.status = new ApexCharts(document.getElementById('chart-status'), options);
    charts.status.render();
  }
}

// ========================================
// Source Mismatches Chart (Horizontal Bar)
// ========================================
function renderSourceChart(filtered) {
  const sourceCounts = { georef: 0, gwr: 0, sap: 0, address: 0 };
  filtered.forEach(b => {
    if (b.confidence.georef < 80) sourceCounts.georef++;
    if (b.confidence.gwr < 80) sourceCounts.gwr++;
    if (b.confidence.sap < 80) sourceCounts.sap++;
    if (b.data && b.data.address && !b.data.address.match) sourceCounts.address++;
  });

  const options = {
    ...baseChartOptions,
    series: [{
      name: 'Abweichungen',
      data: [sourceCounts.georef, sourceCounts.gwr, sourceCounts.sap, sourceCounts.address]
    }],
    chart: {
      ...baseChartOptions.chart,
      type: 'bar',
      height: 220,
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const sources = ['georef', 'gwr', 'sap', 'address'];
          toggleChartFilter('source', sources[config.dataPointIndex]);
        }
      }
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: '60%',
        distributed: true
      }
    },
    colors: [chartColors.source.georef, chartColors.source.gwr, chartColors.source.sap, chartColors.source.address],
    xaxis: {
      categories: ['Georef', 'GWR', 'SAP', 'Adresse'],
      labels: { style: { fontSize: '12px' } }
    },
    yaxis: {
      labels: { style: { fontSize: '12px' } }
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: '12px', fontWeight: 600 }
    }
  };

  if (charts.source) {
    charts.source.updateOptions(options);
  } else {
    charts.source = new ApexCharts(document.getElementById('chart-source'), options);
    charts.source.render();
  }
}

// ========================================
// Due Date Chart (Bar)
// ========================================
function renderDueDateChart(filtered) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const dueBuckets = { overdue: 0, thisweek: 0, later: 0, none: 0 };

  filtered.forEach(b => {
    if (!b.dueDate) {
      dueBuckets.none++;
      return;
    }
    const dueDate = new Date(b.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) dueBuckets.overdue++;
    else if (dueDate <= weekFromNow) dueBuckets.thisweek++;
    else dueBuckets.later++;
  });

  const options = {
    ...baseChartOptions,
    series: [{
      name: 'Aufgaben',
      data: [dueBuckets.overdue, dueBuckets.thisweek, dueBuckets.later, dueBuckets.none]
    }],
    chart: {
      ...baseChartOptions.chart,
      type: 'bar',
      height: 220,
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const categories = ['overdue', 'thisweek', 'later', 'none'];
          toggleChartFilter('duedate', categories[config.dataPointIndex]);
        }
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '60%',
        distributed: true
      }
    },
    colors: [chartColors.critical, chartColors.warning, chartColors.primary, chartColors.muted],
    xaxis: {
      categories: ['Überfällig', 'Diese Woche', 'Später', 'Ohne Datum'],
      labels: { style: { fontSize: '12px' } }
    },
    yaxis: {
      labels: { style: { fontSize: '12px' } }
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: '12px', fontWeight: 600 }
    }
  };

  if (charts.duedate) {
    charts.duedate.updateOptions(options);
  } else {
    charts.duedate = new ApexCharts(document.getElementById('chart-duedate'), options);
    charts.duedate.render();
  }
}

// ========================================
// Assignee Chart (Horizontal Bar)
// ========================================
function renderAssigneeChart(filtered) {
  const assigneeData = {};
  filtered.forEach(b => {
    const assignee = b.assignee || 'unassigned';
    if (!assigneeData[assignee]) assigneeData[assignee] = 0;
    assigneeData[assignee]++;
  });

  const assigneeCounts = Object.entries(assigneeData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const options = {
    ...baseChartOptions,
    series: [{
      name: 'Aufgaben',
      data: assigneeCounts.map(a => a.count)
    }],
    chart: {
      ...baseChartOptions.chart,
      type: 'bar',
      height: 220,
      events: {
        dataPointSelection: (event, chartContext, config) => {
          toggleChartFilter('assignee', assigneeCounts[config.dataPointIndex]?.name);
        }
      }
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: '70%'
      }
    },
    colors: [chartColors.primary],
    xaxis: {
      categories: assigneeCounts.map(a => a.name === 'unassigned' ? 'Offen' : a.name.split(' ').pop()),
      labels: { style: { fontSize: '12px' } }
    },
    yaxis: {
      labels: { style: { fontSize: '12px' } }
    },
    dataLabels: {
      enabled: true,
      style: { fontSize: '11px', fontWeight: 600 }
    }
  };

  if (charts.assignee) {
    charts.assignee.updateOptions(options);
  } else {
    charts.assignee = new ApexCharts(document.getElementById('chart-assignee'), options);
    charts.assignee.render();
  }
}

// ========================================
// Priority Chart (Donut)
// ========================================
function renderPriorityChart(filtered) {
  const priorityCounts = { high: 0, medium: 0, low: 0 };
  filtered.forEach(b => {
    const priority = b.priority || 'medium';
    if (priorityCounts[priority] !== undefined) priorityCounts[priority]++;
  });

  const options = {
    ...baseChartOptions,
    series: [priorityCounts.high, priorityCounts.medium, priorityCounts.low],
    chart: {
      ...baseChartOptions.chart,
      type: 'donut',
      height: 220,
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const priorities = ['high', 'medium', 'low'];
          toggleChartFilter('priority', priorities[config.dataPointIndex]);
        }
      }
    },
    labels: ['Hoch', 'Mittel', 'Niedrig'],
    colors: [chartColors.priority.high, chartColors.priority.medium, chartColors.priority.low],
    plotOptions: {
      pie: {
        donut: {
          size: '60%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Gesamt',
              fontSize: '14px',
              fontWeight: 600,
              formatter: () => filtered.length
            }
          }
        }
      }
    },
    legend: {
      position: 'bottom',
      fontSize: '12px'
    },
    dataLabels: {
      enabled: false
    }
  };

  if (charts.priority) {
    charts.priority.updateOptions(options);
  } else {
    charts.priority = new ApexCharts(document.getElementById('chart-priority'), options);
    charts.priority.render();
  }
}

// ========================================
// Destroy all charts (for cleanup)
// ========================================
export function destroyCharts() {
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
  });
  charts = {
    confidence: null,
    status: null,
    source: null,
    duedate: null,
    assignee: null,
    priority: null
  };
}
