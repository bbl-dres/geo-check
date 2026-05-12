/**
 * runner.ts - High-level check orchestration
 */

import { runAllRules } from "./registry.ts";
import { calculateConfidence } from "./confidence.ts";
import { getBuilding, getAllBuildings, writeCheckResults } from "../db.ts";
import type { Building, CheckResult } from "../models.ts";

// Import all rules so they register themselves
import "../rules/mod.ts";

/** Check a single building by ID */
export async function checkBuilding(buildingId: string): Promise<CheckResult | null> {
  const building = await getBuilding(buildingId);
  if (!building) return null;

  return await runCheck(building);
}

/** Check all buildings */
export async function checkAllBuildings(): Promise<CheckResult[]> {
  const buildings = await getAllBuildings();
  const results: CheckResult[] = [];

  for (const building of buildings) {
    const result = await runCheck(building);
    results.push(result);
  }

  return results;
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
