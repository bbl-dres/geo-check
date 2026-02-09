-- ============================================================================
-- DATABASE.sql - Geo-Check Supabase Schema
-- ============================================================================
-- PostgreSQL schema for Supabase migration
-- Uses JSONB fields for flexible data structures (Three-Value Pattern)
--
-- Version: 1.1
-- Last updated: 2026-02-02
-- Compatible with: Supabase (PostgreSQL 15+)
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- For future spatial queries

-- ============================================================================
-- CUSTOM TYPES (ENUMS)
-- ============================================================================

-- User roles
CREATE TYPE user_role AS ENUM ('Admin', 'Bearbeiter', 'Leser');

-- Building workflow status
CREATE TYPE kanban_status AS ENUM ('backlog', 'inprogress', 'clarification', 'done');

-- Task priority
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high');

-- Building portfolio type
CREATE TYPE portfolio_type AS ENUM ('Büro', 'Wohnen', 'Öffentlich', 'Industrie', 'Bildung');

-- Error severity level
CREATE TYPE error_level AS ENUM ('error', 'warning', 'info');

-- Event type
CREATE TYPE event_type AS ENUM ('comment', 'assignment', 'detection', 'status', 'correction');

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    initials        CHAR(2) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    role            user_role NOT NULL DEFAULT 'Leser',
    avatar_url      TEXT,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Supabase auth integration
    auth_user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_auth ON users(auth_user_id);

COMMENT ON TABLE users IS 'Application users (BBL team members)';
COMMENT ON COLUMN users.initials IS '2-letter abbreviation for compact display';
COMMENT ON COLUMN users.auth_user_id IS 'Link to Supabase auth.users for authentication';

-- ----------------------------------------------------------------------------
-- Buildings (Main Entity)
-- ----------------------------------------------------------------------------
CREATE TABLE buildings (
    -- Primary identifier (SAP format: XXXX/YYYY/ZZ)
    id              VARCHAR(20) PRIMARY KEY,

    -- Display fields
    name            VARCHAR(255) NOT NULL,
    portfolio       portfolio_type NOT NULL,

    -- Workflow fields
    priority        priority_level NOT NULL DEFAULT 'medium',
    kanban_status   kanban_status NOT NULL DEFAULT 'backlog',
    due_date        DATE,

    -- Assignment (dual-field pattern for FK + denormalized display)
    assignee_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assignee        VARCHAR(100),  -- Denormalized for read performance

    -- GWR linking
    in_gwr          BOOLEAN NOT NULL DEFAULT FALSE,

    -- Denormalized filter columns (derived from comparison_data for query performance)
    kanton          CHAR(2),  -- 2-letter canton code, indexed for filtering

    -- Canonical map coordinates (derived from comparison fields)
    map_lat         DOUBLE PRECISION,
    map_lng         DOUBLE PRECISION,

    -- Confidence scores (JSONB: {total, georef, sap, gwr})
    confidence      JSONB NOT NULL DEFAULT '{"total": 0, "georef": 0, "sap": 0, "gwr": 0}',

    -- Comparison fields using Three-Value Pattern
    -- Each field: {sap, gwr, korrektur, match}
    -- Stored as JSONB for flexibility
    comparison_data JSONB NOT NULL DEFAULT '{}',

    -- Embedded images array (JSONB)
    images          JSONB NOT NULL DEFAULT '[]',

    -- Audit fields
    last_update     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_update_by  VARCHAR(100) NOT NULL DEFAULT 'System',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_lat CHECK (map_lat IS NULL OR (map_lat >= 45.81 AND map_lat <= 47.81)),
    CONSTRAINT valid_lng CHECK (map_lng IS NULL OR (map_lng >= 5.95 AND map_lng <= 10.49)),
    CONSTRAINT valid_confidence CHECK (
        CAST(confidence->>'total' AS int) BETWEEN 0 AND 100 AND
        CAST(confidence->>'georef' AS int) BETWEEN 0 AND 100 AND
        CAST(confidence->>'sap' AS int) BETWEEN 0 AND 100 AND
        CAST(confidence->>'gwr' AS int) BETWEEN 0 AND 100
    )
);

