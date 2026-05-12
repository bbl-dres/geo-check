/**
 * db.ts - Supabase client for the rule engine
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.ts";
import type { Building, ValidationError } from "./models.ts";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return client;
}

/** Fetch a single building by ID */
export async function getBuilding(id: string): Promise<Building | null> {
  const { data, error } = await getClient()
    .from("buildings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Building;
}

/** Fetch all buildings */
export async function getAllBuildings(): Promise<Building[]> {
  const { data, error } = await getClient()
    .from("buildings")
    .select("*");

  if (error || !data) return [];
  return data as Building[];
}

/** Write check results: update errors and confidence for a building */
export async function writeCheckResults(
  buildingId: string,
  errors: ValidationError[],
  confidence: { total: number; sap: number; gwr: number; georef: number },
): Promise<void> {
  const db = getClient();

  // Delete existing errors for this building
  await db
    .from("errors")
    .delete()
    .eq("building_id", buildingId);

  // Insert new errors (generate IDs matching generate_error_id() format)
  if (errors.length > 0) {
    const idPrefix = "err-" + buildingId.replace(/\//g, "-");
    const rows = errors.map((e, i) => ({
      id: `${idPrefix}-${String(i + 1).padStart(3, "0")}`,
      building_id: buildingId,
      check_id: e.checkId,
      description: e.description,
      level: e.level,
      field: e.field ?? null,
      detected_at: new Date().toISOString(),
    }));

    await db.from("errors").insert(rows);
  }

  // Update building confidence
  await db
    .from("buildings")
    .update({ confidence })
    .eq("id", buildingId);
}
