/**
 * confidence.ts - Dimension-based confidence scoring
 *
 * Confidence is calculated per field group (dimension), then combined
 * into a weighted total. Each dimension scores the match rate of its
 * fields: (matched + corrected) / present × 100.
 *
 * Dimensions & weights (RULES.md §11):
 *   Identifikation  30%  — egid, egrid
 *   Adresse          30%  — plz, ort, strasse, hausnummer
 *   Lage             20%  — lat, lng
 *   Klassifikation   10%  — gkat, gklas, gstat, gbaup, gbauj
 *   Bemessungen      10%  — gastw, ganzwhg, garea, parcel_area
 *
 * Fields with no data in either source are excluded (dimension → null).
 * Dimensions with null are excluded from the total; their weight is
 * redistributed proportionally to dimensions that have data.
 *
 * Source of truth: docs/RULES.md §11
 */

import type { Building, ValidationError } from "../models.ts";

/** Dimension definitions: field groups with weights */
const DIMENSIONS = [
  { key: "identifikation", fields: ["egid", "egrid"], weight: 0.30 },
  { key: "adresse", fields: ["plz", "ort", "strasse", "hausnummer"], weight: 0.30 },
  { key: "lage", fields: ["lat", "lng"], weight: 0.20 },
  { key: "klassifikation", fields: ["gkat", "gklas", "gstat", "gbaup", "gbauj"], weight: 0.10 },
  { key: "bemessungen", fields: ["gastw", "ganzwhg", "garea", "parcel_area"], weight: 0.10 },
] as const;

interface ConfidenceScores {
  total: number;
  identifikation: number | null;
  adresse: number | null;
  lage: number | null;
  klassifikation: number | null;
  bemessungen: number | null;
}

/**
 * Calculate confidence scores for a building based on dimension match rates.
 * A field counts as "matched" if SAP === GWR or if a korrektur value is set.
 */
export function calculateConfidence(
  building: Building,
  _errors: ValidationError[],
): ConfidenceScores {
  const dimScores: Record<string, number | null> = {};

  for (const dim of DIMENSIONS) {
    dimScores[dim.key] = calculateDimensionScore(building, dim.fields);
  }

  // Weighted total — redistribute weight from null dimensions
  let weightSum = 0;
  let scoreSum = 0;

  for (const dim of DIMENSIONS) {
    const score = dimScores[dim.key];
    if (score != null) {
      weightSum += dim.weight;
      scoreSum += score * dim.weight;
    }
  }

  const total = weightSum > 0 ? clamp(Math.round(scoreSum / weightSum)) : 0;

  return {
    total,
    identifikation: dimScores.identifikation ?? null,
    adresse: dimScores.adresse ?? null,
    lage: dimScores.lage ?? null,
    klassifikation: dimScores.klassifikation ?? null,
    bemessungen: dimScores.bemessungen ?? null,
  };
}

/**
 * Calculate match rate for a set of fields.
 * Returns null if no field in the group has data in either source.
 *
 * A field is "resolved" (counts toward score) if:
 * - match is true (SAP === GWR), OR
 * - korrektur is set (user verified/corrected the value)
 */
function calculateDimensionScore(
  building: Building,
  fields: readonly string[],
): number | null {
  let present = 0;
  let resolved = 0;

  for (const fieldName of fields) {
    const field = building[fieldName as keyof Building];
    if (field && typeof field === "object" && "sap" in field) {
      const sf = field as { sap: string; gwr: string; korrektur?: string; match: boolean };
      // Count field if either source has data
      if (sf.sap || sf.gwr) {
        present++;
        if (sf.match || sf.korrektur) resolved++;
      }
    }
  }

  if (present === 0) return null; // No data in this dimension
  return Math.round((resolved / present) * 100);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