-- Indexes for common queries
CREATE INDEX idx_buildings_assignee ON buildings(assignee_id);
CREATE INDEX idx_buildings_status ON buildings(kanban_status);
CREATE INDEX idx_buildings_priority ON buildings(priority);
CREATE INDEX idx_buildings_portfolio ON buildings(portfolio);
CREATE INDEX idx_buildings_confidence ON buildings(CAST(confidence->>'total' AS int));
CREATE INDEX idx_buildings_coords ON buildings(map_lat, map_lng) WHERE map_lat IS NOT NULL;
CREATE INDEX idx_buildings_kanton ON buildings(kanton) WHERE kanton IS NOT NULL;
CREATE INDEX idx_buildings_due_date ON buildings(due_date) WHERE due_date IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX idx_buildings_comparison_gin ON buildings USING GIN (comparison_data);

-- Full-text search index for building name
CREATE INDEX idx_buildings_name_search ON buildings USING GIN (to_tsvector('german', name));

COMMENT ON TABLE buildings IS 'Federal building records with multi-source data comparison';
COMMENT ON COLUMN buildings.id IS 'SAP property ID (format: XXXX/YYYY/ZZ)';
COMMENT ON COLUMN buildings.comparison_data IS 'JSONB object with Three-Value Pattern fields (country, kanton, gemeinde, etc.)';
COMMENT ON COLUMN buildings.images IS 'JSONB array of image objects [{id, url, filename, uploadDate, uploadedBy, uploadedById}]';

