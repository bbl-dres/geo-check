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

/** Building record as stored in Supabase */
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
  kanbanStatus: string;
  dueDate: string | null;
  inGwr: boolean;
  gwrEgid: string;
  mapLat: number;
  mapLng: number;
  // Source comparison fields
  country: SourceField;
  kanton: SourceField;
  gemeinde: SourceField;
  plz: SourceField;
  ort: SourceField;
  strasse: SourceField;
  hausnummer: SourceField;
  zusatz: SourceField;
  egid: SourceField;
  egrid: SourceField;
  gkat: SourceField;
  gklas: SourceField;
  gbaup: SourceField;
  lat: SourceField;
  lng: SourceField;
  parcelArea: SourceField;
  garea: SourceField;
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
