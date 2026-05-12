/**
 * registry.ts - Rule registration and execution
 *
 * Rules are functions that check a building and return an error message
 * (string) if the check fails, or null if it passes.
 */

import type { Building, Severity, ValidationError } from "../models.ts";

/** A registered rule with its metadata and check function */
export interface RegisteredRule {
  id: string;
  severity: Severity;
  field: string;
  ruleSet: string;
  check: (building: Building) => Promise<string | null> | string | null;
}

/** Global rule registry */
const rules: RegisteredRule[] = [];

/**
 * Register a validation rule.
 *
 * Usage:
 *   registerRule("GWR-001", "error", "egid", "gwr-basic", (building) => {
 *     if (!building.egid.gwr) return "EGID fehlt im GWR";
 *     return null;
 *   });
 */
export function registerRule(
  id: string,
  severity: Severity,
  field: string,
  ruleSet: string,
  check: (building: Building) => Promise<string | null> | string | null,
): void {
  rules.push({ id, severity, field, ruleSet, check });
}

/** Get all registered rules */
export function getRegisteredRules(): RegisteredRule[] {
  return [...rules];
}

/** Run all registered rules against a building */
export async function runAllRules(
  building: Building,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  for (const rule of rules) {
    try {
      const message = await rule.check(building);
      if (message !== null) {
        errors.push({
          checkId: rule.id,
          description: message,
          level: rule.severity,
          field: rule.field,
        });
      }
    } catch (err) {
      console.error(`Rule ${rule.id} failed for building ${building.id}:`, err);
      errors.push({
        checkId: rule.id,
        description: "Regelprüfung fehlgeschlagen",
        level: "warning",
        field: rule.field,
      });
    }
  }

  return errors;
}