-- ----------------------------------------------------------------------------
-- Validation Rule Sets
-- ----------------------------------------------------------------------------
CREATE TABLE rule_sets (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    entity_type     VARCHAR(50) NOT NULL DEFAULT 'building',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rule_sets IS 'Groupings of validation rules by category';

-- ----------------------------------------------------------------------------
-- Validation Rules
-- ----------------------------------------------------------------------------
CREATE TABLE rules (
    id              VARCHAR(50) PRIMARY KEY,
    rule_set_id     VARCHAR(50) NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    attribute       JSONB NOT NULL,  -- String or array of strings
    operator        VARCHAR(50) NOT NULL,
    value           JSONB,  -- Operator-specific expected value
    severity        error_level NOT NULL DEFAULT 'warning',
    message         TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_set ON rules(rule_set_id);
CREATE INDEX idx_rules_severity ON rules(severity);

COMMENT ON TABLE rules IS 'Validation rules for data quality checks';
COMMENT ON COLUMN rules.attribute IS 'Field name(s) to validate - string or array';
COMMENT ON COLUMN rules.operator IS 'Validation operator: exists, matches, in, between, within_bounds, etc.';

-- ----------------------------------------------------------------------------
-- Validation Errors
-- ----------------------------------------------------------------------------
CREATE TABLE errors (
    id              VARCHAR(50) PRIMARY KEY,  -- Format: err-{buildingId}-{seq}
    building_id     VARCHAR(20) NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    check_id        VARCHAR(50) NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    level           error_level NOT NULL,
    field           VARCHAR(50),  -- Affected field name (optional)
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT error_resolution CHECK (
        (resolved_at IS NULL AND resolved_by_id IS NULL) OR
        (resolved_at IS NOT NULL)
    )
);

CREATE INDEX idx_errors_building ON errors(building_id);
CREATE INDEX idx_errors_level ON errors(level);
CREATE INDEX idx_errors_unresolved ON errors(building_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_errors_check ON errors(check_id);

COMMENT ON TABLE errors IS 'Validation errors detected on buildings';
COMMENT ON COLUMN errors.id IS 'Format: err-{id/→-}-{seq}, e.g. err-1080-2020-AA-001';

-- ----------------------------------------------------------------------------
-- Comments
-- ----------------------------------------------------------------------------
CREATE TABLE comments (
    id              VARCHAR(50) PRIMARY KEY,  -- Format: cmt-{buildingId}-{seq}
    building_id     VARCHAR(20) NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    author_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author          VARCHAR(100) NOT NULL,  -- Denormalized, 'System' for auto-generated
    text            TEXT NOT NULL,
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_building ON comments(building_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);

COMMENT ON TABLE comments IS 'User and system comments on buildings';
COMMENT ON COLUMN comments.id IS 'Format: cmt-{id/→-}-{seq}, e.g. cmt-1080-2020-AA-001';
COMMENT ON COLUMN comments.is_system IS 'TRUE for auto-generated comments';

-- ----------------------------------------------------------------------------
-- Events (Activity Log)
-- ----------------------------------------------------------------------------
CREATE TABLE events (
    id              SERIAL PRIMARY KEY,
    building_id     VARCHAR(20) NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name       VARCHAR(100) NOT NULL,  -- Denormalized, 'System' for auto-generated
    type            event_type NOT NULL,
    action          VARCHAR(100) NOT NULL,  -- German label
    details         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_building ON events(building_id);
CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_created ON events(created_at DESC);

COMMENT ON TABLE events IS 'Activity log for audit trail';
COMMENT ON COLUMN events.action IS 'German action label for display';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Building summary with open error counts
-- ----------------------------------------------------------------------------
CREATE VIEW v_building_summary AS
SELECT
    b.*,
    COALESCE(e.error_count, 0) AS open_error_count,
    COALESCE(e.warning_count, 0) AS open_warning_count,
    u.name AS assignee_name,
    u.initials AS assignee_initials
FROM buildings b
LEFT JOIN users u ON b.assignee_id = u.id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE level = 'error') AS error_count,
        COUNT(*) FILTER (WHERE level = 'warning') AS warning_count
    FROM errors
    WHERE building_id = b.id AND resolved_at IS NULL
) e ON TRUE;

COMMENT ON VIEW v_building_summary IS 'Buildings with aggregated error counts and assignee details';

-- ----------------------------------------------------------------------------
-- User workload summary
-- ----------------------------------------------------------------------------
CREATE VIEW v_user_workload AS
SELECT
    u.id,
    u.name,
    u.initials,
    u.role,
    COUNT(b.id) FILTER (WHERE b.kanban_status != 'done') AS open_tasks,
    COUNT(b.id) FILTER (WHERE b.kanban_status = 'inprogress') AS in_progress,
    COUNT(b.id) FILTER (WHERE b.priority = 'high' AND b.kanban_status != 'done') AS high_priority
FROM users u
LEFT JOIN buildings b ON u.id = b.assignee_id
GROUP BY u.id, u.name, u.initials, u.role;

COMMENT ON VIEW v_user_workload IS 'User task counts for workload management';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Update timestamp trigger function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Sync assignee name when user changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_assignee_name()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.name != NEW.name THEN
        UPDATE buildings SET assignee = NEW.name WHERE assignee_id = NEW.id;
        UPDATE comments SET author = NEW.name WHERE author_id = NEW.id;
        UPDATE events SET user_name = NEW.name WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Generate next comment/error ID
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_comment_id(p_building_id VARCHAR(20))
RETURNS VARCHAR(50) AS $$
DECLARE
    v_seq INTEGER;
    v_bid VARCHAR(20);
BEGIN
    -- Replace slashes with dashes for a unique, URL-safe prefix
    v_bid := REPLACE(p_building_id, '/', '-');

    -- Get next sequence number for this building
    SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE(id, '^.*-(\d+)$', '\1') AS INTEGER)
    ), 0) + 1 INTO v_seq
    FROM comments
    WHERE building_id = p_building_id;

    RETURN 'cmt-' || v_bid || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_error_id(p_building_id VARCHAR(20))
RETURNS VARCHAR(50) AS $$
DECLARE
    v_seq INTEGER;
    v_bid VARCHAR(20);
