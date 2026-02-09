/**
 * db.ts - Supabase client for the rule engine Edge Function
 *
 * Uses auto-injected env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Building, ValidationError } from "./models.ts";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
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

/** Fetch a chunk of buildings with offset/limit */
export async function getBuildingsChunk(
  offset: number,
  limit: number,
): Promise<{ buildings: Building[]; total: number }> {
  const db = getClient();

  // Get total count
  const { count } = await db
    .from("buildings")
    .select("*", { count: "exact", head: true });

  // Get chunk
  const { data, error } = await db
    .from("buildings")
    .select("*")
    .order("id")
    .range(offset, offset + limit - 1);

  if (error || !data) return { buildings: [], total: count ?? 0 };
  return { buildings: data as Building[], total: count ?? 0 };
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

  // Insert new errors
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
