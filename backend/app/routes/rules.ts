/**
 * rules.ts - Rules listing endpoint
 */

import { Hono } from "hono";
import { getRegisteredRules } from "../engine/registry.ts";

// Ensure rules are registered
import "../rules/mod.ts";

const rules = new Hono();

rules.get("/rules", (c) => {
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

export default rules;