BEGIN
    -- Replace slashes with dashes for a unique, URL-safe prefix
    v_bid := REPLACE(p_building_id, '/', '-');

    -- Get next sequence number for this building
    SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE(id, '^.*-(\d+)$', '\1') AS INTEGER)
    ), 0) + 1 INTO v_seq
    FROM errors
    WHERE building_id = p_building_id;

    RETURN 'err-' || v_bid || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Derive kanton from comparison data (for filtering performance)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION derive_kanton()
RETURNS TRIGGER AS $$
DECLARE
    v_kanton CHAR(2);
    v_kanton_data JSONB;
BEGIN
    v_kanton_data := NEW.comparison_data->'kanton';

    -- Priority: korrektur > gwr > sap
    IF v_kanton_data IS NOT NULL THEN
        v_kanton := COALESCE(
            NULLIF(v_kanton_data->>'korrektur', ''),
            NULLIF(v_kanton_data->>'gwr', ''),
            NULLIF(v_kanton_data->>'sap', '')
        );
    END IF;

    NEW.kanton := v_kanton;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Derive map coordinates from comparison data
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION derive_map_coordinates()
RETURNS TRIGGER AS $$
DECLARE
    v_lat DOUBLE PRECISION;
    v_lng DOUBLE PRECISION;
    v_lat_data JSONB;
    v_lng_data JSONB;
BEGIN
    v_lat_data := NEW.comparison_data->'lat';
    v_lng_data := NEW.comparison_data->'lng';

    -- Priority: korrektur > gwr > sap
    IF v_lat_data IS NOT NULL THEN
        v_lat := COALESCE(
            NULLIF(v_lat_data->>'korrektur', '')::DOUBLE PRECISION,
            NULLIF(v_lat_data->>'gwr', '')::DOUBLE PRECISION,
            NULLIF(v_lat_data->>'sap', '')::DOUBLE PRECISION
        );
    END IF;

    IF v_lng_data IS NOT NULL THEN
        v_lng := COALESCE(
            NULLIF(v_lng_data->>'korrektur', '')::DOUBLE PRECISION,
            NULLIF(v_lng_data->>'gwr', '')::DOUBLE PRECISION,
            NULLIF(v_lng_data->>'sap', '')::DOUBLE PRECISION
        );
    END IF;

    NEW.map_lat := v_lat;
    NEW.map_lng := v_lng;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps
CREATE TRIGGER tr_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_rule_sets_updated
    BEFORE UPDATE ON rule_sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Sync denormalized user names
CREATE TRIGGER tr_users_name_sync
    AFTER UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION sync_assignee_name();

-- Auto-derive map coordinates and kanton from comparison_data
CREATE TRIGGER tr_buildings_derive_coords
    BEFORE INSERT OR UPDATE OF comparison_data ON buildings
    FOR EACH ROW EXECUTE FUNCTION derive_map_coordinates();

CREATE TRIGGER tr_buildings_derive_kanton
    BEFORE INSERT OR UPDATE OF comparison_data ON buildings
    FOR EACH ROW EXECUTE FUNCTION derive_kanton();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Users policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view all users"
    ON users FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins can manage users"
    ON users FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role = 'Admin'
        )
    );

-- ----------------------------------------------------------------------------
-- Buildings policies
-- ----------------------------------------------------------------------------
CREATE POLICY "All authenticated users can view buildings"
    ON buildings FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Bearbeiter and Admin can modify buildings"
    ON buildings FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role IN ('Admin', 'Bearbeiter')
        )
    );

-- ----------------------------------------------------------------------------
-- Rules policies (read-only for most users)
-- ----------------------------------------------------------------------------
CREATE POLICY "All authenticated users can view rules"
    ON rule_sets FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "All authenticated users can view rule definitions"
    ON rules FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins can manage rules"
    ON rule_sets FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role = 'Admin'
        )
    );

CREATE POLICY "Admins can manage rule definitions"
    ON rules FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role = 'Admin'
        )
    );

