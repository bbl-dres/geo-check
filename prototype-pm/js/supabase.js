/**
 * supabase.js - Static Demo Data Layer
 *
 * Replaces Supabase with static JSON files for read-only demo mode.
 * All mutations (status, assignee, comments, etc.) operate in-memory only.
 */

// =============================================================================
// CONFIGURATION (kept for backwards-compat with imports)
// =============================================================================

const SUPABASE_URL = '';
const SUPABASE_KEY = '';

// No-op: Supabase client is not needed in demo mode
export function initSupabase() { return null; }
export function getSupabase() { return null; }

// =============================================================================
// DATA LOADING (from static JSON files)
// =============================================================================

/**
 * Load all application data from static JSON files in data/
 */
export async function loadAllData() {
    const [
        buildingsRaw,
        usersRaw,
        eventsRaw,
        commentsRaw,
        errorsRaw,
        rulesJsonResult
    ] = await Promise.all([
        fetch('data/buildings.json').then(r => r.json()),
        fetch('data/users.json').then(r => r.json()),
        fetch('data/events.json').then(r => r.json()),
        fetch('data/comments.json').then(r => r.json()),
        fetch('data/errors.json').then(r => r.json()),
        fetch('data/rules.json').then(r => r.json()).catch(() => null)
    ]);

    const buildings = transformBuildingsFromDB(buildingsRaw, commentsRaw, errorsRaw);
    const teamMembers = transformUsersFromDB(usersRaw);

    const eventsFlat = transformEventsFromDB(eventsRaw);
    const eventsData = {};
    eventsFlat.forEach(e => {
        if (!eventsData[e.buildingId]) eventsData[e.buildingId] = [];
        eventsData[e.buildingId].push(e);
    });

    const commentsData = keyByBuildingId(commentsRaw);
    const errorsData = keyByBuildingId(errorsRaw);
    const rulesConfig = rulesJsonResult;

    return {
        buildings,
        teamMembers,
        eventsData,
        commentsData,
        errorsData,
        rulesConfig
    };
}

// =============================================================================
// TARGETED EXPORT QUERIES (demo: use in-memory data)
// =============================================================================

export async function fetchAllRows(table, select = '*', onProgress) {
    const data = await fetch(`data/${table}.json`).then(r => r.json());
    if (onProgress) onProgress(data.length, data.length);
    return data;
}

export async function fetchErrorsForExport(onProgress) {
    const [errors, buildingsRaw] = await Promise.all([
        fetch('data/errors.json').then(r => r.json()),
        fetch('data/buildings.json').then(r => r.json())
    ]);

    if (onProgress) onProgress(errors.length, errors.length);

    return {
        errors: keyByBuildingId(errors),
        buildings: buildingsRaw.map(b => ({ id: b.id, name: b.name }))
    };
}

export async function fetchEventsForExport() {
    const events = await fetch('data/events.json').then(r => r.json());
    return transformEventsFromDB(events);
}

// =============================================================================
// DATA TRANSFORMATIONS (DB → App Format)
// =============================================================================

function transformBuildingsFromDB(buildings, comments, errors) {
    const commentsByBuilding = keyByBuildingId(comments);
    const errorsByBuilding = keyByBuildingId(errors);

    return buildings.map(b => ({
        id: b.id,
        name: b.name,
        portfolio: b.portfolio,
        priority: b.priority,
        confidence: b.confidence || { total: 0, georef: 0, sap: 0, gwr: 0 },
        assignee: b.assignee,
        assigneeId: b.assignee_id,
        kanbanStatus: b.kanban_status,
        dueDate: b.due_date,
        lastUpdate: b.last_update,
        lastUpdateBy: b.last_update_by,
        inGwr: b.in_gwr,
        mapLat: b.map_lat,
        mapLng: b.map_lng,
        images: b.images || [],
        country: b.country,
        kanton: b.kanton,
        gemeinde: b.gemeinde,
        bfsNr: b.bfs_nr,
        plz: b.plz,
        ort: b.ort,
        strasse: b.strasse,
        hausnummer: b.hausnummer,
        zusatz: b.zusatz,
        egid: b.egid,
        egrid: b.egrid,
        lat: b.lat,
        lng: b.lng,
        gkat: b.gkat,
        gklas: b.gklas,
        gstat: b.gstat,
        gbaup: b.gbaup,
        gbauj: b.gbauj,
        gastw: b.gastw,
        ganzwhg: b.ganzwhg,
        garea: b.garea,
        parcelArea: b.parcel_area,
        comments: transformCommentsForBuilding(commentsByBuilding[b.id] || []),
        errors: transformErrorsForBuilding(errorsByBuilding[b.id] || [])
    }));
}

