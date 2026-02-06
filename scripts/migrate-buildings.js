/**
 * Migration script: Transform buildings.json to new data structure
 *
 * Changes:
 * - Add inGwr (boolean): true if building has GWR data
 * - Add gwrEgid (string): EGID for GWR lookup (from egid.gwr)
 * - Add mapLat/mapLng (number): coordinates for map display (from lat.value/lng.value)
 * - Rename field.value → field.korrektur (set to empty string)
 */

const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'data', 'buildings.json');
const outputPath = path.join(__dirname, '..', 'data', 'buildings.json');

// Fields that have the { sap, gwr, value, match } structure
const DATA_FIELDS = [
  'country', 'kanton', 'gemeinde', 'plz', 'ort', 'strasse', 'hausnummer',
  'zusatz', 'egid', 'gkat', 'gklas', 'gbaup', 'lat', 'lng', 'egrid',
  'parcelArea', 'garea'
];

function migrateBuilding(building) {
  // Determine if building has GWR data (check if egid.gwr has a value)
  const hasGwrData = building.egid && building.egid.gwr && building.egid.gwr.trim() !== '';

  // Extract map coordinates from current lat/lng values
  const mapLat = building.lat && building.lat.value ? parseFloat(building.lat.value) : null;
  const mapLng = building.lng && building.lng.value ? parseFloat(building.lng.value) : null;

  // Extract EGID for GWR lookup
  const gwrEgid = building.egid && building.egid.gwr ? building.egid.gwr : '';

  // Create new building object with new fields at the top
  const migrated = {
    id: building.id,
    name: building.name,
    portfolio: building.portfolio,
    priority: building.priority,
    confidence: building.confidence,
    assignee: building.assignee,
    kanbanStatus: building.kanbanStatus,
    dueDate: building.dueDate,
    lastUpdate: building.lastUpdate,
    lastUpdateBy: building.lastUpdateBy,

    // NEW FIELDS
    inGwr: hasGwrData,
    gwrEgid: gwrEgid,
    mapLat: mapLat,
    mapLng: mapLng
  };

  // Transform data fields: rename value → korrektur (set to empty)
  for (const field of DATA_FIELDS) {
    if (building[field]) {
      migrated[field] = {
        sap: building[field].sap || '',
        gwr: building[field].gwr || '',
        korrektur: '',  // Empty by default - user enters corrections
        match: building[field].match || false
      };
    }
  }

  // Copy other fields (images, comments, errors)
  if (building.images) {
    migrated.images = building.images;
  }
  if (building.comments) {
    migrated.comments = building.comments;
  }
  if (building.errors) {
    migrated.errors = building.errors;
  }

  return migrated;
}

// Read, transform, and write
const buildings = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const migratedBuildings = buildings.map(migrateBuilding);

fs.writeFileSync(outputPath, JSON.stringify(migratedBuildings, null, 2));

console.log(`Migrated ${migratedBuildings.length} buildings`);
console.log('New fields added: inGwr, gwrEgid, mapLat, mapLng');
console.log('Field structure changed: value → korrektur (set to empty)');
