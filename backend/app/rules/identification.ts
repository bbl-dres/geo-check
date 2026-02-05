/**
 * identification.ts - Identifikation (ID-001 to ID-007)
 *
 * Critical checks for linkage to authoritative registers.
 * Ensures SAP RE-FX records link to the correct building in GWR
 * and the correct parcel in the cadastre.
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

// ID-002: EGID Format (1-9 digits, no leading zeros)
// Consolidation: skipped if ID-001 already triggers
registerRule("ID-002", "error", "egid", "identification", (b: Building) => {
  const egid = resolve(b.egid);
  if (!egid) return null; // Handled by ID-001
  if (!/^[1-9][0-9]{0,8}$/.test(egid)) {
    return `EGID hat ungültiges Format: ${egid}`;
  }
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

// ID-005: EGID Duplikat
// Same EGID used for multiple SAP records — requires cross-building check
// Note: This rule runs per-building. The batch runner (check-all) should
// detect duplicates by collecting all EGIDs across the dataset.
registerRule("ID-005", "error", "egid", "identification", (_b: Building) => {
  // Cross-building check: implemented in batch runner, not here
  return null;
});

// ID-006: Koordinaten Duplikat
// Same coordinates used for multiple SAP records — requires cross-building check
registerRule("ID-006", "warning", "lat", "identification", (_b: Building) => {
  // Cross-building check: implemented in batch runner, not here
  return null;
});

// ID-007: Mehrere GWR-Gebäude
// One SAP record links to multiple GWR buildings (1:N)
// Flagged as info for awareness, not an error
registerRule("ID-007", "info", "inGwr", "identification", (_b: Building) => {
  // Requires GWR API lookup — placeholder for future implementation
  return null;
});
