/**
 * runner.ts - High-level check orchestration
 *
 * Supports chunked processing to stay within the Edge Function
 * 150-second timeout (process buildings in batches).
 *
 * Cross-building checks (ID-005 duplicate EGID, ID-006 duplicate coords)
 * are run here since they need the full dataset.
 */

import { runAllRules } from "./registry.ts";
import { calculateConfidence } from "./confidence.ts";
import {
  getBuilding,
  getBuildingsChunk,
  getDuplicateEgids,
  getDuplicateCoords,
  writeCheckResultsBatch,
} from "../db.ts";
import type { Building, CheckResult, ValidationError } from "../models.ts";

// Import all rules so they register themselves
import "../rules/mod.ts";

/** Resolve value using priority chain korrektur → GWR → SAP */
function resolve(field: { korrektur: string; gwr: string; sap: string }): string {
  return field.korrektur || field.gwr || field.sap;
}

// Cached duplicate sets (populated once per check-all invocation)
let _duplicateEgids: Set<string> | null = null;
let _duplicateCoordBuildings: Set<string> | null = null;

/** Pre-fetch duplicate data for cross-building checks */
async function ensureDuplicateData(): Promise<void> {
  if (_duplicateEgids === null || _duplicateCoordBuildings === null) {
    [_duplicateEgids, _duplicateCoordBuildings] = await Promise.all([
      getDuplicateEgids(),
      getDuplicateCoords(),
    ]);
  }
}

/** Reset duplicate cache (called at start of check-all) */
function resetDuplicateCache(): void {
  _duplicateEgids = null;
  _duplicateCoordBuildings = null;
}

/** Run cross-building checks for a single building */
function runCrossBuildingChecks(building: Building): ValidationError[] {
  const errors: ValidationError[] = [];

  // ID-005: EGID Duplikat
  const egid = resolve(building.egid);
  if (egid && _duplicateEgids?.has(egid)) {
    errors.push({
      checkId: "ID-005",
      description: `EGID ${egid} wird von mehreren Gebäuden verwendet`,
      level: "error",
      field: "egid",
    });
  }

  // ID-006: Koordinaten Duplikat
  if (_duplicateCoordBuildings?.has(building.id)) {
    errors.push({
      checkId: "ID-006",
      description: "Koordinaten werden von einem anderen Gebäude verwendet",
      level: "warning",
      field: "lat",
    });
  }

  return errors;
}

/** Check a single building by ID */
export async function checkBuilding(buildingId: string): Promise<CheckResult | null> {
  const building = await getBuilding(buildingId);
  if (!building) return null;

  // For single-building checks, load duplicate data too
  await ensureDuplicateData();

  const errors = await runAllRules(building);
  const crossErrors = runCrossBuildingChecks(building);
  const allErrors = [...errors, ...crossErrors];
  const confidence = calculateConfidence(building, allErrors);

  // Persist
  await writeCheckResultsBatch([{ buildingId: building.id, errors: allErrors, confidence }]);

  resetDuplicateCache();

  return {
    buildingId: building.id,
    confidence,
    errors: allErrors,
    checkedAt: new Date().toISOString(),
  };
}

/** Check a chunk of buildings (offset/limit for pagination) */
export async function checkBuildingsChunk(
  offset: number,
  limit: number,
): Promise<{
  results: CheckResult[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}> {
  // Fetch buildings and duplicate data in parallel
  const [chunkData] = await Promise.all([
    getBuildingsChunk(offset, limit),
    ensureDuplicateData(),
  ]);

  const { buildings, total } = chunkData;

  // Process buildings in parallel (batches of 10)
  const results: CheckResult[] = [];
  const batchResults: {
    buildingId: string;
    errors: ValidationError[];
    confidence: { total: number; sap: number; gwr: number; georef: number };
  }[] = [];

  const CONCURRENCY = 10;
  for (let i = 0; i < buildings.length; i += CONCURRENCY) {
    const batch = buildings.slice(i, i + CONCURRENCY);
    const batchChecks = await Promise.all(
      batch.map(async (building) => {
        const errors = await runAllRules(building);
        const crossErrors = runCrossBuildingChecks(building);
        const allErrors = [...errors, ...crossErrors];
        const confidence = calculateConfidence(building, allErrors);
        return {
          buildingId: building.id,
          confidence,
          errors: allErrors,
          checkedAt: new Date().toISOString(),
        };
      }),
    );

    for (const result of batchChecks) {
      results.push(result);
      batchResults.push({
        buildingId: result.buildingId,
        errors: result.errors,
        confidence: result.confidence,
      });
    }
  }

  // Batch write all results at once
  await writeCheckResultsBatch(batchResults);

  return {
    results,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
  };
}
