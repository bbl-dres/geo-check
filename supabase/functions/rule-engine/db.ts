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

/** Fetch a chunk of buildings with offset/limit */
export async function getBuildingsChunk(
  offset: number,
  limit: number,
): Promise<{ buildings: Building[]; total: number }> {
  const db = getClient();

  // Get total count and chunk in parallel
  const [countResult, chunkResult] = await Promise.all([
    db.from("buildings").select("*", { count: "exact", head: true }),
    db.from("buildings").select("*").order("id").range(offset, offset + limit - 1),
  ]);

  const total = countResult.count ?? 0;
  if (chunkResult.error || !chunkResult.data) return { buildings: [], total };
  return { buildings: chunkResult.data as Building[], total };
}

/** Find EGIDs that appear on more than one building (across entire dataset) */
export async function getDuplicateEgids(): Promise<Set<string>> {
  const db = getClient();
  // Fetch all building IDs and their resolved EGID
  // We need raw data since EGID is JSONB with sap/gwr/korrektur
  const { data, error } = await db
    .from("buildings")
    .select("id, egid");

  if (error || !data) return new Set();

  // Resolve EGID per building: korrektur → gwr → sap
  const egidToIds = new Map<string, string[]>();
  for (const row of data) {
    const sf = row.egid as { korrektur?: string; gwr?: string; sap?: string } | null;
    if (!sf) continue;
    const resolved = sf.korrektur || sf.gwr || sf.sap || "";
    if (!resolved) continue;
    const ids = egidToIds.get(resolved) || [];
    ids.push(row.id);
    egidToIds.set(resolved, ids);
  }

  // Collect EGIDs used by more than one building
  const duplicates = new Set<string>();
  for (const [egid, ids] of egidToIds) {
    if (ids.length > 1) duplicates.add(egid);
  }
  return duplicates;
}

/** Find coordinates that appear on more than one building (across entire dataset) */
export async function getDuplicateCoords(): Promise<Set<string>> {
  const db = getClient();
  const { data, error } = await db
    .from("buildings")
    .select("id, lat, lng");

  if (error || !data) return new Set();

  // Build coord key → building IDs map
  const coordToIds = new Map<string, string[]>();
  for (const row of data) {
    const latSf = row.lat as { korrektur?: string; gwr?: string; sap?: string } | null;
    const lngSf = row.lng as { korrektur?: string; gwr?: string; sap?: string } | null;
    if (!latSf || !lngSf) continue;
    const lat = latSf.korrektur || latSf.gwr || latSf.sap || "";
    const lng = lngSf.korrektur || lngSf.gwr || lngSf.sap || "";
    if (!lat || !lng) continue;
    // Round to 5 decimals (~1m precision) to catch near-duplicates
    const latR = parseFloat(lat);
    const lngR = parseFloat(lng);
    if (isNaN(latR) || isNaN(lngR)) continue;
    const key = `${latR.toFixed(5)},${lngR.toFixed(5)}`;
    const ids = coordToIds.get(key) || [];
    ids.push(row.id);
    coordToIds.set(key, ids);
  }

  // Return set of building IDs that share coordinates
  const duplicateBuildings = new Set<string>();
  for (const [_key, ids] of coordToIds) {
    if (ids.length > 1) {
      for (const id of ids) duplicateBuildings.add(id);
    }
  }
  return duplicateBuildings;
}

/** Batch write check results for multiple buildings at once */
export async function writeCheckResultsBatch(
  results: {
    buildingId: string;
    errors: ValidationError[];
    confidence: { total: number; sap: number; gwr: number; georef: number };
  }[],
): Promise<void> {
  const db = getClient();
  const buildingIds = results.map((r) => r.buildingId);

  // 1. Delete all existing errors for these buildings in one call
  await db
    .from("errors")
    .delete()
    .in("building_id", buildingIds);

  // 2. Collect all new error rows
  const allErrorRows: Record<string, unknown>[] = [];
  for (const r of results) {
    if (r.errors.length === 0) continue;
    const idPrefix = "err-" + r.buildingId.replace(/\//g, "-");
    for (let i = 0; i < r.errors.length; i++) {
      const e = r.errors[i];
      allErrorRows.push({
        id: `${idPrefix}-${String(i + 1).padStart(3, "0")}`,
        building_id: r.buildingId,
        check_id: e.checkId,
        description: e.description,
        level: e.level,
        field: e.field ?? null,
        detected_at: new Date().toISOString(),
      });
    }
  }

  // 3. Insert all errors in one call (Supabase handles up to ~1000 rows)
  if (allErrorRows.length > 0) {
    // Insert in batches of 500 to avoid payload limits
    for (let i = 0; i < allErrorRows.length; i += 500) {
      const batch = allErrorRows.slice(i, i + 500);
      await db.from("errors").insert(batch);
    }
  }

  // 4. Update confidence for all buildings (batch via individual updates in parallel)
  const updates = results.map((r) =>
    db.from("buildings").update({ confidence: r.confidence }).eq("id", r.buildingId)
  );
  await Promise.all(updates);
}
