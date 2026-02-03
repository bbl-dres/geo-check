-- ============================================================================
-- Migration Script - Generated 2026-02-02T19:32:44.677Z
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
    '{"total":67,"sap":100,"gwr":100}'::jsonb,
    1,
    'M. Keller',
    'inprogress',
    '2026-02-15',
    '2026-01-27T14:30:00Z',
    'M. Keller',
    TRUE,
    '2340212',
    47.5656,
    9.3744,
    'TG',
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TG","gwr":"TG","korrektur":"","match":true},"gemeinde":{"sap":"Romanshorn","gwr":"Romanshorn","korrektur":"","match":true},"plz":{"sap":"8590","gwr":"8590","korrektur":"","match":true},"ort":{"sap":"Romanshorn","gwr":"Romanshorn","korrektur":"","match":true},"strasse":{"sap":"Friedrichshafnerstr.","gwr":"Friedrichshafnerstrasse","korrektur":"","match":false},"hausnummer":{"sap":"","gwr":"","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"2340212","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gbaup":{"sap":"8014","gwr":"8014","korrektur":"","match":true},"lat":{"sap":"","gwr":"47.5656","korrektur":"","match":false},"lng":{"sap":"","gwr":"9.3744","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH194381048573","korrektur":"","match":false},"parcelArea":{"sap":"1250","gwr":"1275","korrektur":"","match":false},"footprintArea":{"sap":"480","gwr":"470","korrektur":"","match":false}}'::jsonb,
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
    '{"total":72,"sap":85,"gwr":78}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TG","gwr":"TG","korrektur":"","match":true},"gemeinde":{"sap":"Kreuzlingen","gwr":"Kreuzlingen","korrektur":"","match":true},"plz":{"sap":"8280","gwr":"8280","korrektur":"","match":true},"ort":{"sap":"Kreuzlingen","gwr":"Kreuzlingen","korrektur":"","match":true},"strasse":{"sap":"Hauptstrasse","gwr":"Hauptstr.","korrektur":"","match":false},"hausnummer":{"sap":"12","gwr":"12a","korrektur":"","match":false},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"1456789","korrektur":"","match":false},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1121","korrektur":"","match":false},"gbaup":{"sap":"8017","gwr":"8016","korrektur":"","match":false},"lat":{"sap":"47.65","gwr":"47.6512","korrektur":"","match":true},"lng":{"sap":"9.175","gwr":"9.1756","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH293847561029","korrektur":"","match":false},"parcelArea":{"sap":"685","gwr":"685","korrektur":"","match":true},"footprintArea":{"sap":"310","gwr":"310","korrektur":"","match":true}}'::jsonb,
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
    '{"total":78,"sap":70,"gwr":70}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"SG","gwr":"SG","korrektur":"","match":true},"gemeinde":{"sap":"St. Gallen","gwr":"St. Gallen","korrektur":"","match":true},"plz":{"sap":"9000","gwr":"9000","korrektur":"","match":true},"ort":{"sap":"St. Gallen","gwr":"St. Gallen","korrektur":"","match":true},"strasse":{"sap":"Bahnhofplatz","gwr":"Bahnhofplatz","korrektur":"","match":true},"hausnummer":{"sap":"1","gwr":"1","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"1892345","gwr":"1892345","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1241","gwr":"1241","korrektur":"","match":true},"gbaup":{"sap":"8013","gwr":"8013","korrektur":"","match":true},"lat":{"sap":"47.4235","gwr":"47.4237","korrektur":"","match":true},"lng":{"sap":"9.3678","gwr":"9.3680","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH847291034856","korrektur":"","match":false},"parcelArea":{"sap":"3200","gwr":"3200","korrektur":"","match":true},"footprintArea":{"sap":"1850","gwr":"1850","korrektur":"","match":true}}'::jsonb,
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
    '{"total":98,"sap":95,"gwr":100}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"ZH","gwr":"ZH","korrektur":"","match":true},"gemeinde":{"sap":"Zürich","gwr":"Zürich","korrektur":"","match":true},"plz":{"sap":"8006","gwr":"8006","korrektur":"","match":true},"ort":{"sap":"Zürich","gwr":"Zürich","korrektur":"","match":true},"strasse":{"sap":"Stampfenbachstrasse","gwr":"Stampfenbachstrasse","korrektur":"","match":true},"hausnummer":{"sap":"85","gwr":"85","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"3456789","gwr":"3456789","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"lat":{"sap":"47.3834","gwr":"47.3834","korrektur":"","match":true},"lng":{"sap":"8.5397","gwr":"8.5397","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH583920174635","korrektur":"","match":false},"parcelArea":{"sap":"890","gwr":"890","korrektur":"","match":true},"footprintArea":{"sap":"520","gwr":"520","korrektur":"","match":true}}'::jsonb,
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
    '{"total":72,"sap":60,"gwr":70}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BE","gwr":"BE","korrektur":"","match":true},"gemeinde":{"sap":"Bern","gwr":"Bern","korrektur":"","match":true},"plz":{"sap":"3003","gwr":"3011","korrektur":"","match":false},"ort":{"sap":"Bern","gwr":"Bern","korrektur":"","match":true},"strasse":{"sap":"Bundesgasse","gwr":"Bundes-Gasse","korrektur":"","match":false},"hausnummer":{"sap":"3","gwr":"3","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"5678901","gwr":"5678901","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1261","gwr":"1261","korrektur":"","match":true},"gbaup":{"sap":"8014","gwr":"8014","korrektur":"","match":true},"lat":{"sap":"46.9478","gwr":"46.9480","korrektur":"","match":true},"lng":{"sap":"7.4472","gwr":"7.4474","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH291048573619","korrektur":"","match":false},"parcelArea":{"sap":"1450","gwr":"1450","korrektur":"","match":true},"footprintArea":{"sap":"780","gwr":"764","korrektur":"","match":false}}'::jsonb,
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
    '{"total":35,"sap":50,"gwr":35}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"GR","gwr":"GR","korrektur":"","match":true},"gemeinde":{"sap":"Chur","gwr":"Chur","korrektur":"","match":true},"plz":{"sap":"7000","gwr":"7000","korrektur":"","match":true},"ort":{"sap":"Chur","gwr":"Chur","korrektur":"","match":true},"strasse":{"sap":"Grabenstrasse","gwr":"Grabenstrasse","korrektur":"","match":true},"hausnummer":{"sap":"1","gwr":"1","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"9012345","gwr":"9012999","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1251","gwr":"1251","korrektur":"","match":true},"gbaup":{"sap":"8011","gwr":"8017","korrektur":"","match":false},"lat":{"sap":"46.8520","gwr":"46.8499","korrektur":"","match":false},"lng":{"sap":"9.5350","gwr":"9.5329","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH738291045867","korrektur":"","match":false},"parcelArea":{"sap":"2100","gwr":"2142","korrektur":"","match":false},"footprintArea":{"sap":"950","gwr":"950","korrektur":"","match":true}}'::jsonb,
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
    '{"total":65,"sap":55,"gwr":60}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"ZH","gwr":"ZH","korrektur":"","match":true},"gemeinde":{"sap":"Winterthur","gwr":"Winterthur","korrektur":"","match":true},"plz":{"sap":"8400","gwr":"8400","korrektur":"","match":true},"ort":{"sap":"Winterthur","gwr":"Winterthur","korrektur":"","match":true},"strasse":{"sap":"Technikumstrasse","gwr":"Technikumstrasse","korrektur":"","match":true},"hausnummer":{"sap":"8","gwr":"8","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"2345678","gwr":"2345678","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1263","gwr":"1263","korrektur":"","match":true},"gbaup":{"sap":"","gwr":"8020","korrektur":"","match":false},"lat":{"sap":"47.4977","gwr":"47.4979","korrektur":"","match":true},"lng":{"sap":"8.7244","gwr":"8.7246","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH482910384756","korrektur":"","match":false},"parcelArea":{"sap":"5600","gwr":"5600","korrektur":"","match":true},"footprintArea":{"sap":"2800","gwr":"2800","korrektur":"","match":true}}'::jsonb,
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
    '{"total":82,"sap":75,"gwr":80}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TG","gwr":"TG","korrektur":"","match":true},"gemeinde":{"sap":"Frauenfeld","gwr":"Frauenfeld","korrektur":"","match":true},"plz":{"sap":"8510","gwr":"8510","korrektur":"","match":true},"ort":{"sap":"Frauenfeld","gwr":"Frauenfeld","korrektur":"","match":true},"strasse":{"sap":"Schlossmühlestrasse","gwr":"Schlossmühlestrasse","korrektur":"","match":true},"hausnummer":{"sap":"15","gwr":"15","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"4567890","gwr":"4567890","korrektur":"","match":true},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gbaup":{"sap":"8018","gwr":"8018","korrektur":"","match":true},"lat":{"sap":"47.5531","gwr":"47.5533","korrektur":"","match":true},"lng":{"sap":"8.8985","gwr":"8.8987","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH192837465019","korrektur":"","match":false},"parcelArea":{"sap":"720","gwr":"720","korrektur":"","match":true},"footprintArea":{"sap":"380","gwr":"380","korrektur":"","match":true}}'::jsonb,
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
    '{"total":95,"sap":92,"gwr":95}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BS","gwr":"BS","korrektur":"","match":true},"gemeinde":{"sap":"Basel","gwr":"Basel","korrektur":"","match":true},"plz":{"sap":"4051","gwr":"4051","korrektur":"","match":true},"ort":{"sap":"Basel","gwr":"Basel","korrektur":"","match":true},"strasse":{"sap":"Elisabethenstrasse","gwr":"Elisabethenstrasse","korrektur":"","match":true},"hausnummer":{"sap":"51","gwr":"51","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"6789012","gwr":"6789012","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gbaup":{"sap":"8021","gwr":"8021","korrektur":"","match":true},"lat":{"sap":"47.5480","gwr":"47.5480","korrektur":"","match":true},"lng":{"sap":"7.5896","gwr":"7.5896","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH847291056382","korrektur":"","match":false},"parcelArea":{"sap":"1100","gwr":"1100","korrektur":"","match":true},"footprintArea":{"sap":"650","gwr":"637","korrektur":"","match":false}}'::jsonb,
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
    '{"total":70,"sap":68,"gwr":67}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"LU","gwr":"LU","korrektur":"","match":true},"gemeinde":{"sap":"Luzern","gwr":"Luzern","korrektur":"","match":true},"plz":{"sap":"6003","gwr":"6003","korrektur":"","match":true},"ort":{"sap":"Luzern","gwr":"Luzern","korrektur":"","match":true},"strasse":{"sap":"Hirschengraben","gwr":"Hirschengraben","korrektur":"","match":true},"hausnummer":{"sap":"15","gwr":"15a","korrektur":"","match":false},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"7890123","gwr":"7890123","korrektur":"","match":true},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"lat":{"sap":"47.0500","gwr":"47.0502","korrektur":"","match":true},"lng":{"sap":"8.3091","gwr":"8.3093","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH582910473856","korrektur":"","match":false},"parcelArea":{"sap":"680","gwr":"680","korrektur":"","match":true},"footprintArea":{"sap":"420","gwr":"420","korrektur":"","match":true}}'::jsonb,
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
    '{"total":28,"sap":45,"gwr":30}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"GE","gwr":"GE","korrektur":"","match":true},"gemeinde":{"sap":"Genève","gwr":"Genève","korrektur":"","match":true},"plz":{"sap":"1202","gwr":"1202","korrektur":"","match":true},"ort":{"sap":"Genève","gwr":"Genève","korrektur":"","match":true},"strasse":{"sap":"Rue de Lausanne","gwr":"Rue de Lausanne","korrektur":"","match":true},"hausnummer":{"sap":"65","gwr":"65","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"8901234","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1251","gwr":"1251","korrektur":"","match":true},"gbaup":{"sap":"8014","gwr":"8014","korrektur":"","match":true},"lat":{"sap":"46.2100","gwr":"46.2138","korrektur":"","match":false},"lng":{"sap":"6.1450","gwr":"6.1490","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH293847561029","korrektur":"","match":false},"parcelArea":{"sap":"1800","gwr":"1836","korrektur":"","match":false},"footprintArea":{"sap":"920","gwr":"920","korrektur":"","match":true}}'::jsonb,
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
    '{"total":85,"sap":80,"gwr":82}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"TI","gwr":"TI","korrektur":"","match":true},"gemeinde":{"sap":"Lugano","gwr":"Lugano","korrektur":"","match":true},"plz":{"sap":"6900","gwr":"6900","korrektur":"","match":true},"ort":{"sap":"Lugano","gwr":"Lugano","korrektur":"","match":true},"strasse":{"sap":"Via Nassa","gwr":"Via Nassa","korrektur":"","match":true},"hausnummer":{"sap":"29","gwr":"29","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"9012345","gwr":"9012345","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1261","gwr":"1261","korrektur":"","match":true},"gbaup":{"sap":"8017","gwr":"8017","korrektur":"","match":true},"lat":{"sap":"46.0048","gwr":"46.0050","korrektur":"","match":true},"lng":{"sap":"8.9518","gwr":"8.9520","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH184729301856","korrektur":"","match":false},"parcelArea":{"sap":"950","gwr":"950","korrektur":"","match":true},"footprintArea":{"sap":"580","gwr":"580","korrektur":"","match":true}}'::jsonb,
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
    '{"total":45,"sap":55,"gwr":50}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"AG","gwr":"AG","korrektur":"","match":true},"gemeinde":{"sap":"Aarau","gwr":"Aarau","korrektur":"","match":true},"plz":{"sap":"5000","gwr":"5000","korrektur":"","match":true},"ort":{"sap":"Aarau","gwr":"Aarau","korrektur":"","match":true},"strasse":{"sap":"Bahnhofstrasse","gwr":"Bahnhofstr.","korrektur":"","match":false},"hausnummer":{"sap":"20","gwr":"20","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"1234567","gwr":"1234567","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gbaup":{"sap":"8016","gwr":"8017","korrektur":"","match":false},"lat":{"sap":"47.3920","gwr":"47.3925","korrektur":"","match":true},"lng":{"sap":"8.0440","gwr":"8.0444","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH738492015738","korrektur":"","match":false},"parcelArea":{"sap":"1350","gwr":"1350","korrektur":"","match":true},"footprintArea":{"sap":"720","gwr":"706","korrektur":"","match":false}}'::jsonb,
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
    '{"total":92,"sap":90,"gwr":90}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"SO","gwr":"SO","korrektur":"","match":true},"gemeinde":{"sap":"Solothurn","gwr":"Solothurn","korrektur":"","match":true},"plz":{"sap":"4500","gwr":"4500","korrektur":"","match":true},"ort":{"sap":"Solothurn","gwr":"Solothurn","korrektur":"","match":true},"strasse":{"sap":"Hauptgasse","gwr":"Hauptgasse","korrektur":"","match":true},"hausnummer":{"sap":"5","gwr":"5","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"2345678","gwr":"2345678","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1272","gwr":"1272","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"lat":{"sap":"47.2088","gwr":"47.2088","korrektur":"","match":true},"lng":{"sap":"7.5378","gwr":"7.5378","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH849201573846","korrektur":"","match":false},"parcelArea":{"sap":"480","gwr":"480","korrektur":"","match":true},"footprintArea":{"sap":"320","gwr":"320","korrektur":"","match":true}}'::jsonb,
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
    '{"total":88,"sap":85,"gwr":88}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BE","gwr":"BE","korrektur":"","match":true},"gemeinde":{"sap":"Thun","gwr":"Thun","korrektur":"","match":true},"plz":{"sap":"3600","gwr":"3600","korrektur":"","match":true},"ort":{"sap":"Thun","gwr":"Thun","korrektur":"","match":true},"strasse":{"sap":"Bälliz","gwr":"Bälliz","korrektur":"","match":true},"hausnummer":{"sap":"42","gwr":"42","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"3456789","gwr":"3456789","korrektur":"","match":true},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gbaup":{"sap":"8019","gwr":"8019","korrektur":"","match":true},"lat":{"sap":"46.758","gwr":"46.758","korrektur":"","match":true},"lng":{"sap":"7.629","gwr":"7.629","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH582910384756","korrektur":"","match":false},"parcelArea":{"sap":"560","gwr":"560","korrektur":"","match":true},"footprintArea":{"sap":"380","gwr":"380","korrektur":"","match":true}}'::jsonb,
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
    '{"total":38,"sap":45,"gwr":45}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"BE","gwr":"BE","korrektur":"","match":true},"gemeinde":{"sap":"Biel/Bienne","gwr":"Biel/Bienne","korrektur":"","match":true},"plz":{"sap":"2502","gwr":"2501","korrektur":"","match":false},"ort":{"sap":"Biel/Bienne","gwr":"Biel/Bienne","korrektur":"","match":true},"strasse":{"sap":"Nidaugasse","gwr":"Nidaugasse","korrektur":"","match":true},"hausnummer":{"sap":"14","gwr":"14","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"4567890","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1251","gwr":"1252","korrektur":"","match":false},"gbaup":{"sap":"8013","gwr":"8013","korrektur":"","match":true},"lat":{"sap":"","gwr":"47.1368","korrektur":"","match":false},"lng":{"sap":"","gwr":"7.2467","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH293018475639","korrektur":"","match":false},"parcelArea":{"sap":"1680","gwr":"1714","korrektur":"","match":false},"footprintArea":{"sap":"890","gwr":"890","korrektur":"","match":true}}'::jsonb,
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
    '{"total":75,"sap":70,"gwr":75}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"SH","gwr":"SH","korrektur":"","match":true},"gemeinde":{"sap":"Schaffhausen","gwr":"Schaffhausen","korrektur":"","match":true},"plz":{"sap":"8200","gwr":"8200","korrektur":"","match":true},"ort":{"sap":"Schaffhausen","gwr":"Schaffhausen","korrektur":"","match":true},"strasse":{"sap":"Vordergasse","gwr":"Vordergasse","korrektur":"","match":true},"hausnummer":{"sap":"61","gwr":"61","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"5678901","gwr":"5678901","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1220","gwr":"1220","korrektur":"","match":true},"gbaup":{"sap":"","gwr":"8014","korrektur":"","match":false},"lat":{"sap":"47.6959","gwr":"47.6961","korrektur":"","match":true},"lng":{"sap":"8.6348","gwr":"8.6350","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH847291056382","korrektur":"","match":false},"parcelArea":{"sap":"420","gwr":"420","korrektur":"","match":true},"footprintArea":{"sap":"280","gwr":"274","korrektur":"","match":false}}'::jsonb,
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
    '{"total":96,"sap":95,"gwr":95}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"ZG","gwr":"ZG","korrektur":"","match":true},"gemeinde":{"sap":"Zug","gwr":"Zug","korrektur":"","match":true},"plz":{"sap":"6300","gwr":"6300","korrektur":"","match":true},"ort":{"sap":"Zug","gwr":"Zug","korrektur":"","match":true},"strasse":{"sap":"Baarerstrasse","gwr":"Baarerstrasse","korrektur":"","match":true},"hausnummer":{"sap":"8","gwr":"8","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"6789012","gwr":"6789012","korrektur":"","match":true},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1261","gwr":"1261","korrektur":"","match":true},"gbaup":{"sap":"8022","gwr":"8022","korrektur":"","match":true},"lat":{"sap":"47.1724","gwr":"47.1724","korrektur":"","match":true},"lng":{"sap":"8.5179","gwr":"8.5179","korrektur":"","match":true},"egrid":{"sap":"","gwr":"CH192837465019","korrektur":"","match":false},"parcelArea":{"sap":"780","gwr":"780","korrektur":"","match":true},"footprintArea":{"sap":"520","gwr":"520","korrektur":"","match":true}}'::jsonb,
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
    '{"total":58,"sap":60,"gwr":60}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"NE","gwr":"NE","korrektur":"","match":true},"gemeinde":{"sap":"Neuchâtel","gwr":"Neuchâtel","korrektur":"","match":true},"plz":{"sap":"2000","gwr":"2000","korrektur":"","match":true},"ort":{"sap":"Neuchâtel","gwr":"Neuchâtel","korrektur":"","match":true},"strasse":{"sap":"Rue du Seyon","gwr":"Rue du Seyon","korrektur":"","match":true},"hausnummer":{"sap":"12","gwr":"12","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"7890123","gwr":"7890124","korrektur":"","match":false},"gkat":{"sap":"1060","gwr":"1060","korrektur":"","match":true},"gklas":{"sap":"1263","gwr":"1263","korrektur":"","match":true},"gbaup":{"sap":"8016","gwr":"8016","korrektur":"","match":true},"lat":{"sap":"46.990","gwr":"46.992","korrektur":"","match":false},"lng":{"sap":"6.929","gwr":"6.931","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH738291045867","korrektur":"","match":false},"parcelArea":{"sap":"2200","gwr":"2200","korrektur":"","match":true},"footprintArea":{"sap":"1100","gwr":"1100","korrektur":"","match":true}}'::jsonb,
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
    '{"total":32,"sap":40,"gwr":40}'::jsonb,
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
    '{"country":{"sap":"CH","gwr":"CH","korrektur":"","match":true},"kanton":{"sap":"VS","gwr":"VS","korrektur":"","match":true},"gemeinde":{"sap":"Sion","gwr":"Sion","korrektur":"","match":true},"plz":{"sap":"1950","gwr":"1950","korrektur":"","match":true},"ort":{"sap":"Sion","gwr":"Sion","korrektur":"","match":true},"strasse":{"sap":"Avenue de la Gare","gwr":"Av. de la Gare","korrektur":"","match":false},"hausnummer":{"sap":"3","gwr":"3","korrektur":"","match":true},"zusatz":{"sap":"","gwr":"","korrektur":"","match":true},"egid":{"sap":"","gwr":"8901234","korrektur":"","match":false},"gkat":{"sap":"1020","gwr":"1020","korrektur":"","match":true},"gklas":{"sap":"1122","gwr":"1122","korrektur":"","match":true},"gbaup":{"sap":"8015","gwr":"8015","korrektur":"","match":true},"lat":{"sap":"","gwr":"46.2333","korrektur":"","match":false},"lng":{"sap":"","gwr":"7.3592","korrektur":"","match":false},"egrid":{"sap":"","gwr":"CH482910573846","korrektur":"","match":false},"parcelArea":{"sap":"920","gwr":"920","korrektur":"","match":true},"footprintArea":{"sap":"540","gwr":"540","korrektur":"","match":true}}'::jsonb,
    '[]'::jsonb
);

-- ============================================================================
-- VERIFY IMPORT
-- ============================================================================
SELECT 'Users:' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Buildings:', COUNT(*) FROM buildings;
