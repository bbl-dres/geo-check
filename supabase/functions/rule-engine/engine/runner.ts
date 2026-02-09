/**
 * runner.ts - High-level check orchestration
 *
 * Supports chunked processing to stay within the Edge Function
 * 150-second timeout (process buildings in batches).
 */

import { runAllRules } from "./registry.ts";
import { calculateConfidence } from "./confidence.ts";
import { getBuilding, getBuildingsChunk, writeCheckResults } from "../db.ts";
import type { Building, CheckResult } from "../models.ts";

// Import all rules so they register themselves
import "../rules/mod.ts";

/** Check a single building by ID */
export async function checkBuilding(buildingId: string): Promise<CheckResult | null> {
  const building = await getBuilding(buildingId);
  if (!building) return null;

  return await runCheck(building);
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
  const { buildings, total } = await getBuildingsChunk(offset, limit);
  const results: CheckResult[] = [];

  for (const building of buildings) {
    const result = await runCheck(building);
    results.push(result);
  }

  return {
    results,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
  };
}

/** Run all rules against a building and persist results */
async function runCheck(building: Building): Promise<CheckResult> {
  const errors = await runAllRules(building);
  const confidence = calculateConfidence(building, errors);

  // Persist to Supabase
  await writeCheckResults(building.id, errors, confidence);

  return {
    buildingId: building.id,
    confidence,
    errors,
    checkedAt: new Date().toISOString(),
  };
}
