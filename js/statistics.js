// ========================================
// Statistics Module
// Statistics tab calculations and charts
// ========================================

import { buildings, getFilteredBuildings } from './state.js';

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
  const filtered = getFilteredBuildings();

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (filtered.length === 0) {
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-quality').textContent = '—';
    document.getElementById('stat-errors').textContent = '0';
    document.getElementById('stat-critical').textContent = '0';
    document.getElementById('stat-validated').textContent = '0';
    document.getElementById('stat-pending').textContent = '0';
    return;
  }

  // Calculate KPIs
  const totalCount = filtered.length;
  const avgConfidence = Math.round(filtered.reduce((sum, b) => sum + b.confidence.total, 0) / filtered.length);
  const criticalCount = filtered.filter(b => b.confidence.total < 50).length;
  const validatedCount = filtered.filter(b => b.confidence.total >= 90).length;
  const pendingCount = filtered.filter(b => b.kanbanStatus !== 'done').length;

  // Count total errors
  let totalErrors = 0;
  filtered.forEach(b => {
    if (b.data) {
      Object.values(b.data).forEach(field => {
        if (field && field.match === false) totalErrors++;
      });
    }
  });

  // Update KPI cards
  document.getElementById('stat-total').textContent = totalCount;
  document.getElementById('stat-quality').textContent = avgConfidence + '%';
  document.getElementById('stat-errors').textContent = totalErrors;
  document.getElementById('stat-critical').textContent = criticalCount;
  document.getElementById('stat-validated').textContent = validatedCount;
  document.getElementById('stat-pending').textContent = pendingCount;

  // Confidence distribution histogram
  const confBuckets = { critical: 0, warning: 0, moderate: 0, success: 0 };
  filtered.forEach(b => {
    const conf = b.confidence.total;
    if (conf < 40) confBuckets.critical++;
    else if (conf < 60) confBuckets.warning++;
    else if (conf < 80) confBuckets.moderate++;
    else confBuckets.success++;
  });

  const maxBucket = Math.max(...Object.values(confBuckets), 1);
  const histogramEl = document.getElementById('confidence-histogram');
  if (histogramEl) {
    const groups = histogramEl.querySelectorAll('.histogram-bar-group');
    const bucketKeys = ['critical', 'warning', 'moderate', 'success'];
    groups.forEach((group, i) => {
      const bar = group.querySelector('.histogram-bar');
      const value = group.querySelector('.histogram-value');
      const count = confBuckets[bucketKeys[i]];
      const height = Math.max((count / maxBucket) * 100, count > 0 ? 5 : 0);
      bar.style.height = height + '%';
      value.textContent = count;
    });
  }

  // Errors by severity
  let errorCount = 0, warningCount = 0, infoCount = 0;
  filtered.forEach(b => {
    const conf = b.confidence.total;
    if (conf < 50) errorCount++;
    else if (conf < 80) warningCount++;
    else if (conf < 90) infoCount++;
  });

  const maxSeverity = Math.max(errorCount, warningCount, infoCount, 1);
  const severityChart = document.getElementById('severity-chart');
  if (severityChart) {
    const rows = severityChart.querySelectorAll('.severity-bar-row');
    const severityCounts = [errorCount, warningCount, infoCount];
    rows.forEach((row, i) => {
      const fill = row.querySelector('.severity-bar-fill');
      const value = row.querySelector('.severity-value');
      const width = (severityCounts[i] / maxSeverity) * 100;
      fill.style.width = width + '%';
      value.textContent = severityCounts[i];
    });
  }

  // Mismatches by source
  const sourceCounts = { georef: 0, gwr: 0, sap: 0, address: 0 };
  filtered.forEach(b => {
    if (b.confidence.georef < 80) sourceCounts.georef++;
    if (b.confidence.gwr < 80) sourceCounts.gwr++;
    if (b.confidence.sap < 80) sourceCounts.sap++;
    if (b.data && b.data.address && !b.data.address.match) sourceCounts.address++;
  });

  const maxSource = Math.max(...Object.values(sourceCounts), 1);
  const sourceChart = document.getElementById('source-chart');
  if (sourceChart) {
    const rows = sourceChart.querySelectorAll('.chart-row');
    const sourceKeys = ['georef', 'gwr', 'sap', 'address'];
    rows.forEach((row, i) => {
      const fill = row.querySelector('.chart-row-fill');
      const value = row.querySelector('.chart-row-value');
      const count = sourceCounts[sourceKeys[i]];
      const width = (count / maxSource) * 100;
      fill.style.width = width + '%';
      value.textContent = count;
    });
  }

  // Average confidence by canton
  const kantonData = {};
  filtered.forEach(b => {
    if (!kantonData[b.kanton]) {
      kantonData[b.kanton] = { sum: 0, count: 0 };
    }
    kantonData[b.kanton].sum += b.confidence.total;
    kantonData[b.kanton].count++;
  });

  const kantonAvgs = Object.entries(kantonData)
    .map(([kanton, data]) => ({ kanton, avg: Math.round(data.sum / data.count) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  const kantonChart = document.getElementById('kanton-chart');
  if (kantonChart) {
    kantonChart.innerHTML = kantonAvgs.map(k => `
      <div class="kanton-row">
        <span class="kanton-label">${k.kanton}</span>
        <div class="kanton-bar-track">
          <div class="kanton-bar-fill" style="width: ${k.avg}%"></div>
        </div>
        <span class="kanton-value">${k.avg}%</span>
      </div>
    `).join('');
  }

  // Tasks per assignee
  const assigneeData = {};
  filtered.forEach(b => {
    const assignee = b.assignee || 'Nicht zugewiesen';
    if (!assigneeData[assignee]) {
      assigneeData[assignee] = 0;
    }
    assigneeData[assignee]++;
  });

  const assigneeCounts = Object.entries(assigneeData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const maxAssignee = Math.max(...assigneeCounts.map(a => a.count), 1);
  const assigneeChart = document.getElementById('assignee-chart');
  if (assigneeChart) {
    assigneeChart.innerHTML = assigneeCounts.map(a => `
      <div class="assignee-row">
        <div class="assignee-avatar-small">${getInitials(a.name === 'Nicht zugewiesen' ? '?' : a.name)}</div>
        <span class="assignee-name">${a.name === 'Nicht zugewiesen' ? 'Offen' : a.name.split(' ')[1] || a.name}</span>
        <div class="assignee-bar-track">
          <div class="assignee-bar-fill" style="width: ${(a.count / maxAssignee) * 100}%"></div>
        </div>
        <span class="assignee-value">${a.count}</span>
      </div>
    `).join('');
  }

  // Portfolio distribution
  const portfolioData = {};
  filtered.forEach(b => {
    const portfolio = b.portfolio || 'Unbekannt';
    if (!portfolioData[portfolio]) {
      portfolioData[portfolio] = 0;
    }
    portfolioData[portfolio]++;
  });

  const portfolioCounts = Object.entries(portfolioData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const maxPortfolio = Math.max(...portfolioCounts.map(p => p.count), 1);
  const portfolioChart = document.getElementById('portfolio-chart');
  if (portfolioChart) {
    portfolioChart.innerHTML = portfolioCounts.map(p => `
      <div class="portfolio-row">
        <span class="portfolio-label">${p.name}</span>
        <div class="portfolio-bar-track">
          <div class="portfolio-bar-fill" style="width: ${(p.count / maxPortfolio) * 100}%"></div>
        </div>
        <span class="portfolio-value">${p.count}</span>
      </div>
    `).join('');
  }
}
