/**
 * main.ts - Geo-Check Rule Engine API
 *
 * Deno + Hono API with Swagger UI for building data validation.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import health from "./routes/health.ts";
import rules from "./routes/rules.ts";
import check from "./routes/check.ts";

const app = new Hono();

// Middleware
app.use("*", cors());

// Routes
app.route("/", health);
app.route("/", rules);
app.route("/", check);

// OpenAPI JSON spec
app.get("/openapi.json", (c) => {
  return c.json({
    openapi: "3.0.3",
    info: {
      title: "Geo-Check Rule Engine API",
      description: "Validiert Gebäudedaten aus SAP RE-FX und GWR gegen definierte Prüfregeln. Berechnet Konfidenzwerte und identifiziert Datenfehler.",
      version: "1.0.0",
      contact: {
        name: "BBL Geo-Check",
      },
    },
    servers: [
      { url: `http://localhost:${config.port}`, description: "Lokale Entwicklung" },
    ],
    paths: {
      "/health": {
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
                      service: { type: "string", example: "geo-check-api" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/rules": {
        get: {
          tags: ["Regeln"],
          summary: "Alle Prüfregeln auflisten",
          description: "Gibt alle registrierten Prüfregeln gruppiert nach Regelset zurück",
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
                            ruleSet: { type: "string", example: "gwr-basic" },
                            rules: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "string", example: "GWR-001" },
                                  severity: { type: "string", enum: ["error", "warning", "info"] },
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
      "/check/{buildingId}": {
        post: {
          tags: ["Prüfung"],
          summary: "Einzelnes Gebäude prüfen",
          description: "Führt alle Prüfregeln gegen ein Gebäude aus und speichert die Ergebnisse in der Datenbank",
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
            "404": {
              description: "Gebäude nicht gefunden",
            },
          },
        },
      },
      "/check-all": {
        post: {
          tags: ["Prüfung"],
          summary: "Alle Gebäude prüfen",
          description: "Führt alle Prüfregeln gegen sämtliche Gebäude in der Datenbank aus (Batch)",
          responses: {
            "200": {
              description: "Zusammenfassung aller Prüfergebnisse",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalBuildings: { type: "integer" },
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
            description: { type: "string", example: "Koordinaten weichen um 234m ab" },
            level: { type: "string", enum: ["error", "warning", "info"] },
            field: { type: "string", example: "coordinates" },
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

// Swagger UI
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
      url: '/openapi.json',
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
app.get("/", (c) => c.redirect("/doc"));

console.log(`Geo-Check API running on http://localhost:${config.port}`);
console.log(`Swagger UI: http://localhost:${config.port}/doc`);

Deno.serve({ port: config.port }, app.fetch);
