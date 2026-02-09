/**
 * identification.ts - Identifikation (ID-001, ID-003, ID-004)
 *
 * Critical checks for linkage to authoritative registers.
 * Ensures SAP RE-FX records link to the correct building in GWR
 * and the correct parcel in the cadastre.
 *
 * Cross-building checks (ID-005, ID-006) are handled in runner.ts
 * since they need the full dataset.
 *
 * Source of truth: docs/RULES.md §3.1
 */

import { registerRule } from "../engine/registry.ts";
import type { Building } from "../models.ts";

// Helper: resolve value using priority chain korrektur → GWR → SAP (RULES.md §1.1)
function resolve(field: { korrektur: string; gwr: string; sap: string }): string {
  return field.korrektur || field.gwr || field.sap;
}

// ID-001: EGID vorhanden
// EGID must exist in at least one source
registerRule("ID-001", "error", "egid", "identification", (b: Building) => {
  const egid = resolve(b.egid);
  if (!egid) return "Keine EGID vorhanden";
  return null;
});

// ID-003: EGID verifiziert
// EGID in SAP must match EGID in GWR (not a different building)
// Consolidation: skipped if ID-001 already triggers
registerRule("ID-003", "error", "egid", "identification", (b: Building) => {
  if (!b.egid.sap || !b.egid.gwr) return null;
  if (b.egid.sap !== b.egid.gwr) {
    return `EGID Diskrepanz: SAP ${b.egid.sap}, GWR ${b.egid.gwr}`;
  }
  return null;
});

// ID-004: EGRID vorhanden
// EGRID must exist for cadastre/ÖREB linkage
registerRule("ID-004", "warning", "egrid", "identification", (b: Building) => {
  const egrid = resolve(b.egrid);
  if (!egrid) return "Keine EGRID vorhanden";
  return null;
});
