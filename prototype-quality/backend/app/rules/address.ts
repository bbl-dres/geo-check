/**
 * address.ts - Adresse (ADR-001 to ADR-008)
 *
 * SAP ↔ GWR address consistency per GeoNV.
 * Compares address components between SAP RE-FX and GWR.
 *
 * Comparison behavior (RULES.md §3.2):
 * - Values compared exactly as stored (no normalization per §1.7)
 * - Empty values in both sources = no error
 * - Empty in one source, value in other = flagged as difference
 *
 * Source of truth: docs/RULES.md §3.2
 */

import { registerRule } from "../engine/registry.ts";
import type { Building, SourceField } from "../models.ts";

/**
 * Generic SAP ↔ GWR source comparison.
 * Returns error message if values differ, null if they match or both empty.
 */
function compareSourceField(
  field: SourceField,
  fieldLabel: string,
): string | null {
  const sap = field.sap;
  const gwr = field.gwr;

  // Both empty → no error
  if (!sap && !gwr) return null;

  // One empty, other has value → flagged
  if (!sap && gwr) return `${fieldLabel}: fehlt in SAP (GWR: ${gwr})`;
  if (sap && !gwr) return `${fieldLabel}: fehlt in GWR (SAP: ${sap})`;

  // Both present, compare as-is (no normalization per §1.7)
  if (sap !== gwr) {
    return `${fieldLabel}: SAP '${sap}', GWR '${gwr}'`;
  }

  return null;
}

// ADR-001: Land — Country code differs (should be CH)
registerRule("ADR-001", "error", "country", "address", (b: Building) => {
  return compareSourceField(b.country, "Ländercode");
});

// ADR-002: Kanton — Canton code differs
registerRule("ADR-002", "warning", "kanton", "address", (b: Building) => {
  return compareSourceField(b.kanton, "Kanton");
});

// ADR-003: Gemeinde — Municipality name differs
registerRule("ADR-003", "warning", "gemeinde", "address", (b: Building) => {
  return compareSourceField(b.gemeinde, "Gemeinde");
});

// ADR-004: PLZ — Postal code differs
registerRule("ADR-004", "warning", "plz", "address", (b: Building) => {
  return compareSourceField(b.plz, "PLZ");
});

// ADR-005: Ort — Locality differs
registerRule("ADR-005", "warning", "ort", "address", (b: Building) => {
  return compareSourceField(b.ort, "Ort");
});

// ADR-006: Strasse — Street name differs
registerRule("ADR-006", "info", "strasse", "address", (b: Building) => {
  return compareSourceField(b.strasse, "Strasse");
});

// ADR-007: Hausnummer — House number differs or missing
registerRule("ADR-007", "warning", "hausnummer", "address", (b: Building) => {
  return compareSourceField(b.hausnummer, "Hausnummer");
});

// ADR-008: Zusatz — Address supplement differs
registerRule("ADR-008", "info", "zusatz", "address", (b: Building) => {
  return compareSourceField(b.zusatz, "Zusatz");
});
