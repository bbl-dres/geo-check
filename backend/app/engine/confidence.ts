/**
 * confidence.ts - Calculate confidence scores per source
 *
 * Confidence is based on field match rates and error penalties.
 *
 * Formula (RULES.md §11):
 *   total = (georef × 0.30) + (sap × 0.35) + (gwr × 0.35)
 *
 * Source of truth: docs/RULES.md §11
 */

import type { Building, ValidationError } from "../models.ts";

/** Fields that contribute to SAP/GWR confidence (source comparison fields) */
const SOURCE_FIELDS = [
  "country", "kanton", "gemeinde", "plz", "ort",
  "strasse", "hausnummer", "egid", "gkat", "gklas",
  "gbaup", "lat", "lng",
] as const;

/** Severity weights for error penalty */
const SEVERITY_WEIGHT: Record<string, number> = {
  error: 15,
  warning: 8,
  info: 2,
};

interface ConfidenceScores {
  total: number;
  sap: number;
  gwr: number;
  georef: number;
}

/**
 * Calculate confidence scores for a building based on:
 * 1. Field match rate between SAP and GWR
 * 2. Error penalties weighted by severity
 */
export function calculateConfidence(
  building: Building,
  errors: ValidationError[],
): ConfidenceScores {
  // 1. Calculate field match rates
  const sapScore = calculateFieldMatchRate(building);
  const gwrScore = calculateFieldMatchRate(building);

  // 2. Calculate error penalty per source prefix
  const sapPenalty = calculateErrorPenalty(errors, ["ADR-", "ID-"]);
  const gwrPenalty = calculateErrorPenalty(errors, ["ADR-", "ID-"]);
  const geoPenalty = calculateErrorPenalty(errors, ["GEO-"]);

  // 3. Combine: field match rate minus error penalty
  const sap = clamp(Math.round(sapScore - sapPenalty));
  const gwr = clamp(Math.round(gwrScore - gwrPenalty));
  const georef = clamp(Math.round(100 - geoPenalty));

  // Total: weighted average per RULES.md §11
  const total = clamp(Math.round(georef * 0.30 + sap * 0.35 + gwr * 0.35));

  return { total, sap, gwr, georef };
}

/** Calculate what % of source comparison fields match */
function calculateFieldMatchRate(building: Building): number {
  let present = 0;
  let matched = 0;

  for (const fieldName of SOURCE_FIELDS) {
    const field = building[fieldName as keyof Building];
    if (field && typeof field === "object" && "sap" in field) {
      const sf = field as { sap: string; gwr: string; match: boolean };
      // Field has data in at least one source
      if (sf.sap || sf.gwr) {
        present++;
        if (sf.match) matched++;
      }
    }
  }

  if (present === 0) return 50; // No data to compare
  return (matched / present) * 100;
}

/** Sum error penalties for rules matching any of the given prefixes */
function calculateErrorPenalty(
  errors: ValidationError[],
  prefixes: string[],
): number {
  return errors
    .filter((e) => prefixes.some((p) => e.checkId.startsWith(p)))
    .reduce((sum, e) => sum + (SEVERITY_WEIGHT[e.level] ?? 5), 0);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
