/**
 * index.ts - Geo-Check Rule Engine Edge Function
 *
 * Supabase Edge Function entry point using Hono for routing.
 * Provides API for validating building data against defined rules.
 *
 * Routes:
 *   GET  /rule-engine/health       - Health check
 *   GET  /rule-engine/rules        - List all registered rules
 *   POST /rule-engine/check/:id    - Check a single building
 *   POST /rule-engine/check-all    - Check buildings (chunked)
 *   GET  /rule-engine/openapi.json - OpenAPI spec
 *   GET  /rule-engine/doc          - Swagger UI
 *   GET  /rule-engine/             - Redirect to Swagger UI
 */

import { Hono } from "npm:hono@4.4.0";
import { checkBuilding, checkBuildingsChunk } from "./engine/runner.ts";
import { getRegisteredRules } from "./engine/registry.ts";

// Ensure rules are registered
import "./rules/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const app = new Hono().basePath("/rule-engine");

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "geo-check-rule-engine",
    timestamp: new Date().toISOString(),
  });
});

// ── Rules listing ─────────────────────────────────────────────────
app.get("/rules", (c) => {
  const registered = getRegisteredRules();

  // Group by ruleSet
  const grouped: Record<string, {
    ruleSet: string;
    rules: { id: string; severity: string; field: string }[];
  }> = {};

  for (const rule of registered) {
    if (!grouped[rule.ruleSet]) {
      grouped[rule.ruleSet] = { ruleSet: rule.ruleSet, rules: [] };
    }
    grouped[rule.ruleSet].rules.push({
      id: rule.id,
      severity: rule.severity,
      field: rule.field,
    });
  }

  return c.json({
    totalRules: registered.length,
    ruleSets: Object.values(grouped),
  });
});

// ── Check single building ─────────────────────────────────────────
app.post("/check/:id{.+}", async (c) => {
  try {
    const buildingId = c.req.param("id");

    const result = await checkBuilding(buildingId);

    if (!result) {
      return c.json({ error: `Gebäude '${buildingId}' nicht gefunden` }, 404);
    }

    return c.json(result);
  } catch (err) {
    console.error("check failed:", err);
    return c.json({ error: true, message: (err as Error).message }, 500);
  }
});

