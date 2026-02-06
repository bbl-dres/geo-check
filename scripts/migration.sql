-- ============================================================================
-- Migration Script - Generated 2026-02-06
-- ============================================================================
-- Run this in the Supabase SQL Editor to import test data
-- ============================================================================

-- ============================================================================
-- USERS (skip if you already have users)
-- ============================================================================
-- Note: These users won't have auth_user_id linked yet.
-- You'll need to create auth users separately and update the link.

INSERT INTO users (id, name, initials, role, last_login) VALUES (
    1,
    'M. Keller',
    'MK',
    'Admin',
    '2026-01-31T08:42:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, initials, role, last_login) VALUES (
    2,
    'S. Brunner',
    'SB',
    'Bearbeiter',
    '2026-01-30T16:15:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, initials, role, last_login) VALUES (
    3,
    'T. Weber',
    'TW',
    'Bearbeiter',
    '2026-01-29T11:30:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, initials, role, last_login) VALUES (
    4,
    'A. Meier',
    'AM',
    'Leser',
    '2026-01-28T09:05:00Z'
) ON CONFLICT (id) DO NOTHING;

-- Reset user sequence
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ============================================================================
-- BUILDINGS
-- ============================================================================

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1080/2020/AA',
    'Romanshorn, Friedrichshafnerstrasse',
    'Büro',
    'medium',
    '{"total":67,"georef":67,"sap":100,"gwr":100}'::jsonb,
    1,
    'M. Keller',
    'inprogress',
    '2026-02-15',
    '2026-01-27T14:30:00Z',
    'M. Keller',
    TRUE,
    '302045678',
    47.5656,
    9.3744,
    'TG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TG","gwr":"TG","korrektur":"","match":true},"gemeinde":{"sap":"Romanshorn","gwr":"Romanshorn","korrektur":"","match":true},"bfsNr":{"sap":"4436","gwr":"4436","korrektur":"","match":true},"plz":{"sap":"8590","gwr":"8590","korrektur":"","match":true},"ort":{"sap":"Romanshorn","gwr":"Romanshorn","korrektur":"","match":true},"strasse":{"sap":"Friedrichshafnerstr.","gwr":"Friedrichshafnerstrasse","korrektur":"","match":false},"hausnummer":{"sap":"","gwr":"","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"302045678","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8014","gwr":"8014","korrektur":"","match":true},"gbauj":{"sap":"","gwr":"1965","korrektur":"","match":false},"lat":{"sap":"","gwr":"47.5656","korrektur":"","match":false},"lng":{"sap":"","gwr":"9.3744","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH336583840978","korrektur":"","match":false},"parcelArea":{"sap":"1250","gwr":"1275","korrektur":"","match":false},"garea":{"sap":"","gwr":"485","korrektur":"","match":false},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[{"id":"img-001","url":"https://picsum.photos/seed/building1/800/500","filename":"Fassade_Nord.jpg","uploadDate":"2026-01-12T10:30:00Z","uploadedBy":"M. Keller"},{"id":"img-002","url":"https://picsum.photos/seed/building2/800/500","filename":"Eingang_Hauptgebaeude.jpg","uploadDate":"2026-01-12T10:32:00Z","uploadedBy":"M. Keller"},{"id":"img-003","url":"https://picsum.photos/seed/building3/800/500","filename":"Parkplatz_Sued.jpg","uploadDate":"2026-01-15T14:20:00Z","uploadedBy":"S. Brunner"}]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1080/2021/AB',
    'Kreuzlingen, Hauptstrasse 12',
    'Wohnen',
    'high',
    '{"total":72,"georef":68,"sap":85,"gwr":78}'::jsonb,
    NULL,
    NULL,
    'backlog',
    '2026-01-25',
    '2026-01-23T09:15:00Z',
    'System',
    TRUE,
    '1456789',
    47.6512,
    9.1756,
    'TG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TG","gwr":"TG","korrektur":"","match":true},"gemeinde":{"sap":"Kreuzlingen","gwr":"Kreuzlingen","korrektur":"","match":true},"bfsNr":{"sap":"4671","gwr":"4671","korrektur":"","match":true},"plz":{"sap":"8280","gwr":"8280","korrektur":"","match":true},"ort":{"sap":"Kreuzlingen","gwr":"Kreuzlingen","korrektur":"","match":true},"strasse":{"sap":"Hauptstrasse","gwr":"Hauptstr.","korrektur":"","match":false},"hausnummer":{"sap":"12","gwr":"12a","korrektur":"","match":false},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"1456789","korrektur":"","match":false},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1121","korrektur":"","match":false},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8017","gwr":"8016","korrektur":"","match":false},"gbauj":{"sap":"","gwr":"1983","korrektur":"","match":false},"lat":{"sap":"47.65","gwr":"47.6512","korrektur":"","match":true},"lng":{"sap":"9.175","gwr":"9.1756","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH293847561029","korrektur":"","match":false},"parcelArea":{"sap":"685","gwr":"685","korrektur":"","match":true},"garea":{"sap":"310","gwr":"310","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"6","gwr":"6","korrektur":"","match":true}}'::jsonb,
    '[{"id":"img-004","url":"https://picsum.photos/seed/building4/800/500","filename":"Wohnblock_Ansicht.jpg","uploadDate":"2026-01-20T09:15:00Z","uploadedBy":"T. Weber"}]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1090/3010/AC',
    'St. Gallen, Bahnhofplatz 1',
    'Öffentlich',
    'low',
    '{"total":78,"georef":82,"sap":70,"gwr":70}'::jsonb,
    2,
    'S. Brunner',
    'clarification',
    '2026-02-03',
    '2026-01-28T11:45:00Z',
    'S. Brunner',
    TRUE,
    '1892345',
    47.4237,
    9.368,
    'SG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"SG","gwr":"SG","korrektur":"","match":true},"gemeinde":{"sap":"St. Gallen","gwr":"St. Gallen","korrektur":"","match":true},"bfsNr":{"sap":"3203","gwr":"3203","korrektur":"","match":true},"plz":{"sap":"9000","gwr":"9000","korrektur":"","match":true},"ort":{"sap":"St. Gallen","gwr":"St. Gallen","korrektur":"","match":true},"strasse":{"sap":"Bahnhofplatz","gwr":"Bahnhofplatz","korrektur":"","match":true},"hausnummer":{"sap":"1","gwr":"1","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"1892345","gwr":"1892345","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1241","gwr":"1241","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8013","gwr":"8013","korrektur":"","match":true},"gbauj":{"sap":"1955","gwr":"1955","korrektur":"","match":true},"lat":{"sap":"47.4235","gwr":"47.4237","korrektur":"","match":true},"lng":{"sap":"9.3678","gwr":"9.3680","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH847291034856","korrektur":"","match":false},"parcelArea":{"sap":"3200","gwr":"3200","korrektur":"","match":true},"garea":{"sap":"1850","gwr":"1850","korrektur":"","match":true},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1100/4050/AD',
    'Zürich, Stampfenbachstrasse 85',
    'Büro',
    'low',
    '{"total":98,"georef":95,"sap":95,"gwr":100}'::jsonb,
    NULL,
    NULL,
    'done',
    NULL,
    '2026-01-30T08:00:00Z',
    'T. Weber',
    TRUE,
    '3456789',
    47.3834,
    8.5397,
    'ZH',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"ZH","gwr":"ZH","korrektur":"","match":true},"gemeinde":{"sap":"Zürich","gwr":"Zürich","korrektur":"","match":true},"bfsNr":{"sap":"261","gwr":"261","korrektur":"","match":true},"plz":{"sap":"8006","gwr":"8006","korrektur":"","match":true},"ort":{"sap":"Zürich","gwr":"Zürich","korrektur":"","match":true},"strasse":{"sap":"Stampfenbachstrasse","gwr":"Stampfenbachstrasse","korrektur":"","match":true},"hausnummer":{"sap":"85","gwr":"85","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"3456789","gwr":"3456789","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"gbauj":{"sap":"1975","gwr":"1975","korrektur":"","match":true},"lat":{"sap":"47.3834","gwr":"47.3834","korrektur":"","match":true},"lng":{"sap":"8.5397","gwr":"8.5397","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH583920174635","korrektur":"","match":false},"parcelArea":{"sap":"890","gwr":"890","korrektur":"","match":true},"garea":{"sap":"520","gwr":"520","korrektur":"","match":true},"gastw":{"sap":"5","gwr":"5","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1110/5020/AE',
    'Bern, Bundesgasse 3',
    'Öffentlich',
    'medium',
    '{"total":72,"georef":75,"sap":60,"gwr":70}'::jsonb,
    3,
    'T. Weber',
    'inprogress',
    NULL,
    '2026-01-25T16:20:00Z',
    'T. Weber',
    TRUE,
    '5678901',
    46.948,
    7.4474,
    'BE',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BE","gwr":"BE","korrektur":"","match":true},"gemeinde":{"sap":"Bern","gwr":"Bern","korrektur":"","match":true},"bfsNr":{"sap":"351","gwr":"351","korrektur":"","match":true},"plz":{"sap":"3003","gwr":"3011","korrektur":"","match":false},"ort":{"sap":"Bern","gwr":"Bern","korrektur":"","match":true},"strasse":{"sap":"Bundesgasse","gwr":"Bundes-Gasse","korrektur":"","match":false},"hausnummer":{"sap":"3","gwr":"3","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"5678901","gwr":"5678901","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1261","gwr":"1261","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8014","gwr":"8014","korrektur":"","match":true},"gbauj":{"sap":"1965","gwr":"1965","korrektur":"","match":true},"lat":{"sap":"46.9478","gwr":"46.9480","korrektur":"","match":true},"lng":{"sap":"7.4472","gwr":"7.4474","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH291048573619","korrektur":"","match":false},"parcelArea":{"sap":"1450","gwr":"1450","korrektur":"","match":true},"garea":{"sap":"780","gwr":"764","korrektur":"","match":false},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1120/6030/AF',
    'Chur, Grabenstrasse 1',
    'Industrie',
    'high',
    '{"total":35,"georef":30,"sap":50,"gwr":35}'::jsonb,
    NULL,
    NULL,
    'backlog',
    NULL,
    '2026-01-20T10:00:00Z',
    'System',
    TRUE,
    '9012999',
    46.8499,
    9.5329,
    'GR',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"GR","gwr":"GR","korrektur":"","match":true},"gemeinde":{"sap":"Chur","gwr":"Chur","korrektur":"","match":true},"bfsNr":{"sap":"3901","gwr":"3901","korrektur":"","match":true},"plz":{"sap":"7000","gwr":"7000","korrektur":"","match":true},"ort":{"sap":"Chur","gwr":"Chur","korrektur":"","match":true},"strasse":{"sap":"Grabenstrasse","gwr":"Grabenstrasse","korrektur":"","match":true},"hausnummer":{"sap":"1","gwr":"1","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"9012345","gwr":"9012999","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1251","gwr":"1251","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8011","gwr":"8017","korrektur":"","match":false},"gbauj":{"sap":"","gwr":"1988","korrektur":"","match":false},"lat":{"sap":"46.8520","gwr":"46.8499","korrektur":"","match":false},"lng":{"sap":"9.5350","gwr":"9.5329","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH738291045867","korrektur":"","match":false},"parcelArea":{"sap":"2100","gwr":"2142","korrektur":"","match":false},"garea":{"sap":"950","gwr":"950","korrektur":"","match":true},"gastw":{"sap":"2","gwr":"2","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1100/4051/AG',
    'Winterthur, Technikumstrasse 8',
    'Bildung',
    'medium',
    '{"total":65,"georef":60,"sap":55,"gwr":60}'::jsonb,
    4,
    'A. Meier',
    'inprogress',
    NULL,
    '2026-01-26T13:10:00Z',
    'A. Meier',
    TRUE,
    '2345678',
    47.4979,
    8.7246,
    'ZH',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"ZH","gwr":"ZH","korrektur":"","match":true},"gemeinde":{"sap":"Winterthur","gwr":"Winterthur","korrektur":"","match":true},"bfsNr":{"sap":"230","gwr":"230","korrektur":"","match":true},"plz":{"sap":"8400","gwr":"8400","korrektur":"","match":true},"ort":{"sap":"Winterthur","gwr":"Winterthur","korrektur":"","match":true},"strasse":{"sap":"Technikumstrasse","gwr":"Technikumstrasse","korrektur":"","match":true},"hausnummer":{"sap":"8","gwr":"8","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"2345678","gwr":"2345678","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1263","gwr":"1263","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"","gwr":"8020","korrektur":"","match":false},"gbauj":{"sap":"","gwr":"2003","korrektur":"","match":false},"lat":{"sap":"47.4977","gwr":"47.4979","korrektur":"","match":true},"lng":{"sap":"8.7244","gwr":"8.7246","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH482910384756","korrektur":"","match":false},"parcelArea":{"sap":"5600","gwr":"5600","korrektur":"","match":true},"garea":{"sap":"2800","gwr":"2800","korrektur":"","match":true},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1080/2022/AH',
    'Frauenfeld, Schlossmühlestrasse 15',
    'Wohnen',
    'low',
    '{"total":82,"georef":80,"sap":75,"gwr":80}'::jsonb,
    NULL,
    NULL,
    'backlog',
    NULL,
    '2026-01-29T17:45:00Z',
    'M. Keller',
    TRUE,
    '4567890',
    47.5533,
    8.8987,
    'TG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TG","gwr":"TG","korrektur":"","match":true},"gemeinde":{"sap":"Frauenfeld","gwr":"Frauenfeld","korrektur":"","match":true},"bfsNr":{"sap":"4566","gwr":"4566","korrektur":"","match":true},"plz":{"sap":"8510","gwr":"8510","korrektur":"","match":true},"ort":{"sap":"Frauenfeld","gwr":"Frauenfeld","korrektur":"","match":true},"strasse":{"sap":"Schlossmühlestrasse","gwr":"Schlossmühlestrasse","korrektur":"","match":true},"hausnummer":{"sap":"15","gwr":"15","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"4567890","gwr":"4567890","korrektur":"","match":true},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8018","gwr":"8018","korrektur":"","match":true},"gbauj":{"sap":"1993","gwr":"1993","korrektur":"","match":true},"lat":{"sap":"47.5531","gwr":"47.5533","korrektur":"","match":true},"lng":{"sap":"8.8985","gwr":"8.8987","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH192837465019","korrektur":"","match":false},"parcelArea":{"sap":"720","gwr":"720","korrektur":"","match":true},"garea":{"sap":"380","gwr":"380","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"8","gwr":"8","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1130/7010/AI',
    'Basel, Elisabethenstrasse 51',
    'Büro',
    'low',
    '{"total":95,"georef":93,"sap":92,"gwr":95}'::jsonb,
    NULL,
    NULL,
    'done',
    NULL,
    '2026-01-30T09:30:00Z',
    'S. Brunner',
    TRUE,
    '6789012',
    47.548,
    7.5896,
    'BS',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BS","gwr":"BS","korrektur":"","match":true},"gemeinde":{"sap":"Basel","gwr":"Basel","korrektur":"","match":true},"bfsNr":{"sap":"2701","gwr":"2701","korrektur":"","match":true},"plz":{"sap":"4051","gwr":"4051","korrektur":"","match":true},"ort":{"sap":"Basel","gwr":"Basel","korrektur":"","match":true},"strasse":{"sap":"Elisabethenstrasse","gwr":"Elisabethenstrasse","korrektur":"","match":true},"hausnummer":{"sap":"51","gwr":"51","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"6789012","gwr":"6789012","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8021","gwr":"8021","korrektur":"","match":true},"gbauj":{"sap":"2008","gwr":"2008","korrektur":"","match":true},"lat":{"sap":"47.5480","gwr":"47.5480","korrektur":"","match":true},"lng":{"sap":"7.5896","gwr":"7.5896","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH847291056382","korrektur":"","match":false},"parcelArea":{"sap":"1100","gwr":"1100","korrektur":"","match":true},"garea":{"sap":"650","gwr":"637","korrektur":"","match":false},"gastw":{"sap":"5","gwr":"5","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1140/8020/AJ',
    'Luzern, Hirschengraben 15',
    'Wohnen',
    'medium',
    '{"total":70,"georef":72,"sap":68,"gwr":67}'::jsonb,
    1,
    'M. Keller',
    'clarification',
    NULL,
    '2026-01-28T15:00:00Z',
    'M. Keller',
    TRUE,
    '7890123',
    47.0502,
    8.3093,
    'LU',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"LU","gwr":"LU","korrektur":"","match":true},"gemeinde":{"sap":"Luzern","gwr":"Luzern","korrektur":"","match":true},"bfsNr":{"sap":"1061","gwr":"1061","korrektur":"","match":true},"plz":{"sap":"6003","gwr":"6003","korrektur":"","match":true},"ort":{"sap":"Luzern","gwr":"Luzern","korrektur":"","match":true},"strasse":{"sap":"Hirschengraben","gwr":"Hirschengraben","korrektur":"","match":true},"hausnummer":{"sap":"15","gwr":"15a","korrektur":"","match":false},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"7890123","gwr":"7890123","korrektur":"","match":true},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"gbauj":{"sap":"1975","gwr":"1975","korrektur":"","match":true},"lat":{"sap":"47.0500","gwr":"47.0502","korrektur":"","match":true},"lng":{"sap":"8.3091","gwr":"8.3093","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH582910473856","korrektur":"","match":false},"parcelArea":{"sap":"680","gwr":"680","korrektur":"","match":true},"garea":{"sap":"420","gwr":"420","korrektur":"","match":true},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"10","gwr":"10","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1150/9030/AK',
    'Genf, Rue de Lausanne 65',
    'Industrie',
    'high',
    '{"total":28,"georef":22,"sap":45,"gwr":30}'::jsonb,
    NULL,
    NULL,
    'backlog',
    NULL,
    '2026-01-16T08:30:00Z',
    'System',
    TRUE,
    '8901234',
    46.2138,
    6.149,
    'GE',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"GE","gwr":"GE","korrektur":"","match":true},"gemeinde":{"sap":"Genève","gwr":"Genève","korrektur":"","match":true},"bfsNr":{"sap":"6621","gwr":"6621","korrektur":"","match":true},"plz":{"sap":"1202","gwr":"1202","korrektur":"","match":true},"ort":{"sap":"Genève","gwr":"Genève","korrektur":"","match":true},"strasse":{"sap":"Rue de Lausanne","gwr":"Rue de Lausanne","korrektur":"","match":true},"hausnummer":{"sap":"65","gwr":"65","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"8901234","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1251","gwr":"1251","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8014","gwr":"8014","korrektur":"","match":true},"gbauj":{"sap":"1965","gwr":"1965","korrektur":"","match":true},"lat":{"sap":"46.2100","gwr":"46.2138","korrektur":"","match":false},"lng":{"sap":"6.1450","gwr":"6.1490","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH293847561029","korrektur":"","match":false},"parcelArea":{"sap":"1800","gwr":"1836","korrektur":"","match":false},"garea":{"sap":"920","gwr":"920","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1160/1040/AL',
    'Lugano, Via Nassa 29',
    'Öffentlich',
    'low',
    '{"total":85,"georef":88,"sap":80,"gwr":82}'::jsonb,
    2,
    'S. Brunner',
    'inprogress',
    NULL,
    '2026-01-24T12:15:00Z',
    'S. Brunner',
    TRUE,
    '9012345',
    46.005,
    8.952,
    'TI',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TI","gwr":"TI","korrektur":"","match":true},"gemeinde":{"sap":"Lugano","gwr":"Lugano","korrektur":"","match":true},"bfsNr":{"sap":"5192","gwr":"5192","korrektur":"","match":true},"plz":{"sap":"6900","gwr":"6900","korrektur":"","match":true},"ort":{"sap":"Lugano","gwr":"Lugano","korrektur":"","match":true},"strasse":{"sap":"Via Nassa","gwr":"Via Nassa","korrektur":"","match":true},"hausnummer":{"sap":"29","gwr":"29","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"9012345","gwr":"9012345","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1261","gwr":"1261","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8017","gwr":"8017","korrektur":"","match":true},"gbauj":{"sap":"1988","gwr":"1988","korrektur":"","match":true},"lat":{"sap":"46.0048","gwr":"46.0050","korrektur":"","match":true},"lng":{"sap":"8.9518","gwr":"8.9520","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH184729301856","korrektur":"","match":false},"parcelArea":{"sap":"950","gwr":"950","korrektur":"","match":true},"garea":{"sap":"580","gwr":"580","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1170/2050/AM',
    'Aarau, Bahnhofstrasse 20',
    'Büro',
    'high',
    '{"total":45,"georef":40,"sap":55,"gwr":50}'::jsonb,
    4,
    'A. Meier',
    'clarification',
    NULL,
    '2026-01-29T10:00:00Z',
    'A. Meier',
    TRUE,
    '1234567',
    47.3925,
    8.0444,
    'AG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"AG","gwr":"AG","korrektur":"","match":true},"gemeinde":{"sap":"Aarau","gwr":"Aarau","korrektur":"","match":true},"bfsNr":{"sap":"4001","gwr":"4001","korrektur":"","match":true},"plz":{"sap":"5000","gwr":"5000","korrektur":"","match":true},"ort":{"sap":"Aarau","gwr":"Aarau","korrektur":"","match":true},"strasse":{"sap":"Bahnhofstrasse","gwr":"Bahnhofstr.","korrektur":"","match":false},"hausnummer":{"sap":"20","gwr":"20","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"1234567","gwr":"1234567","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8016","gwr":"8017","korrektur":"","match":false},"gbauj":{"sap":"","gwr":"1988","korrektur":"","match":false},"lat":{"sap":"47.3920","gwr":"47.3925","korrektur":"","match":true},"lng":{"sap":"8.0440","gwr":"8.0444","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH738492015738","korrektur":"","match":false},"parcelArea":{"sap":"1350","gwr":"1350","korrektur":"","match":true},"garea":{"sap":"720","gwr":"706","korrektur":"","match":false},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1180/3060/AN',
    'Solothurn, Hauptgasse 5',
    'Öffentlich',
    'medium',
    '{"total":92,"georef":90,"sap":90,"gwr":90}'::jsonb,
    3,
    'T. Weber',
    'done',
    NULL,
    '2026-01-28T16:30:00Z',
    'T. Weber',
    TRUE,
    '2345678',
    47.2088,
    7.5378,
    'SO',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"SO","gwr":"SO","korrektur":"","match":true},"gemeinde":{"sap":"Solothurn","gwr":"Solothurn","korrektur":"","match":true},"bfsNr":{"sap":"2601","gwr":"2601","korrektur":"","match":true},"plz":{"sap":"4500","gwr":"4500","korrektur":"","match":true},"ort":{"sap":"Solothurn","gwr":"Solothurn","korrektur":"","match":true},"strasse":{"sap":"Hauptgasse","gwr":"Hauptgasse","korrektur":"","match":true},"hausnummer":{"sap":"5","gwr":"5","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"2345678","gwr":"2345678","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1272","gwr":"1272","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"gbauj":{"sap":"1975","gwr":"1975","korrektur":"","match":true},"lat":{"sap":"47.2088","gwr":"47.2088","korrektur":"","match":true},"lng":{"sap":"7.5378","gwr":"7.5378","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH849201573846","korrektur":"","match":false},"parcelArea":{"sap":"480","gwr":"480","korrektur":"","match":true},"garea":{"sap":"320","gwr":"320","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1190/4070/AO',
    'Thun, Bälliz 42',
    'Wohnen',
    'low',
    '{"total":88,"georef":85,"sap":85,"gwr":88}'::jsonb,
    NULL,
    NULL,
    'done',
    NULL,
    '2026-01-27T09:15:00Z',
    'M. Keller',
    TRUE,
    '3456789',
    46.758,
    7.629,
    'BE',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BE","gwr":"BE","korrektur":"","match":true},"gemeinde":{"sap":"Thun","gwr":"Thun","korrektur":"","match":true},"bfsNr":{"sap":"942","gwr":"942","korrektur":"","match":true},"plz":{"sap":"3600","gwr":"3600","korrektur":"","match":true},"ort":{"sap":"Thun","gwr":"Thun","korrektur":"","match":true},"strasse":{"sap":"Bälliz","gwr":"Bälliz","korrektur":"","match":true},"hausnummer":{"sap":"42","gwr":"42","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"3456789","gwr":"3456789","korrektur":"","match":true},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8019","gwr":"8019","korrektur":"","match":true},"gbauj":{"sap":"1998","gwr":"1998","korrektur":"","match":true},"lat":{"sap":"46.758","gwr":"46.758","korrektur":"","match":true},"lng":{"sap":"7.629","gwr":"7.629","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH582910384756","korrektur":"","match":false},"parcelArea":{"sap":"560","gwr":"560","korrektur":"","match":true},"garea":{"sap":"380","gwr":"380","korrektur":"","match":true},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"12","gwr":"12","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1200/5080/AP',
    'Biel, Nidaugasse 14',
    'Industrie',
    'high',
    '{"total":38,"georef":35,"sap":45,"gwr":45}'::jsonb,
    2,
    'S. Brunner',
    'inprogress',
    NULL,
    '2026-01-30T11:00:00Z',
    'S. Brunner',
    TRUE,
    '4567890',
    47.1368,
    7.2467,
    'BE',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BE","gwr":"BE","korrektur":"","match":true},"gemeinde":{"sap":"Biel/Bienne","gwr":"Biel/Bienne","korrektur":"","match":true},"bfsNr":{"sap":"371","gwr":"371","korrektur":"","match":true},"plz":{"sap":"2502","gwr":"2501","korrektur":"","match":false},"ort":{"sap":"Biel/Bienne","gwr":"Biel/Bienne","korrektur":"","match":true},"strasse":{"sap":"Nidaugasse","gwr":"Nidaugasse","korrektur":"","match":true},"hausnummer":{"sap":"14","gwr":"14","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"4567890","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1251","gwr":"1252","korrektur":"","match":false},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8013","gwr":"8013","korrektur":"","match":true},"gbauj":{"sap":"1955","gwr":"1955","korrektur":"","match":true},"lat":{"sap":"","gwr":"47.1368","korrektur":"","match":false},"lng":{"sap":"","gwr":"7.2467","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH293018475639","korrektur":"","match":false},"parcelArea":{"sap":"1680","gwr":"1714","korrektur":"","match":false},"garea":{"sap":"890","gwr":"890","korrektur":"","match":true},"gastw":{"sap":"2","gwr":"2","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1210/6090/AQ',
    'Schaffhausen, Vordergasse 61',
    'Büro',
    'medium',
    '{"total":75,"georef":72,"sap":70,"gwr":75}'::jsonb,
    NULL,
    NULL,
    'backlog',
    NULL,
    '2026-01-22T14:45:00Z',
    'System',
    TRUE,
    '5678901',
    47.6961,
    8.635,
    'SH',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"SH","gwr":"SH","korrektur":"","match":true},"gemeinde":{"sap":"Schaffhausen","gwr":"Schaffhausen","korrektur":"","match":true},"bfsNr":{"sap":"2939","gwr":"2939","korrektur":"","match":true},"plz":{"sap":"8200","gwr":"8200","korrektur":"","match":true},"ort":{"sap":"Schaffhausen","gwr":"Schaffhausen","korrektur":"","match":true},"strasse":{"sap":"Vordergasse","gwr":"Vordergasse","korrektur":"","match":true},"hausnummer":{"sap":"61","gwr":"61","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"5678901","gwr":"5678901","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"","gwr":"8014","korrektur":"","match":false},"gbauj":{"sap":"","gwr":"1965","korrektur":"","match":false},"lat":{"sap":"47.6959","gwr":"47.6961","korrektur":"","match":true},"lng":{"sap":"8.6348","gwr":"8.6350","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH847291056382","korrektur":"","match":false},"parcelArea":{"sap":"420","gwr":"420","korrektur":"","match":true},"garea":{"sap":"280","gwr":"274","korrektur":"","match":false},"gastw":{"sap":"4","gwr":"4","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1220/7100/AR',
    'Zug, Baarerstrasse 8',
    'Öffentlich',
    'low',
    '{"total":96,"georef":98,"sap":95,"gwr":95}'::jsonb,
    1,
    'M. Keller',
    'done',
    NULL,
    '2026-01-30T08:30:00Z',
    'M. Keller',
    TRUE,
    '6789012',
    47.1724,
    8.5179,
    'ZG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"ZG","gwr":"ZG","korrektur":"","match":true},"gemeinde":{"sap":"Zug","gwr":"Zug","korrektur":"","match":true},"bfsNr":{"sap":"1711","gwr":"1711","korrektur":"","match":true},"plz":{"sap":"6300","gwr":"6300","korrektur":"","match":true},"ort":{"sap":"Zug","gwr":"Zug","korrektur":"","match":true},"strasse":{"sap":"Baarerstrasse","gwr":"Baarerstrasse","korrektur":"","match":true},"hausnummer":{"sap":"8","gwr":"8","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"6789012","gwr":"6789012","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1261","gwr":"1261","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8022","gwr":"8022","korrektur":"","match":true},"gbauj":{"sap":"2013","gwr":"2013","korrektur":"","match":true},"lat":{"sap":"47.1724","gwr":"47.1724","korrektur":"","match":true},"lng":{"sap":"8.5179","gwr":"8.5179","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH192837465019","korrektur":"","match":false},"parcelArea":{"sap":"780","gwr":"780","korrektur":"","match":true},"garea":{"sap":"520","gwr":"520","korrektur":"","match":true},"gastw":{"sap":"5","gwr":"5","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1230/8110/AS',
    'Neuchâtel, Rue du Seyon 12',
    'Bildung',
    'medium',
    '{"total":58,"georef":55,"sap":60,"gwr":60}'::jsonb,
    3,
    'T. Weber',
    'clarification',
    NULL,
    '2026-01-29T15:20:00Z',
    'T. Weber',
    TRUE,
    '7890124',
    46.992,
    6.931,
    'NE',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"NE","gwr":"NE","korrektur":"","match":true},"gemeinde":{"sap":"Neuchâtel","gwr":"Neuchâtel","korrektur":"","match":true},"bfsNr":{"sap":"6458","gwr":"6458","korrektur":"","match":true},"plz":{"sap":"2000","gwr":"2000","korrektur":"","match":true},"ort":{"sap":"Neuchâtel","gwr":"Neuchâtel","korrektur":"","match":true},"strasse":{"sap":"Rue du Seyon","gwr":"Rue du Seyon","korrektur":"","match":true},"hausnummer":{"sap":"12","gwr":"12","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"7890123","gwr":"7890124","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1263","gwr":"1263","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8016","gwr":"8016","korrektur":"","match":true},"gbauj":{"sap":"1983","gwr":"1983","korrektur":"","match":true},"lat":{"sap":"46.990","gwr":"46.992","korrektur":"","match":false},"lng":{"sap":"6.929","gwr":"6.931","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH738291045867","korrektur":"","match":false},"parcelArea":{"sap":"2200","gwr":"2200","korrektur":"","match":true},"garea":{"sap":"1100","gwr":"1100","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"0","gwr":"0","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

INSERT INTO buildings (
    id, name, portfolio, priority, confidence,
    assignee_id, assignee, kanban_status, due_date,
    last_update, last_update_by, in_gwr, gwr_egid,
    map_lat, map_lng, kanton, comparison_data, images
) VALUES (
    '1240/9120/AT',
    'Sion, Avenue de la Gare 3',
    'Wohnen',
    'high',
    '{"total":32,"georef":28,"sap":40,"gwr":40}'::jsonb,
    NULL,
    NULL,
    'backlog',
    NULL,
    '2026-01-18T10:00:00Z',
    'System',
    TRUE,
    '8901234',
    46.2333,
    7.3592,
    'VS',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"VS","gwr":"VS","korrektur":"","match":true},"gemeinde":{"sap":"Sion","gwr":"Sion","korrektur":"","match":true},"bfsNr":{"sap":"6266","gwr":"6266","korrektur":"","match":true},"plz":{"sap":"1950","gwr":"1950","korrektur":"","match":true},"ort":{"sap":"Sion","gwr":"Sion","korrektur":"","match":true},"strasse":{"sap":"Avenue de la Gare","gwr":"Av. de la Gare","korrektur":"","match":false},"hausnummer":{"sap":"3","gwr":"3","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"8901234","korrektur":"","match":false},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gstat":{"sap":"1004","gwr":"1004","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"gbauj":{"sap":"1975","gwr":"1975","korrektur":"","match":true},"lat":{"sap":"","gwr":"46.2333","korrektur":"","match":false},"lng":{"sap":"","gwr":"7.3592","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH482910573846","korrektur":"","match":false},"parcelArea":{"sap":"920","gwr":"920","korrektur":"","match":true},"garea":{"sap":"540","gwr":"540","korrektur":"","match":true},"gastw":{"sap":"3","gwr":"3","korrektur":"","match":true},"ganzwhg":{"sap":"6","gwr":"6","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

-- ============================================================================
-- RULE SETS
-- ============================================================================

INSERT INTO rule_sets (id, name, description, enabled, entity_type) VALUES
    ('identification', 'Identifikation', 'Prüfung der Verknüpfung mit GWR und Kataster', TRUE, 'building'),
    ('address', 'Adresse', 'SAP ↔ GWR Adress-Konsistenz gemäss GeoNV', TRUE, 'building'),
    ('geometry', 'Geometrie', 'Räumliche Genauigkeit und Koordinaten-Qualität', TRUE, 'building')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RULES
-- ============================================================================

-- Identification rules
INSERT INTO rules (id, rule_set_id, name, description, attribute, operator, value, severity, message) VALUES
    ('ID-001', 'identification', 'EGID vorhanden', 'Prüft ob eine gültige EGID vorhanden ist', '"egid"'::jsonb, 'exists', NULL, 'error', 'Keine EGID vorhanden'),
    ('ID-002', 'identification', 'EGID Format', 'Prüft ob die EGID dem korrekten Format entspricht (1-9 Ziffern, keine führenden Nullen)', '"egid"'::jsonb, 'matches', '"^[1-9][0-9]{0,8}$"'::jsonb, 'error', 'EGID hat ungültiges Format'),
    ('ID-003', 'identification', 'EGID verifiziert', 'Prüft ob die EGID auf das korrekte Gebäude im GWR zeigt', '"egid"'::jsonb, 'equals', NULL, 'error', 'EGID zeigt auf ein anderes Gebäude im GWR'),
    ('ID-004', 'identification', 'EGRID vorhanden', 'Prüft ob eine EGRID für die Kataster-/ÖREB-Verknüpfung vorhanden ist', '"egrid"'::jsonb, 'exists', NULL, 'warning', 'Keine EGRID vorhanden'),
    ('ID-005', 'identification', 'EGID Duplikat', 'Prüft ob dieselbe EGID für mehrere SAP-Datensätze verwendet wird', '"egid"'::jsonb, 'unique', NULL, 'error', 'Dieselbe EGID wird für mehrere Gebäude verwendet'),
    ('ID-006', 'identification', 'Koordinaten Duplikat', 'Prüft ob dieselben Koordinaten für mehrere SAP-Datensätze verwendet werden', '["lat","lng"]'::jsonb, 'unique', NULL, 'warning', 'Dieselben Koordinaten werden für mehrere Gebäude verwendet'),
    ('ID-007', 'identification', 'Mehrere GWR-Gebäude', 'Ein SAP-Datensatz ist mit mehreren GWR-Gebäuden verknüpft (1:N)', '"inGwr"'::jsonb, 'check', NULL, 'info', 'Mehrere GWR-Gebäude mit einem SAP-Objekt verknüpft')
ON CONFLICT (id) DO NOTHING;

-- Address rules
INSERT INTO rules (id, rule_set_id, name, description, attribute, operator, value, severity, message) VALUES
    ('ADR-001', 'address', 'Land', 'Prüft ob der Ländercode übereinstimmt (soll CH sein)', '"country"'::jsonb, 'source_match', NULL, 'error', 'Ländercode weicht ab'),
    ('ADR-002', 'address', 'Kanton', 'Prüft ob der Kantonscode übereinstimmt', '"kanton"'::jsonb, 'source_match', NULL, 'warning', 'Kantonscode weicht ab'),
    ('ADR-003', 'address', 'Gemeinde', 'Prüft ob der Gemeindename übereinstimmt', '"gemeinde"'::jsonb, 'source_match', NULL, 'warning', 'Gemeindename weicht ab'),
    ('ADR-004', 'address', 'PLZ', 'Prüft ob die Postleitzahl übereinstimmt', '"plz"'::jsonb, 'source_match', NULL, 'warning', 'Postleitzahl weicht ab'),
    ('ADR-005', 'address', 'Ort', 'Prüft ob die Ortsbezeichnung übereinstimmt', '"ort"'::jsonb, 'source_match', NULL, 'warning', 'Ortsbezeichnung weicht ab'),
    ('ADR-006', 'address', 'Strasse', 'Prüft ob der Strassenname übereinstimmt', '"strasse"'::jsonb, 'source_match', NULL, 'info', 'Strassenname weicht ab'),
    ('ADR-007', 'address', 'Hausnummer', 'Prüft ob die Hausnummer übereinstimmt oder fehlt', '"hausnummer"'::jsonb, 'source_match', NULL, 'warning', 'Hausnummer weicht ab oder fehlt'),
    ('ADR-008', 'address', 'Zusatz', 'Prüft ob der Adresszusatz übereinstimmt', '"zusatz"'::jsonb, 'source_match', NULL, 'info', 'Adresszusatz weicht ab')
ON CONFLICT (id) DO NOTHING;

-- Geometry rules
INSERT INTO rules (id, rule_set_id, name, description, attribute, operator, value, severity, message) VALUES
    ('GEO-001', 'geometry', 'Koordinaten vorhanden', 'Prüft ob Koordinaten in mindestens einer Quelle vorhanden sind', '["lat","lng"]'::jsonb, 'exists', NULL, 'error', 'Koordinaten fehlen in allen Quellen'),
    ('GEO-002', 'geometry', 'Koordinaten-Abweichung', 'Prüft ob SAP- und GWR-Koordinaten um mehr als 50m abweichen', '["lat","lng"]'::jsonb, 'distance', '50'::jsonb, 'warning', 'SAP- und GWR-Koordinaten weichen um {value}m ab'),
    ('GEO-003', 'geometry', 'Adresse-Koordinaten-Match', 'Prüft ob die geocodierte Adresse mehr als 100m von den gespeicherten Koordinaten abweicht', '["lat","lng"]'::jsonb, 'geocode_distance', '100'::jsonb, 'info', 'Adresse und Koordinaten weichen um {value}m ab')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

INSERT INTO comments (id, building_id, author_id, author, text, is_system, created_at) VALUES
    ('cmt-1080-2020-AA-001', '1080/2020/AA', 1, 'M. Keller', 'Vor Ort verifiziert - GWR Position ist korrekt.', FALSE, '2026-01-12T14:32:00Z'),
    ('cmt-1080-2020-AA-002', '1080/2020/AA', NULL, 'System', 'Automatisch erkannt: Koordinatenabweichung > 30m', TRUE, '2026-01-10T09:00:00Z'),
    ('cmt-1090-3010-AC-001', '1090/3010/AC', 2, 'S. Brunner', 'Archivdokumente angefragt zur Klärung.', FALSE, '2026-01-14T10:15:00Z'),
    ('cmt-1100-4050-AD-001', '1100/4050/AD', NULL, 'System', 'Alle Prüfungen bestanden.', TRUE, '2026-01-08T08:00:00Z'),
    ('cmt-1120-6030-AF-001', '1120/6030/AF', NULL, 'System', 'Kritischer Fehler erkannt - manuelle Prüfung erforderlich', TRUE, '2026-01-05T11:30:00Z'),
    ('cmt-1140-8020-AJ-001', '1140/8020/AJ', 1, 'M. Keller', 'Vor Ort geprüft - Hausnummer ist 15a.', FALSE, '2026-01-13T14:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ERRORS
-- ============================================================================

INSERT INTO errors (id, building_id, check_id, description, level, field, detected_at, resolved_at) VALUES
    ('err-1080-2020-AA-001', '1080/2020/AA', 'GEO-002', 'SAP- und GWR-Koordinaten weichen um 47m ab', 'warning', 'lat', '2026-01-15T09:30:00Z', NULL),
    ('err-1080-2021-AB-001', '1080/2021/AB', 'GEO-001', 'Koordinaten fehlen in allen Quellen', 'error', 'lat', '2026-01-10T08:00:00Z', NULL),
    ('err-1080-2021-AB-002', '1080/2021/AB', 'ID-001', 'Keine EGID vorhanden', 'error', 'egid', '2026-01-10T08:00:00Z', NULL),
    ('err-1110-5020-AE-001', '1110/5020/AE', 'ADR-006', 'Strasse: SAP ''Bundesgasse'', GWR ''Bundesgasse ''', 'info', 'strasse', '2026-01-12T10:00:00Z', NULL),
    ('err-1110-5020-AE-002', '1110/5020/AE', 'ADR-004', 'PLZ: SAP ''3003'', GWR ''3011''', 'warning', 'plz', '2026-01-12T10:00:00Z', NULL),
    ('err-1120-6030-AF-001', '1120/6030/AF', 'GEO-002', 'SAP- und GWR-Koordinaten weichen um 234m ab', 'warning', 'lat', '2026-01-08T09:00:00Z', NULL),
    ('err-1120-6030-AF-002', '1120/6030/AF', 'ID-003', 'EGID Diskrepanz: SAP 5678901, GWR 5678902', 'error', 'egid', '2026-01-08T09:00:00Z', NULL),
    ('err-1140-8020-AJ-001', '1140/8020/AJ', 'ADR-008', 'Zusatz: fehlt in SAP (GWR: a)', 'info', 'zusatz', '2026-01-15T11:00:00Z', NULL),
    ('err-1150-9030-AK-001', '1150/9030/AK', 'GEO-001', 'Koordinaten fehlen in allen Quellen', 'error', 'lat', '2026-01-05T08:00:00Z', NULL),
    ('err-1170-2050-AM-001', '1170/2050/AM', 'ADR-006', 'Strasse: SAP ''Bahnhofstrasse'', GWR ''Bahnhofstr.''', 'info', 'strasse', '2026-01-14T09:30:00Z', NULL),
    ('err-1200-5080-AP-001', '1200/5080/AP', 'GEO-001', 'Koordinaten fehlen in allen Quellen', 'error', 'lat', '2026-01-10T08:00:00Z', NULL),
    ('err-1200-5080-AP-002', '1200/5080/AP', 'ID-001', 'Keine EGID vorhanden', 'error', 'egid', '2026-01-10T08:00:00Z', NULL),
    ('err-1200-5080-AP-003', '1200/5080/AP', 'ADR-004', 'PLZ: SAP ''2502'', GWR ''2501''', 'warning', 'plz', '2026-01-10T08:00:00Z', NULL),
    ('err-1230-8110-AS-001', '1230/8110/AS', 'ID-003', 'EGID Diskrepanz: SAP 7890123, GWR 7890124', 'error', 'egid', '2026-01-12T09:00:00Z', NULL),
    ('err-1230-8110-AS-002', '1230/8110/AS', 'GEO-002', 'SAP- und GWR-Koordinaten weichen um 85m ab', 'warning', 'lat', '2026-01-12T09:00:00Z', NULL),
    ('err-1240-9120-AT-001', '1240/9120/AT', 'GEO-001', 'Koordinaten fehlen in allen Quellen', 'error', 'lat', '2026-01-06T08:00:00Z', NULL),
    ('err-1240-9120-AT-002', '1240/9120/AT', 'ID-001', 'Keine EGID vorhanden', 'error', 'egid', '2026-01-06T08:00:00Z', NULL),
    ('err-1240-9120-AT-003', '1240/9120/AT', 'ADR-006', 'Strasse: SAP ''Avenue de la Gare'', GWR ''Av. de la Gare''', 'info', 'strasse', '2026-01-06T08:00:00Z', NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- EVENTS (Activity Log)
-- ============================================================================

INSERT INTO events (id, building_id, user_id, user_name, type, action, details, created_at) VALUES
    (1, '1080/2020/AA', 1, 'M. Keller', 'comment', 'Kommentar hinzugefügt', 'Vor Ort verifiziert - GWR Position ist korrekt.', '2026-01-12T14:32:00Z'),
    (2, '1080/2020/AA', NULL, 'System', 'assignment', 'Zugewiesen', 'Zugewiesen an M. Keller', '2026-01-10T09:15:00Z'),
    (3, '1080/2020/AA', NULL, 'System', 'detection', 'Fehler erkannt', 'Automatisch erkannt: Koordinatenabweichung > 30m', '2026-01-10T08:00:00Z'),
    (4, '1080/2021/AB', NULL, 'System', 'detection', 'Fehler erkannt', 'Kritische Fehler erkannt: Keine Koordinaten, EGID nicht gefunden', '2026-01-08T08:00:00Z'),
    (5, '1090/3010/AC', 2, 'S. Brunner', 'comment', 'Kommentar hinzugefügt', 'Archivdokumente angefragt zur Klärung.', '2026-01-14T11:45:00Z'),
    (6, '1090/3010/AC', 2, 'S. Brunner', 'status', 'Status geändert', 'Status: Zugewiesen → In Prüfung', '2026-01-14T11:30:00Z'),
    (7, '1090/3010/AC', 4, 'A. Meier', 'assignment', 'Zugewiesen', 'Zugewiesen an S. Brunner', '2026-01-13T09:00:00Z'),
    (8, '1100/4050/AD', NULL, 'System', 'status', 'Status geändert', 'Alle Prüfungen bestanden - automatisch abgeschlossen', '2026-01-15T16:00:00Z'),
    (9, '1100/4050/AD', 3, 'T. Weber', 'correction', 'Korrektur angewendet', 'Koordinaten aus GWR übernommen', '2026-01-15T15:45:00Z'),
    (10, '1110/5020/AE', 4, 'A. Meier', 'assignment', 'Zugewiesen', 'Zugewiesen an T. Weber', '2026-01-10T10:30:00Z'),
    (11, '1120/6030/AF', NULL, 'System', 'detection', 'Fehler erkannt', 'Kritischer Fehler erkannt - manuelle Prüfung erforderlich', '2026-01-05T08:00:00Z'),
    (12, '1100/4051/AG', NULL, 'System', 'assignment', 'Zugewiesen', 'Zugewiesen an A. Meier', '2026-01-11T09:00:00Z'),
    (13, '1140/8020/AJ', 1, 'M. Keller', 'comment', 'Kommentar hinzugefügt', 'Vor Ort geprüft - Hausnummer ist 15a.', '2026-01-13T16:20:00Z'),
    (14, '1140/8020/AJ', 1, 'M. Keller', 'status', 'Status geändert', 'Status: Zugewiesen → In Prüfung', '2026-01-13T16:15:00Z'),
    (15, '1150/9030/AK', NULL, 'System', 'detection', 'Fehler erkannt', 'Position falsch, Daten veraltet', '2026-01-01T08:00:00Z'),
    (16, '1160/1040/AL', 4, 'A. Meier', 'assignment', 'Zugewiesen', 'Zugewiesen an S. Brunner', '2026-01-09T14:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Reset event sequence
SELECT setval('events_id_seq', (SELECT MAX(id) FROM events));

-- ============================================================================
-- VERIFY IMPORT
-- ============================================================================
SELECT 'Users:' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Buildings:', COUNT(*) FROM buildings
UNION ALL
SELECT 'Rule Sets:', COUNT(*) FROM rule_sets
UNION ALL
SELECT 'Rules:', COUNT(*) FROM rules
UNION ALL
SELECT 'Comments:', COUNT(*) FROM comments
UNION ALL
SELECT 'Errors:', COUNT(*) FROM errors
UNION ALL
SELECT 'Events:', COUNT(*) FROM events;
