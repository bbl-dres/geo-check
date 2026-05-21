/**
 * health.ts - Health check endpoint
 */

import { Hono } from "hono";

const health = new Hono();

health.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "geo-check-api",
    timestamp: new Date().toISOString(),
  });
});

export default health;
