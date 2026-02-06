/**
 * migrate-to-supabase.js
 *
 * Transforms JSON data files and generates SQL for Supabase import.
 * Run with: node scripts/migrate-to-supabase.js
 *
 * Output: scripts/migration.sql (paste into Supabase SQL Editor)
 */

const fs = require('fs');
const path = require('path');

// Paths
const dataDir = path.join(__dirname, '..', 'data');
const outputFile = path.join(__dirname, 'migration.sql');

// Load JSON files
const buildings = JSON.parse(fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf8'));
const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));

// Comparison fields that should be moved into comparison_data JSONB
const comparisonFields = [
    'country', 'kanton', 'gemeinde', 'bfsNr', 'plz', 'ort',
    'strasse', 'hausnummer', 'zusatz', 'egid', 'gkat', 'gklas',
    'gbaup', 'lat', 'lng', 'egrid', 'parcelArea', 'garea'
];

// Create user name to ID mapping
const userNameToId = {};
users.forEach(u => {
    userNameToId[u.name] = u.id;
});

// Escape single quotes for SQL
function esc(str) {
    if (str === null || str === undefined) return 'NULL';
    return `'${String(str).replace(/'/g, "''")}'`;
}

// Convert JS object to JSONB literal
function toJsonb(obj) {
    if (obj === null || obj === undefined) return "'{}'::jsonb";
    return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

// Build SQL
let sql = `-- ============================================================================
-- Migration Script - Generated ${new Date().toISOString()}
-- ============================================================================
-- Run this in the Supabase SQL Editor to import test data
-- ============================================================================

-- ============================================================================
-- USERS (skip if you already have users)
-- ============================================================================
-- Note: These users won't have auth_user_id linked yet.
-- You'll need to create auth users separately and update the link.

`;

// Generate users INSERT
users.forEach(user => {
    sql += `INSERT INTO users (id, name, initials, role, last_login) VALUES (
    ${user.id},
    ${esc(user.name)},
    ${esc(user.initials)},
    ${esc(user.role)},
    ${user.lastLogin ? esc(user.lastLogin) : 'NULL'}
) ON CONFLICT (id) DO NOTHING;\n\n`;
});

sql += `-- Reset user sequence
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ============================================================================
-- BUILDINGS
-- ============================================================================

`;

// Generate buildings INSERT
buildings.forEach(building => {
    // Extract comparison fields into comparison_data
    const comparisonData = {};
    comparisonFields.forEach(field => {
        if (building[field] && typeof building[field] === 'object') {
            comparisonData[field] = building[field];
        }
    });

    // Get assignee_id from name
    const assigneeId = building.assignee ? userNameToId[building.assignee] : null;

    // Derive kanton from comparison data (same logic as trigger)
    const kantonData = comparisonData.kanton;
    const kantonValue = kantonData
        ? (kantonData.korrektur || kantonData.gwr || kantonData.sap || null)
        : null;

    sql += `INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    ${esc(building.id)},
    ${esc(building.name)},
    ${esc(building.portfolio)},
    ${esc(building.priority)},
    ${toJsonb(building.confidence || { total: 0, georef: 0, sap: 0, gwr: 0 })},
    ${assigneeId || 'NULL'},
    ${esc(building.assignee)},
    ${esc(building.kanbanStatus)},
    ${building.dueDate ? esc(building.dueDate) : 'NULL'},
    ${building.lastUpdate ? esc(building.lastUpdate) : 'NOW()'},
    ${esc(building.lastUpdateBy || 'System')},
    ${building.inGwr ? 'TRUE' : 'FALSE'},
    ${building.gwrEgid ? esc(building.gwrEgid) : 'NULL'},
    ${building.mapLat || 'NULL'},
    ${building.mapLng || 'NULL'},
    ${kantonValue ? esc(kantonValue) : 'NULL'},
    ${toJsonb(comparisonData)},
    ${toJsonb(building.images || [])}
);\n\n`;
});

sql += `-- ============================================================================
-- VERIFY IMPORT
-- ============================================================================
SELECT 'Users:' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Buildings:', COUNT(*) FROM buildings;
`;

// Write output
fs.writeFileSync(outputFile, sql, 'utf8');

console.log(`Migration SQL generated: ${outputFile}`);
console.log(`- ${users.length} users`);
console.log(`- ${buildings.length} buildings`);
console.log(`\nNext steps:`);
console.log(`1. Open Supabase Dashboard > SQL Editor`);
console.log(`2. Paste the contents of scripts/migration.sql`);
console.log(`3. Run the query`);
