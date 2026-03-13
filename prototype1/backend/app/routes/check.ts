/**
 * check.ts - Building check endpoints
 */

import { Hono } from "hono";
import { checkBuilding, checkAllBuildings } from "../engine/runner.ts";

const check = new Hono();

/**
 * POST /check/:id - Check a single building
 *
 * Runs all validation rules against the building and returns errors + confidence.
 * Results are also persisted to Supabase.
 */
check.post("/check/:id{.+}", async (c) => {
  const buildingId = c.req.param("id");

  const result = await checkBuilding(buildingId);

  if (!result) {
    return c.json({ error: `Gebäude '${buildingId}' nicht gefunden` }, 404);
  }

  return c.json(result);
});

/**
 * POST /check-all - Check all buildings
 *
 * Runs all validation rules against every building in the database.
 * Returns a summary with all results.
 */
check.post("/check-all", async (c) => {
  const results = await checkAllBuildings();

  const summary = {
    totalBuildings: results.length,
    totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
    byLevel: {
      error: results.reduce(
        (sum, r) => sum + r.errors.filter((e) => e.level === "error").length, 0,
      ),
      warning: results.reduce(
        (sum, r) => sum + r.errors.filter((e) => e.level === "warning").length, 0,
      ),
      info: results.reduce(
        (sum, r) => sum + r.errors.filter((e) => e.level === "info").length, 0,
      ),
    },
    checkedAt: new Date().toISOString(),
    results,
  };

  return c.json(summary);
});

export default check;