-- ----------------------------------------------------------------------------
-- Errors policies
-- ----------------------------------------------------------------------------
CREATE POLICY "All authenticated users can view errors"
    ON errors FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Bearbeiter and Admin can manage errors"
    ON errors FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role IN ('Admin', 'Bearbeiter')
        )
    );

-- ----------------------------------------------------------------------------
-- Comments policies
-- ----------------------------------------------------------------------------
CREATE POLICY "All authenticated users can view comments"
    ON comments FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Bearbeiter and Admin can add comments"
    ON comments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role IN ('Admin', 'Bearbeiter')
        )
    );

-- ----------------------------------------------------------------------------
-- Events policies (read-only, system-generated)
-- ----------------------------------------------------------------------------
CREATE POLICY "All authenticated users can view events"
    ON events FOR SELECT
    TO authenticated
    USING (TRUE);

-- Events INSERT policy for application-level audit logging
-- Uses service role for system-generated events, authenticated for user actions
CREATE POLICY "Bearbeiter and Admin can create events"
    ON events FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role IN ('Admin', 'Bearbeiter')
        )
    );

-- Service role bypass for system-generated events (triggers)
CREATE POLICY "Service role can insert events"
    ON events FOR INSERT
    TO service_role
    WITH CHECK (TRUE);

-- ============================================================================
-- SEED DATA: Code Lists (as reference tables or check constraints)
-- ============================================================================

-- Swiss cantons lookup
CREATE TABLE ref_cantons (
    code    CHAR(2) PRIMARY KEY,
    name_de VARCHAR(50) NOT NULL,
    name_fr VARCHAR(50) NOT NULL,
    name_it VARCHAR(50) NOT NULL
);

INSERT INTO ref_cantons (code, name_de, name_fr, name_it) VALUES
('AG', 'Aargau', 'Argovie', 'Argovia'),
('AI', 'Appenzell Innerrhoden', 'Appenzell Rhodes-Intérieures', 'Appenzello Interno'),
('AR', 'Appenzell Ausserrhoden', 'Appenzell Rhodes-Extérieures', 'Appenzello Esterno'),
('BE', 'Bern', 'Berne', 'Berna'),
('BL', 'Basel-Landschaft', 'Bâle-Campagne', 'Basilea Campagna'),
('BS', 'Basel-Stadt', 'Bâle-Ville', 'Basilea Città'),
('FR', 'Freiburg', 'Fribourg', 'Friburgo'),
('GE', 'Genf', 'Genève', 'Ginevra'),
('GL', 'Glarus', 'Glaris', 'Glarona'),
('GR', 'Graubünden', 'Grisons', 'Grigioni'),
('JU', 'Jura', 'Jura', 'Giura'),
('LU', 'Luzern', 'Lucerne', 'Lucerna'),
('NE', 'Neuenburg', 'Neuchâtel', 'Neuchâtel'),
('NW', 'Nidwalden', 'Nidwald', 'Nidvaldo'),
('OW', 'Obwalden', 'Obwald', 'Obvaldo'),
('SG', 'St. Gallen', 'Saint-Gall', 'San Gallo'),
('SH', 'Schaffhausen', 'Schaffhouse', 'Sciaffusa'),
('SO', 'Solothurn', 'Soleure', 'Soletta'),
('SZ', 'Schwyz', 'Schwyz', 'Svitto'),
('TG', 'Thurgau', 'Thurgovie', 'Turgovia'),
('TI', 'Tessin', 'Tessin', 'Ticino'),
('UR', 'Uri', 'Uri', 'Uri'),
('VD', 'Waadt', 'Vaud', 'Vaud'),
('VS', 'Wallis', 'Valais', 'Vallese'),
('ZG', 'Zug', 'Zoug', 'Zugo'),
('ZH', 'Zürich', 'Zurich', 'Zurigo');