function transformCommentsForBuilding(comments) {
    return comments.map(c => ({
        id: c.id,
        author: c.author,
        authorId: c.author_id,
        timestamp: c.created_at,
        text: c.text,
        system: c.is_system
    }));
}

function transformErrorsForBuilding(errors) {
    return errors.map(e => ({
        id: e.id,
        checkId: e.check_id,
        description: e.description,
        level: e.level,
        field: e.field,
        detectedAt: e.detected_at,
        resolvedAt: e.resolved_at
    }));
}

function transformUsersFromDB(users) {
    return users.map(u => ({
        id: u.id,
        name: u.name,
        initials: u.initials,
        role: u.role,
        email: u.email,
        avatarUrl: u.avatar_url,
        lastLogin: u.last_login,
        authUserId: u.auth_user_id
    }));
}

function transformEventsFromDB(events) {
    return events.map(e => ({
        id: e.id,
        buildingId: e.building_id,
        type: e.type,
        action: e.action,
        user: e.user_name,
        userId: e.user_id,
        timestamp: e.created_at,
        details: e.details
    }));
}

// =============================================================================
// MUTATIONS (In-Memory Only — Demo Mode)
// =============================================================================

export async function updateBuildingStatus(buildingId, newStatus, userId, userName) {
    console.log(`[Demo] Status update: ${buildingId} → ${newStatus}`);
}

export async function updateBuildingAssignee(buildingId, assigneeId, assigneeName, userId, userName) {
    console.log(`[Demo] Assignee update: ${buildingId} → ${assigneeName || 'unassigned'}`);
}

export async function updateBuildingPriority(buildingId, newPriority, userId, userName) {
    console.log(`[Demo] Priority update: ${buildingId} → ${newPriority}`);
}

export async function updateBuildingDueDate(buildingId, newDueDate, userId, userName) {
    console.log(`[Demo] Due date update: ${buildingId} → ${newDueDate}`);
}

export async function updateBuildingComparisonData(buildingId, comparisonData, userId, userName) {
    console.log(`[Demo] Comparison data update: ${buildingId}`, comparisonData);
}

export async function addComment(buildingId, text, userId, userName) {
    const commentId = `cmt-demo-${Date.now()}`;
    console.log(`[Demo] Comment added: ${buildingId} — ${text}`);

    return {
        id: commentId,
        author: userName,
        authorId: userId,
        timestamp: new Date().toISOString(),
        text: text,
        system: false
    };
}

export async function uploadImage(buildingId, file, userId, userName) {
    console.log(`[Demo] Image upload (simulated): ${buildingId} — ${file.name}`);

    return {
        id: `img-demo-${Date.now()}`,
        url: URL.createObjectURL(file),
        filename: file.name,
        uploadDate: new Date().toISOString(),
        uploadedBy: userName,
        uploadedById: userId
    };
}

export function buildGwrUpdateRow(buildingId, building, gwrData) {
    console.log(`[Demo] GWR update row built for: ${buildingId}`);
    return { id: buildingId };
}

export async function batchUpdateBuildingGwrFields(rows) {
    console.log(`[Demo] GWR batch update (${rows.length} rows) — no-op`);
}

export async function updateBuildingGwrFields(buildingId, building, gwrData) {
    console.log(`[Demo] GWR fields update: ${buildingId} — no-op`);
}

// =============================================================================
// USER MANAGEMENT (Demo No-ops)
// =============================================================================

export async function updateUserLastLogin(userId) {
    console.log(`[Demo] User last login: ${userId}`);
}

export async function updateUserRole(userId, newRole) {
    console.log(`[Demo] User role update: ${userId} → ${newRole}`);
    return { id: userId, role: newRole };
}

export async function removeUser(userId) {
    console.log(`[Demo] User removed: ${userId}`);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function keyByBuildingId(items) {
    const result = {};
    for (const item of items) {
        const key = item.building_id;
        if (!result[key]) {
            result[key] = [];
        }
        result[key].push(item);
    }
    return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    SUPABASE_URL,
    SUPABASE_KEY,
    transformBuildingsFromDB,
    transformUsersFromDB,
    transformEventsFromDB,
    keyByBuildingId
};
