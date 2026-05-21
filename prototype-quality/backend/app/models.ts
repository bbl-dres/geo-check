/**
 * models.ts - Data types for the Geo-Check rule engine
 */

/** A field that has values from SAP and GWR sources */
export interface SourceField {
  sap: string;
  gwr: string;
  korrektur: string;
  match: boolean;
}

/** Building record as stored in Supabase (snake_case matches DB columns) */
export interface Building {
  id: string;
  name: string;
  portfolio: string;
  priority: string;
  confidence: {
    total: number;
    sap: number;
    gwr: number;
    georef?: number;
  };
  assignee: string | null;
  kanban_status: string;
  due_date: string | null;
  in_gwr: boolean;
  map_lat: number;
  map_lng: number;
  // Source comparison fields — Address
  country: SourceField;
  kanton: SourceField;
  gemeinde: SourceField;
  bfs_nr: SourceField;
  plz: SourceField;
  ort: SourceField;
  strasse: SourceField;
  hausnummer: SourceField;
  zusatz: SourceField;
  // Source comparison fields — Identifiers
  egid: SourceField;
  egrid: SourceField;
  lat: SourceField;
  lng: SourceField;
  // Source comparison fields — Classification
  gkat: SourceField;
  gklas: SourceField;
  gstat: SourceField;
  gbaup: SourceField;
  gbauj: SourceField;
  // Source comparison fields — Measurements
  gastw: SourceField;
  ganzwhg: SourceField;
  garea: SourceField;
  parcel_area: SourceField;
}

/** Severity levels for validation errors */
export type Severity = "error" | "warning" | "info";

/** A validation error produced by the rule engine */
export interface ValidationError {
  checkId: string;
  description: string;
  level: Severity;
  field?: string;
}

/** Result of checking a single building */
export interface CheckResult {
  buildingId: string;
  confidence: {
    total: number;
    sap: number;
    gwr: number;
    georef: number;
  };
  errors: ValidationError[];
  checkedAt: string;
}

/** Rule metadata (from DB or rules.json) */
export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  ruleSetId: string;
}

/** Rule set grouping */
export interface RuleSet {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: RuleDefinition[];
}