// ── Check all buildings (chunked) ─────────────────────────────────
app.post("/check-all", async (c) => {
  try {
    const url = new URL(c.req.url);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const limit = parseInt(url.searchParams.get("limit") ?? "50");

    // Cap limit to avoid timeout (150s Edge Function limit)
    const safeLimit = Math.min(limit, 100);

    const { results, total, hasMore } = await checkBuildingsChunk(offset, safeLimit);

    const summary = {
      totalBuildings: total,
      checked: results.length,
      offset,
      limit: safeLimit,
      hasMore,
      nextOffset: hasMore ? offset + safeLimit : null,
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
  } catch (err) {
    console.error("check-all failed:", err);
    return c.json({ error: true, message: (err as Error).message }, 500);
  }
});

// ── OpenAPI spec ──────────────────────────────────────────────────
app.get("/openapi.json", (c) => {
  const baseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  return c.json({
    openapi: "3.0.3",
    info: {
      title: "Geo-Check Rule Engine API",
      description:
        "Validiert Gebäudedaten aus SAP RE-FX und GWR gegen definierte Prüfregeln. Berechnet Konfidenzwerte und identifiziert Datenfehler.",
      version: "1.0.0",
      contact: { name: "BBL Geo-Check" },
    },
    servers: [{ url: baseUrl, description: "Supabase Edge Functions" }],
    paths: {
      "/rule-engine/health": {
        get: {
          tags: ["System"],
          summary: "Health Check",
          description: "Prüft ob der Service verfügbar ist",
          responses: {
            "200": {
              description: "Service ist verfügbar",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      service: { type: "string", example: "geo-check-rule-engine" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/rule-engine/rules": {
        get: {
          tags: ["Regeln"],
          summary: "Alle Prüfregeln auflisten",
          description:
            "Gibt alle registrierten Prüfregeln gruppiert nach Regelset zurück",
          responses: {
            "200": {
              description: "Liste aller Regeln",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalRules: { type: "integer", example: 18 },
                      ruleSets: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            ruleSet: { type: "string", example: "identification" },
                            rules: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "string", example: "ID-001" },
                                  severity: {
                                    type: "string",
                                    enum: ["error", "warning", "info"],
                                  },
                                  field: { type: "string", example: "egid" },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/rule-engine/check/{buildingId}": {
        post: {
          tags: ["Prüfung"],
          summary: "Einzelnes Gebäude prüfen",
          description:
            "Führt alle Prüfregeln gegen ein Gebäude aus und speichert die Ergebnisse",
          parameters: [
            {
              name: "buildingId",
              in: "path",
              required: true,
              description: "Gebäude-ID (z.B. 1080/2020/AA)",
              schema: { type: "string" },
              example: "1080/2020/AA",
            },
          ],
          responses: {
            "200": {
              description: "Prüfergebnis",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CheckResult" },
                },
              },
            },
            "404": { description: "Gebäude nicht gefunden" },
          },
        },
      },
      "/rule-engine/check-all": {
        post: {
          tags: ["Prüfung"],
          summary: "Gebäude prüfen (chunked)",
          description:
            "Führt Prüfregeln gegen Gebäude aus. Unterstützt Paginierung via offset/limit Query-Parameter (Standard: 50 pro Chunk, max 100).",
          parameters: [
            {
              name: "offset",
              in: "query",
              description: "Start-Index (Standard: 0)",
              schema: { type: "integer", default: 0 },
            },
            {
              name: "limit",
              in: "query",
              description: "Anzahl Gebäude pro Chunk (Standard: 50, max 100)",
              schema: { type: "integer", default: 50, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Chunk-Ergebnis mit Paginierung",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalBuildings: { type: "integer" },
                      checked: { type: "integer" },
                      offset: { type: "integer" },
                      limit: { type: "integer" },
                      hasMore: { type: "boolean" },
                      nextOffset: { type: "integer", nullable: true },
                      totalErrors: { type: "integer" },
                      byLevel: {
                        type: "object",
                        properties: {
                          error: { type: "integer" },
                          warning: { type: "integer" },
                          info: { type: "integer" },
                        },
                      },
                      checkedAt: { type: "string", format: "date-time" },
                      results: {
                        type: "array",
                        items: { $ref: "#/components/schemas/CheckResult" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CheckResult: {
          type: "object",
          properties: {
            buildingId: { type: "string", example: "1080/2020/AA" },
            confidence: {
              type: "object",
              properties: {
                total: { type: "integer", example: 67 },
                sap: { type: "integer", example: 100 },
                gwr: { type: "integer", example: 50 },
                georef: { type: "integer", example: 67 },
              },
            },
            errors: {
              type: "array",
              items: { $ref: "#/components/schemas/ValidationError" },
            },
            checkedAt: { type: "string", format: "date-time" },
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            checkId: { type: "string", example: "GEO-001" },
            description: {
              type: "string",
              example: "Koordinaten weichen um 234m ab",
            },
            level: { type: "string", enum: ["error", "warning", "info"] },
            field: { type: "string", example: "lat" },
          },
        },
      },
    },
    tags: [
      { name: "System", description: "Service-Status" },
      { name: "Regeln", description: "Prüfregeln verwalten" },
      { name: "Prüfung", description: "Gebäude validieren" },
    ],
  });
});

// ── Swagger UI ────────────────────────────────────────────────────
app.get("/doc", (c) => {
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Geo-Check API - Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>
    body { margin: 0; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: './openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    });
  </script>
</body>
</html>`;
  return c.html(html);
});

// Root redirect to docs
app.get("/", (c) => c.redirect("/rule-engine/doc"));

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const response = await app.fetch(req);

  // Add CORS headers to every response
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
});
