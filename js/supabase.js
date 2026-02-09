/**
 * supabase.js - Supabase Client & Database Queries
 *
 * Handles all Supabase interactions: client setup, database queries,
 * and data transformation between Supabase and app formats.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = 'https://acjpfhljskbkyugnslgj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5JfXtTuHbeP75ejux9bSMg_CGoFCAHL';

// Initialize Supabase client (loaded via CDN in index.html)
let supabase = null;

/**
 * Initialize the Supabase client
 * Must be called after the Supabase SDK is loaded
 */
export function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase SDK not loaded. Include the CDN script in index.html');
        return null;
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    });

    return supabase;
}

/**
 * Get the Supabase client instance
 */
export function getSupabase() {
    if (!supabase) {
        return initSupabase();
    }
    return supabase;
}

// =============================================================================
// DATA LOADING
// =============================================================================

/**
 * Fetch all rows from a table, paginating past the 1000-row default limit.
 * Returns { data, error } matching the Supabase query result shape.
 */
async function fetchAllRows(client, table, pageSize = 1000) {
    let allData = [];
    let from = 0;
    while (true) {
        const { data, error } = await client
            .from(table)
            .select('*')
            .range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break; // last page
        from += pageSize;
    }
    return { data: allData, error: null };
}

/**
 * Load all application data from Supabase
 * Replaces the JSON file fetches in main.js
 */
export async function loadAllData() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not initialized');

    // Fetch all data in parallel
    // Note: Supabase default limit is 1000 rows. Use .range() for larger tables.
    const [
        buildingsResult,
        usersResult,
        eventsResult,
        commentsResult,
        errorsResult,
        rulesJsonResult
    ] = await Promise.all([
        fetchAllRows(client, 'buildings'),
        client.from('users').select('*'),
        client.from('events').select('*').order('created_at', { ascending: false }).range(0, 9999),
        client.from('comments').select('*').order('created_at', { ascending: false }).range(0, 49999),
        fetchAllRows(client, 'errors'),
        fetch('data/rules.json').then(r => r.json()).catch(() => null)
    ]);

    // Check for errors
    const errors = [
        buildingsResult.error,
        usersResult.error,
        eventsResult.error,
        commentsResult.error,
        errorsResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
        console.error('Supabase fetch errors:', errors);
        throw new Error('Failed to load data from Supabase');
    }

    // Transform data to match existing app format
    const buildings = transformBuildingsFromDB(
        buildingsResult.data,
        commentsResult.data,
        errorsResult.data
    );

    const teamMembers = transformUsersFromDB(usersResult.data);
    const eventsData = transformEventsFromDB(eventsResult.data);
    const rulesConfig = rulesJsonResult;

    // Also return raw keyed data for backwards compatibility
    const commentsData = keyByBuildingId(commentsResult.data);
    const errorsData = keyByBuildingId(errorsResult.data);

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
// TARGETED EXPORT QUERIES
// =============================================================================

/**
 * Fetch fresh errors data for CSV export
 * Returns { errors (keyed by building_id), buildings (id + name list) }
 */
export async function fetchErrorsForExport() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not initialized');

    const [errorsResult, buildingsResult] = await Promise.all([
        client.from('errors').select('*'),
        client.from('buildings').select('id, name')
    ]);

    if (errorsResult.error) throw errorsResult.error;
    if (buildingsResult.error) throw buildingsResult.error;

    return {
        errors: keyByBuildingId(errorsResult.data),
        buildings: buildingsResult.data
    };
}

/**
 * Fetch fresh events data for CSV export
 * Returns transformed array matching app format
 */
export async function fetchEventsForExport() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not initialized');

    const { data, error } = await client
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;

    return transformEventsFromDB(data);
}

// =============================================================================
// DATA TRANSFORMATIONS (DB → App Format)
// =============================================================================

/**
 * Transform buildings from DB format to app format
 * Maps snake_case DB columns to camelCase, enriches with comments and errors
 */
function transformBuildingsFromDB(buildings, comments, errors) {
    // Key comments and errors by building_id for quick lookup
    const commentsByBuilding = keyByBuildingId(comments);
    const errorsByBuilding = keyByBuildingId(errors);

    return buildings.map(b => {
        // Transform to app format
        const building = {
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

            // Source comparison fields (individual JSONB columns)
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

            // Attach related data
            comments: transformCommentsForBuilding(commentsByBuilding[b.id] || []),
            errors: transformErrorsForBuilding(errorsByBuilding[b.id] || [])
        };

        return building;
    });
}

/**
 * Transform comments from DB format to app format
 */
function transformCommentsForBuilding(comments) {
    return comments.map(c => ({
        id: c.id,
        author: c.author,
        authorId: c.author_id,
        date: formatSwissDate(c.created_at),
        text: c.text,
        system: c.is_system
    }));
}

