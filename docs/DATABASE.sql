-- ============================================================================
-- DATABASE.sql - Geo-Check Supabase Schema
-- ============================================================================
-- PostgreSQL schema for Supabase migration
-- Uses JSONB fields for flexible data structures (Three-Value Pattern)
--
-- Version: 1.3
-- Last updated: 2026-02-09
-- Compatible with: Supabase (PostgreSQL 15+)
-- ============================================================================

-- ============================================================================
-- DROP EXISTING OBJECTS
-- ============================================================================

-- Realtime publication (ignore errors if tables not yet added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE buildings, comments, events, errors;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Storage policies
DROP POLICY IF EXISTS "Public read access for building images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload building images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete building images" ON storage.objects;

-- Storage bucket
DELETE FROM storage.buckets WHERE id = 'building-images';

-- RLS policies on app tables
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users','buildings','rule_sets','rules','errors','comments','events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Views
DROP VIEW IF EXISTS v_user_workload CASCADE;
DROP VIEW IF EXISTS v_building_summary CASCADE;

-- Tables (order respects foreign key dependencies)
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS errors CASCADE;
DROP TABLE IF EXISTS rules CASCADE;
DROP TABLE IF EXISTS rule_sets CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Reference tables
DROP TABLE IF EXISTS ref_gheiz CASCADE;
DROP TABLE IF EXISTS ref_gwaerzh1 CASCADE;
DROP TABLE IF EXISTS ref_genh1 CASCADE;
DROP TABLE IF EXISTS ref_gklas CASCADE;
DROP TABLE IF EXISTS ref_gkat CASCADE;
DROP TABLE IF EXISTS ref_gbaup CASCADE;
DROP TABLE IF EXISTS ref_gstat CASCADE;
DROP TABLE IF EXISTS ref_cantons CASCADE;

-- Functions
DROP FUNCTION IF EXISTS update_updated_at CASCADE;
DROP FUNCTION IF EXISTS sync_assignee_name CASCADE;
DROP FUNCTION IF EXISTS generate_comment_id CASCADE;
DROP FUNCTION IF EXISTS generate_error_id CASCADE;
DROP FUNCTION IF EXISTS derive_kanton CASCADE;
DROP FUNCTION IF EXISTS derive_map_coordinates CASCADE;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- For future spatial queries

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
    role            VARCHAR(50) NOT NULL DEFAULT 'Leser',
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
    portfolio       VARCHAR(50) NOT NULL,

    -- Workflow fields
    priority        VARCHAR(20) NOT NULL DEFAULT 'medium',
    kanban_status   VARCHAR(20) NOT NULL DEFAULT 'backlog',
    due_date        DATE,

    -- Assignment (dual-field pattern for FK + denormalized display)
    assignee_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assignee        VARCHAR(100),  -- Denormalized for read performance

    -- GWR linking
    in_gwr          BOOLEAN NOT NULL DEFAULT FALSE,

    -- Confidence scores (JSONB: {total, georef, sap, gwr})
    confidence      JSONB NOT NULL DEFAULT '{"total": 0, "georef": 0, "sap": 0, "gwr": 0}',

    -- ----------------------------------------------------------------
    -- Comparison fields — Three-Value Pattern (TVP)
    -- Each column: JSONB {sap, gwr, korrektur, match}
    -- ----------------------------------------------------------------

    -- Address fields
    country         JSONB NOT NULL DEFAULT '{}',
    kanton          JSONB NOT NULL DEFAULT '{}',
    gemeinde        JSONB NOT NULL DEFAULT '{}',
    bfs_nr          JSONB NOT NULL DEFAULT '{}',  -- DATABASE.md: bfsNr
    plz             JSONB NOT NULL DEFAULT '{}',
    ort             JSONB NOT NULL DEFAULT '{}',
    strasse         JSONB NOT NULL DEFAULT '{}',
    hausnummer      JSONB NOT NULL DEFAULT '{}',
    zusatz          JSONB NOT NULL DEFAULT '{}',

    -- Building identifiers
    egid            JSONB NOT NULL DEFAULT '{}',
    egrid           JSONB NOT NULL DEFAULT '{}',
    lat             JSONB NOT NULL DEFAULT '{}',
    lng             JSONB NOT NULL DEFAULT '{}',

    -- Building classification
    gkat            JSONB NOT NULL DEFAULT '{}',
    gklas           JSONB NOT NULL DEFAULT '{}',
    gstat           JSONB NOT NULL DEFAULT '{}',
    gbaup           JSONB NOT NULL DEFAULT '{}',
    gbauj           JSONB NOT NULL DEFAULT '{}',

    -- Bemessungen (measurements)
    gastw           JSONB NOT NULL DEFAULT '{}',
    ganzwhg         JSONB NOT NULL DEFAULT '{}',
    garea           JSONB NOT NULL DEFAULT '{}',
    parcel_area     JSONB NOT NULL DEFAULT '{}',  -- DATABASE.md: parcelArea

    -- ----------------------------------------------------------------
    -- Denormalized columns (derived via triggers for query performance)
    -- ----------------------------------------------------------------
    kanton_code     CHAR(2),      -- Derived from kanton TVP (korrektur > gwr > sap)
    map_lat         DOUBLE PRECISION,  -- Derived from lat TVP
    map_lng         DOUBLE PRECISION,  -- Derived from lng TVP

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
CREATE INDEX idx_buildings_kanton ON buildings(kanton_code) WHERE kanton_code IS NOT NULL;
CREATE INDEX idx_buildings_due_date ON buildings(due_date) WHERE due_date IS NOT NULL;

-- Full-text search index for building name
CREATE INDEX idx_buildings_name_search ON buildings USING GIN (to_tsvector('german', name));

COMMENT ON TABLE buildings IS 'Federal building records with multi-source data comparison';
COMMENT ON COLUMN buildings.id IS 'SAP property ID (format: XXXX/YYYY/ZZ)';
COMMENT ON COLUMN buildings.kanton_code IS 'Denormalized 2-letter canton code derived from kanton TVP via trigger';
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
    severity        VARCHAR(20) NOT NULL DEFAULT 'warning',
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
    level           VARCHAR(20) NOT NULL,
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
    type            VARCHAR(50) NOT NULL,
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
-- Derive kanton_code from kanton TVP column (for filtering performance)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION derive_kanton()
RETURNS TRIGGER AS $$
BEGIN
    -- Priority: korrektur > gwr > sap
    NEW.kanton_code := COALESCE(
        NULLIF(NEW.kanton->>'korrektur', ''),
        NULLIF(NEW.kanton->>'gwr', ''),
        NULLIF(NEW.kanton->>'sap', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Derive map_lat/map_lng from lat/lng TVP columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION derive_map_coordinates()
RETURNS TRIGGER AS $$
BEGIN
    -- Priority: korrektur > gwr > sap
    NEW.map_lat := COALESCE(
        NULLIF(NEW.lat->>'korrektur', '')::DOUBLE PRECISION,
        NULLIF(NEW.lat->>'gwr', '')::DOUBLE PRECISION,
        NULLIF(NEW.lat->>'sap', '')::DOUBLE PRECISION
    );

    NEW.map_lng := COALESCE(
        NULLIF(NEW.lng->>'korrektur', '')::DOUBLE PRECISION,
        NULLIF(NEW.lng->>'gwr', '')::DOUBLE PRECISION,
        NULLIF(NEW.lng->>'sap', '')::DOUBLE PRECISION
    );

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

-- Auto-derive map coordinates from lat/lng TVP columns
CREATE TRIGGER tr_buildings_derive_coords
    BEFORE INSERT OR UPDATE OF lat, lng ON buildings
    FOR EACH ROW EXECUTE FUNCTION derive_map_coordinates();

-- Auto-derive kanton_code from kanton TVP column
CREATE TRIGGER tr_buildings_derive_kanton
    BEFORE INSERT OR UPDATE OF kanton ON buildings
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

-- Building category codes (GKAT)
CREATE TABLE ref_gkat (
    code    INTEGER PRIMARY KEY,
    name_de VARCHAR(80) NOT NULL
);

INSERT INTO ref_gkat (code, name_de) VALUES
(1010, 'Provisorische Unterkunft'),
(1020, 'Gebäude mit ausschliesslicher Wohnnutzung'),
(1021, 'Einfamilienhaus'),
(1025, 'Mehrfamilienhaus'),
(1030, 'Andere Wohngebäude (mit Nebennutzung)'),
(1040, 'Gebäude mit teilweiser Wohnnutzung'),
(1060, 'Gebäude ohne Wohnnutzung'),
(1080, 'Sonderbau');

-- Building class codes (GKLAS)
CREATE TABLE ref_gklas (
    code    INTEGER PRIMARY KEY,
    name_de VARCHAR(100) NOT NULL
);

INSERT INTO ref_gklas (code, name_de) VALUES
(1110, 'Gebäude mit einer Wohnung'),
(1121, 'Gebäude mit zwei Wohnungen'),
(1122, 'Gebäude mit drei oder mehr Wohnungen'),
(1130, 'Wohngebäude für Gemeinschaften'),
(1211, 'Hotelgebäude'),
(1212, 'Andere Gebäude für kurzfristige Beherbergung'),
(1220, 'Bürogebäude'),
(1230, 'Gross- und Einzelhandelsgebäude'),
(1231, 'Restaurants und Bars'),
(1241, 'Gebäude des Verkehrs- und Nachrichtenwesens'),
(1242, 'Garagengebäude'),
(1251, 'Industriegebäude'),
(1252, 'Behälter, Silos und Lagergebäude'),
(1261, 'Gebäude für Kultur- und Freizeitzwecke'),
(1262, 'Museen und Bibliotheken'),
(1263, 'Schul- und Hochschulgebäude, Forschungseinrichtungen'),
(1264, 'Krankenhäuser und Facheinrichtungen des Gesundheitswesens'),
(1265, 'Sporthallen'),
(1271, 'Landwirtschaftliche Betriebsgebäude'),
(1272, 'Kirchen und sonstige Kultgebäude'),
(1273, 'Denkmäler oder unter Denkmalschutz stehende Bauwerke'),
(1274, 'Sonstige Hochbauten, anderweitig nicht genannt'),
(1275, 'Andere Gebäude für die kollektive Unterkunft'),
(1276, 'Gebäude für die Tierhaltung'),
(1277, 'Gebäude für den Pflanzenbau'),
(1278, 'Andere landwirtschaftliche Gebäude');

-- Energy source for heating codes (GENH1)
CREATE TABLE ref_genh1 (
    code    INTEGER PRIMARY KEY,
    name_de VARCHAR(80) NOT NULL
);

INSERT INTO ref_genh1 (code, name_de) VALUES
(7500, 'Keine'),
(7501, 'Luft'),
(7510, 'Erdwärme (generisch)'),
(7511, 'Erdwärmesonde'),
(7512, 'Erdregister'),
(7513, 'Wasser (Grundwasser, Oberflächenwasser, Abwasser)'),
(7520, 'Gas'),
(7530, 'Heizöl'),
(7540, 'Holz (generisch)'),
(7541, 'Holz (Stückholz)'),
(7542, 'Holz (Pellets)'),
(7543, 'Holz (Schnitzel)'),
(7550, 'Abwärme (innerhalb des Gebäudes)'),
(7560, 'Elektrizität'),
(7570, 'Sonne (thermisch)'),
(7580, 'Fernwärme (generisch)'),
(7581, 'Fernwärme (Hochtemperatur)'),
(7582, 'Fernwärme (Niedertemperatur)'),
(7598, 'Unbestimmt'),
(7599, 'Andere');

-- Heat generator codes (GWAERZH1)
CREATE TABLE ref_gwaerzh1 (
    code    INTEGER PRIMARY KEY,
    name_de VARCHAR(80) NOT NULL
);

INSERT INTO ref_gwaerzh1 (code, name_de) VALUES
(7400, 'Kein Wärmeerzeuger'),
(7410, 'Wärmepumpe für ein Gebäude'),
(7411, 'Wärmepumpe für mehrere Gebäude'),
(7420, 'Thermische Solaranlage für ein Gebäude'),
(7421, 'Thermische Solaranlage für mehrere Gebäude'),
(7430, 'Heizkessel (generisch) für ein Gebäude'),
(7431, 'Heizkessel (generisch) für mehrere Gebäude'),
(7432, 'Heizkessel nicht kondensierend für ein Gebäude'),
(7433, 'Heizkessel nicht kondensierend für mehrere Gebäude'),
(7434, 'Heizkessel kondensierend für ein Gebäude'),
(7435, 'Heizkessel kondensierend für mehrere Gebäude'),
(7436, 'Ofen'),
(7440, 'Wärmekraftkopplungsanlage für ein Gebäude'),
(7441, 'Wärmekraftkopplungsanlage für mehrere Gebäude'),
(7450, 'Elektrospeicher-Zentralheizung für ein Gebäude'),
(7451, 'Elektrospeicher-Zentralheizung für mehrere Gebäude'),
(7452, 'Elektro direkt'),
(7460, 'Wärmetauscher (inkl. Fernwärme) für ein Gebäude'),
(7461, 'Wärmetauscher (inkl. Fernwärme) für mehrere Gebäude'),
(7499, 'Andere');

-- Heating type codes (GHEIZ)
CREATE TABLE ref_gheiz (
    code    INTEGER PRIMARY KEY,
    name_de VARCHAR(80) NOT NULL
);

INSERT INTO ref_gheiz (code, name_de) VALUES
(7100, 'Keine Heizung'),
(7101, 'Einzelofenheizung'),
(7102, 'Etagenheizung'),
(7103, 'Zentralheizung für das Gebäude'),
(7104, 'Zentralheizung für mehrere Gebäude'),
(7105, 'Öffentliche Fernwärmeversorgung'),
(7109, 'Andere Heizungsart');

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
   - Each TVP field (country, kanton, strasse, etc.) maps to its own JSONB column
   - camelCase JSON keys map to snake_case SQL columns: bfsNr → bfs_nr, parcelArea → parcel_area
   - Map assignee names to assignee_id via user lookup
   - Images array stays as JSONB
   - kanton_code CHAR(2) auto-derived via trigger from kanton JSONB column
   - map_lat/map_lng auto-derived via trigger from lat/lng JSONB columns

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

Example TVP column values (each column is a JSONB object):
  country     = {"sap": "CH", "gwr": "CH", "korrektur": "", "match": true}
  kanton      = {"sap": "TG", "gwr": "TG", "korrektur": "", "match": true}
  gemeinde    = {"sap": "Romanshorn", "gwr": "Romanshorn", "korrektur": "", "match": true}
  bfs_nr      = {"sap": "4436", "gwr": "4436", "korrektur": "", "match": true}
  plz         = {"sap": "8590", "gwr": "8590", "korrektur": "", "match": true}
  ort         = {"sap": "Romanshorn", "gwr": "Romanshorn", "korrektur": "", "match": true}
  strasse     = {"sap": "Friedrichshafnerstr.", "gwr": "Friedrichshafnerstrasse", "korrektur": "", "match": false}
  hausnummer  = {"sap": "", "gwr": "", "korrektur": "", "match": true}
  zusatz      = {"sap": "", "gwr": "", "korrektur": "", "match": true}
  egid        = {"sap": "", "gwr": "302045678", "korrektur": "", "match": false}
  egrid       = {"sap": "", "gwr": "CH336583840978", "korrektur": "", "match": false}
  lat         = {"sap": "", "gwr": "47.5656", "korrektur": "", "match": false}
  lng         = {"sap": "", "gwr": "9.3744", "korrektur": "", "match": false}
  gkat        = {"sap": "1060", "gwr": "1060", "korrektur": "", "match": true}
  gklas       = {"sap": "1220", "gwr": "1220", "korrektur": "", "match": true}
  gstat       = {"sap": "1004", "gwr": "1004", "korrektur": "", "match": true}
  gbaup       = {"sap": "8014", "gwr": "8014", "korrektur": "", "match": true}
  gbauj       = {"sap": "", "gwr": "1965", "korrektur": "", "match": false}
  gastw       = {"sap": "3", "gwr": "3", "korrektur": "", "match": true}
  ganzwhg     = {"sap": "0", "gwr": "0", "korrektur": "", "match": true}
  garea       = {"sap": "", "gwr": "485", "korrektur": "", "match": false}
  parcel_area = {"sap": "1250", "gwr": "1275", "korrektur": "", "match": false}

JSON-to-SQL column name mapping:
  bfsNr       → bfs_nr
  parcelArea  → parcel_area
  kanton (denormalized CHAR) → kanton_code
*/