-- Building status codes (GSTAT)
CREATE TABLE ref_gstat (
    code    INTEGER PRIMARY KEY,
    key     VARCHAR(20) NOT NULL UNIQUE,
    name_de VARCHAR(50) NOT NULL
);

INSERT INTO ref_gstat (code, key, name_de) VALUES
(1001, 'projektiert', 'Projektiert'),
(1002, 'bewilligt', 'Bewilligt'),
(1003, 'im_bau', 'Im Bau'),
(1004, 'bestehend', 'Bestehend'),
(1005, 'nicht_nutzbar', 'Nicht nutzbar'),
(1007, 'abgebrochen', 'Abgebrochen'),
(1008, 'nicht_realisiert', 'Nicht realisiert');

-- Construction period codes (GBAUP)
CREATE TABLE ref_gbaup (
    code    INTEGER PRIMARY KEY,
    name_de VARCHAR(50) NOT NULL
);

INSERT INTO ref_gbaup (code, name_de) VALUES
(8011, 'Vor 1919'),
(8012, '1919-1945'),
(8013, '1946-1960'),
(8014, '1961-1970'),
(8015, '1971-1980'),
(8016, '1981-1985'),
(8017, '1986-1990'),
(8018, '1991-1995'),
(8019, '1996-2000'),
(8020, '2001-2005'),
(8021, '2006-2010'),
(8022, '2011-2015'),
(8023, '2016-2020'),
(8024, '2021-2025'),
(8025, 'Nach 2025');

-- ============================================================================
-- SUPABASE STORAGE
-- ============================================================================
-- Configure storage bucket for building images
-- Run via Supabase dashboard SQL editor or use supabase CLI

-- Create storage bucket for building images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'building-images',
    'building-images',
    true,  -- Public read access
    5242880,  -- 5MB max file size
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public read access for building images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'building-images');

CREATE POLICY "Authenticated users can upload building images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'building-images' AND
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role IN ('Admin', 'Bearbeiter')
        )
    );

CREATE POLICY "Admins can delete building images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'building-images' AND
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.auth_user_id = auth.uid() AND u.role = 'Admin'
        )
    );

-- ============================================================================
-- SUPABASE REALTIME
-- ============================================================================
-- Enable realtime subscriptions for collaborative editing
-- Run via Supabase dashboard or CLI

-- Enable realtime for key tables (collaborative updates)
ALTER PUBLICATION supabase_realtime ADD TABLE buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE errors;

-- Note: Realtime can also be enabled via Supabase dashboard:
-- Database > Replication > Select tables to enable

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
/*
Migration from JSON files to Supabase:

1. USERS (users.json → users table)
   - Map existing user names to new user records
   - Create auth.users entries for Supabase Auth
   - Link via auth_user_id

2. BUILDINGS (buildings.json → buildings table)
   - Transform flat comparison fields into comparison_data JSONB
   - Map assignee names to assignee_id via user lookup
   - Images array stays as JSONB
   - kanton column auto-derived via trigger from comparison_data

3. ERRORS (errors.json → errors table)
   - Flatten keyed object to rows with building_id
   - Generate sequential IDs using generate_error_id()

4. COMMENTS (comments.json → comments table)
   - Flatten keyed object to rows with building_id
   - Convert Swiss date format to ISO timestamp
   - Map author names to author_id

5. EVENTS (events.json → events table)
   - Direct insert with user_id lookup
   - Normalize timestamp to TIMESTAMPTZ

6. RULES (rules.json → rule_sets + rules tables)
   - Extract ruleSets to rule_sets table
   - Extract rules with rule_set_id reference

Example building comparison_data structure:
{
  "country": {"sap": "CH", "gwr": "CH", "korrektur": "", "match": true},
  "kanton": {"sap": "TG", "gwr": "TG", "korrektur": "", "match": true},
  "gemeinde": {"sap": "Romanshorn", "gwr": "Romanshorn", "korrektur": "", "match": true},
  "bfsNr": {"sap": "4436", "gwr": "4436", "korrektur": "", "match": true},
  ...
}
*/