/**
 * Transform errors from DB format to app format
 */
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

/**
 * Transform users from DB format to app format
 */
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

/**
 * Transform events from DB format to app format
 */
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

/**
 * Transform rules from DB format to app format
 */
function transformRulesFromDB(ruleSets, rules) {
    return {
        version: '1.0',
        description: 'Validation rules from Supabase',
        ruleSets: ruleSets.map(rs => ({
            id: rs.id,
            name: rs.name,
            description: rs.description,
            enabled: rs.enabled,
            entityType: rs.entity_type,
            rules: rules
                .filter(r => r.rule_set_id === rs.id)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    attribute: r.attribute,
                    operator: r.operator,
                    value: r.value,
                    severity: r.severity,
                    message: r.message,
                    enabled: r.enabled
                }))
        }))
    };
}

// =============================================================================
// MUTATIONS (Write Operations)
// =============================================================================

/**
 * Update building status (kanban drag-drop)
 */
export async function updateBuildingStatus(buildingId, newStatus, userId, userName) {
    const client = getSupabase();

    const { error } = await client
        .from('buildings')
        .update({
            kanban_status: newStatus,
            last_update: new Date().toISOString(),
            last_update_by: userName
        })
        .eq('id', buildingId);

    if (error) throw error;

    // Log event
    await logEvent(buildingId, 'status', 'Status geändert', userId, userName,
        `Status geändert zu: ${newStatus}`);
}

/**
 * Update building assignee
 */
export async function updateBuildingAssignee(buildingId, assigneeId, assigneeName, userId, userName) {
    const client = getSupabase();

    const { error } = await client
        .from('buildings')
        .update({
            assignee_id: assigneeId,
            assignee: assigneeName,
            last_update: new Date().toISOString(),
            last_update_by: userName
        })
        .eq('id', buildingId);

    if (error) throw error;

    // Log event
    await logEvent(buildingId, 'assignment', 'Zugewiesen', userId, userName,
        assigneeName ? `Zugewiesen an: ${assigneeName}` : 'Zuweisung entfernt');
}

/**
 * Update building priority
 */
export async function updateBuildingPriority(buildingId, newPriority, userId, userName) {
    const client = getSupabase();

    const { error } = await client
        .from('buildings')
        .update({
            priority: newPriority,
            last_update: new Date().toISOString(),
            last_update_by: userName
        })
        .eq('id', buildingId);

    if (error) throw error;
}

/**
 * Update building due date
 */
export async function updateBuildingDueDate(buildingId, newDueDate, userId, userName) {
    const client = getSupabase();

    const { error } = await client
        .from('buildings')
        .update({
            due_date: newDueDate,
            last_update: new Date().toISOString(),
            last_update_by: userName
        })
        .eq('id', buildingId);

    if (error) throw error;
}

/**
 * Update building comparison data (corrections)
 */
/** Map camelCase app field names to snake_case DB column names */
const FIELD_TO_COLUMN = {
    bfsNr: 'bfs_nr',
    parcelArea: 'parcel_area'
};

export async function updateBuildingComparisonData(buildingId, comparisonData, userId, userName) {
    const client = getSupabase();

    // Map camelCase keys to snake_case DB columns
    const updatePayload = { last_update: new Date().toISOString(), last_update_by: userName };
    for (const [key, value] of Object.entries(comparisonData)) {
        const column = FIELD_TO_COLUMN[key] || key;
        updatePayload[column] = value;
    }

    const { error } = await client
        .from('buildings')
        .update(updatePayload)
        .eq('id', buildingId);

    if (error) throw error;

    // Log event
    await logEvent(buildingId, 'correction', 'Korrektur angewendet', userId, userName,
        'Datenkorrektur gespeichert');
}

/**
 * Update a building's GWR fields from Swisstopo API data.
 * Updates each JSONB column's gwr value and recalculates match.
 * @param {string} buildingId
 * @param {Object} building - Current building data (from state)
 * @param {Object|null} gwrData - Mapped GWR values (null = not found in GWR)
 */
