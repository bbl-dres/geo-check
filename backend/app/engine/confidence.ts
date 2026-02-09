/**
 * confidence.ts - Calculate confidence scores per source
 *
 * Confidence is based on field match rates and error penalties.
 *
 * Formula (RULES.md §11):
 *   total = (georef × 0.30) + (sap × 0.35) + (gwr × 0.35)
 *
 * SAP score: % of fields where SAP has data that match GWR
 * GWR score: % of fields where GWR has data that match SAP
 * Georef score: 100 minus geometry error penalties
 *
 * Source of truth: docs/RULES.md §11
 */

import type { Building, ValidationError } from "../models.ts";

/** Fields that contribute to SAP/GWR confidence (all TVP source comparison fields) */
const SOURCE_FIELDS = [
  "country", "kanton", "gemeinde", "bfs_nr", "plz", "ort",
  "strasse", "hausnummer", "zusatz", "egid", "egrid",
  "lat", "lng", "gkat", "gklas", "gstat", "gbaup", "gbauj",
  "gastw", "ganzwhg", "garea", "parcel_area",
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
 * 1. Field match rate per source (SAP completeness vs GWR completeness)
 * 2. Error penalties weighted by severity
 */
export function calculateConfidence(
  building: Building,
  errors: ValidationError[],
): ConfidenceScores {
  // 1. Calculate field match rates per source
  const sapScore = calculateFieldMatchRate(building, "sap");
  const gwrScore = calculateFieldMatchRate(building, "gwr");

  // 2. Calculate error penalty
  // ID/ADR errors affect both sources (they're comparison discrepancies)
  const comparisonPenalty = calculateErrorPenalty(errors, ["ADR-", "ID-"]);
  const geoPenalty = calculateErrorPenalty(errors, ["GEO-"]);

  // 3. Combine: field match rate minus error penalty
  const sap = clamp(Math.round(sapScore - comparisonPenalty));
  const gwr = clamp(Math.round(gwrScore - comparisonPenalty));
  const georef = clamp(Math.round(100 - geoPenalty));

  // Total: weighted average per RULES.md §11
  const total = clamp(Math.round(georef * 0.30 + sap * 0.35 + gwr * 0.35));

  return { total, sap, gwr, georef };
}

/**
 * Calculate what % of fields have data AND match for a given source.
 *
 * SAP score: of all fields where SAP has a value, how many match GWR?
 * GWR score: of all fields where GWR has a value, how many match SAP?
 *
 * This means SAP and GWR scores can differ when one source has more
 * complete data than the other.
 */
function calculateFieldMatchRate(
  building: Building,
  source: "sap" | "gwr",
): number {
  let present = 0;
  let matched = 0;

  for (const fieldName of SOURCE_FIELDS) {
    const field = building[fieldName as keyof Building];
    if (field && typeof field === "object" && "sap" in field) {
      const sf = field as { sap: string; gwr: string; match: boolean };
      // Count fields where THIS source has data
      if (sf[source]) {
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