export async function updateBuildingGwrFields(buildingId, building, gwrData) {
    const client = getSupabase();

    if (!gwrData) {
        // Not found in GWR — set in_gwr = false
        await client.from('buildings').update({ in_gwr: false }).eq('id', buildingId);
        return;
    }

    // Fields to update: map app camelCase key → DB snake_case column
    const fieldMap = {
        egid: 'egid', egrid: 'egrid', plz: 'plz', ort: 'ort',
        strasse: 'strasse', hausnummer: 'hausnummer', gemeinde: 'gemeinde',
        bfsNr: 'bfs_nr', kanton: 'kanton', country: 'country', zusatz: 'zusatz',
        gstat: 'gstat', gkat: 'gkat', gklas: 'gklas', gbaup: 'gbaup',
        gbauj: 'gbauj', gastw: 'gastw', ganzwhg: 'ganzwhg', garea: 'garea',
        parcelArea: 'parcel_area', lat: 'lat', lng: 'lng'
    };

    const update = { in_gwr: true };

    for (const [appKey, dbCol] of Object.entries(fieldMap)) {
        const current = building[appKey];
        const gwrVal = gwrData[appKey] ?? '';

        if (current && typeof current === 'object' && 'sap' in current) {
            const sap = current.sap || '';
            const korrektur = current.korrektur || '';
            const gwr = String(gwrVal);
            // Match: both empty = true, otherwise exact string comparison
            const match = (!sap && !gwr) || sap === gwr;
            update[dbCol] = { sap, gwr, korrektur, match };
        }
    }

    const { error } = await client
        .from('buildings')
        .update(update)
        .eq('id', buildingId);

    if (error) {
        console.error(`GWR update failed for ${buildingId}:`, error);
        throw error;
    }
}

/**
 * Add a comment to a building
 */
export async function addComment(buildingId, text, userId, userName) {
    const client = getSupabase();

    // Generate comment ID
    const { data: idData } = await client.rpc('generate_comment_id', {
        p_building_id: buildingId
    });

    const commentId = idData || `cmt-${buildingId.split('/')[0]}-${Date.now()}`;

    const { error } = await client
        .from('comments')
        .insert({
            id: commentId,
            building_id: buildingId,
            author_id: userId,
            author: userName,
            text: text,
            is_system: false
        });

    if (error) throw error;

    // Log event
    await logEvent(buildingId, 'comment', 'Kommentar hinzugefügt', userId, userName, text);

    return {
        id: commentId,
        author: userName,
        authorId: userId,
        date: formatSwissDate(new Date().toISOString()),
        text: text,
        system: false
    };
}

/**
 * Log an event to the activity log
 */
async function logEvent(buildingId, type, action, userId, userName, details) {
    const client = getSupabase();

    const { error } = await client
        .from('events')
        .insert({
            building_id: buildingId,
            user_id: userId,
            user_name: userName || 'System',
            type: type,
            action: action,
            details: details
        });

    if (error) {
        console.error('Failed to log event:', error);
        // Don't throw - event logging shouldn't break the main operation
    }
}

/**
 * Upload an image to Supabase Storage
 */
export async function uploadImage(buildingId, file, userId, userName) {
    const client = getSupabase();

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${buildingId}/${Date.now()}.${ext}`;

    // Upload to storage
    const { data, error } = await client.storage
        .from('building-images')
        .upload(filename, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = client.storage
        .from('building-images')
        .getPublicUrl(filename);

    const imageObj = {
        id: `img-${Date.now()}`,
        url: urlData.publicUrl,
        filename: file.name,
        uploadDate: new Date().toISOString(),
        uploadedBy: userName,
        uploadedById: userId
    };

    // Update building's images array
    const { data: building } = await client
        .from('buildings')
        .select('images')
        .eq('id', buildingId)
        .single();

    const images = [...(building?.images || []), imageObj];

    const { error: updateError } = await client
        .from('buildings')
        .update({ images })
        .eq('id', buildingId);

    if (updateError) throw updateError;

    return imageObj;
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

/**
 * Subscribe to building changes
 */
export function subscribeToBuildingChanges(callback) {
    const client = getSupabase();

    return client
        .channel('buildings-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'buildings' },
            (payload) => callback(payload)
        )
        .subscribe();
}

/**
 * Subscribe to comment changes
 */
export function subscribeToCommentChanges(callback) {
    const client = getSupabase();

    return client
        .channel('comments-changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'comments' },
            (payload) => callback(payload)
        )
        .subscribe();
}

/**
 * Subscribe to event changes (activity feed)
 */
export function subscribeToEventChanges(callback) {
    const client = getSupabase();

    return client
        .channel('events-changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'events' },
            (payload) => callback(payload)
        )
        .subscribe();
}

// =============================================================================
// USER MANAGEMENT
// =============================================================================

/**
 * Update user's last login timestamp
 */
export async function updateUserLastLogin(userId) {
    const client = getSupabase();
    if (!client) return;

    const { error } = await client
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId);

    if (error) {
        console.error('Error updating last login:', error);
    }
}

/**
 * Update user role
 */
export async function updateUserRole(userId, newRole) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not available');

    const { data, error } = await client
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Remove user from project (delete from users table)
 */
export async function removeUser(userId) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not available');

    const { error } = await client
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        throw error;
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Key an array of objects by building_id
 */
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

/**
 * Format ISO date to Swiss format (dd.mm.yyyy)
 */
function formatSwissDate(isoDate) {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('de-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    SUPABASE_URL,
    SUPABASE_KEY
};
