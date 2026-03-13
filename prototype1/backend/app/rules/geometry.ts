/**
 * geometry.ts - Geometrie (GEO-001 to GEO-003)
 *
 * Spatial accuracy and coordinate quality.
 *
 * Error consolidation: If coordinates are missing (GEO-001),
 * do not also trigger GEO-002 or GEO-003.
 *
 * Source of truth: docs/RULES.md §3.3
 */

import { registerRule } from "../engine/registry.ts";
import { geocodeAddress, haversineDistance } from "../geo/swisstopo.ts";
import type { Building } from "../models.ts";

// Helper: resolve value using priority chain korrektur → GWR → SAP (RULES.md §1.1)
function resolve(field: { korrektur: string; gwr: string; sap: string }): string {
  return field.korrektur || field.gwr || field.sap;
}

// GEO-001: Koordinaten vorhanden
// Coordinates must exist in at least one source
registerRule("GEO-001", "error", "lat", "geometry", (b: Building) => {
  const lat = resolve(b.lat);
  const lng = resolve(b.lng);

  if (!lat || !lng) {
    return "Koordinaten fehlen in allen Quellen";
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) {
    return "Koordinaten sind ungültig";
  }

  return null;
});

// GEO-002: Koordinaten-Abweichung
// SAP vs GWR coordinates differ by > 50m
// Consolidation: skipped if GEO-001 would trigger
registerRule("GEO-002", "warning", "lat", "geometry", (b: Building) => {
  const sapLat = parseFloat(b.lat.sap);
  const sapLng = parseFloat(b.lng.sap);
  const gwrLat = parseFloat(b.lat.gwr);
  const gwrLng = parseFloat(b.lng.gwr);

  // Need both sources to compare
  if (isNaN(sapLat) || isNaN(sapLng) || isNaN(gwrLat) || isNaN(gwrLng)) {
    return null;
  }

  const distance = haversineDistance(sapLat, sapLng, gwrLat, gwrLng);

  if (distance > 50) {
    return `SAP- und GWR-Koordinaten weichen um ${Math.round(distance)}m ab`;
  }
  return null;
});

// GEO-003: Adresse-Koordinaten-Match
// Geocoded address > 100m from stored coordinates
// Consolidation: skipped if GEO-001 would trigger
registerRule("GEO-003", "info", "lat", "geometry", async (b: Building) => {
  const lat = parseFloat(resolve(b.lat));
  const lng = parseFloat(resolve(b.lng));
  const street = resolve(b.strasse);
  const houseNr = resolve(b.hausnummer);
  const plz = resolve(b.plz);
  const city = resolve(b.ort);

  if (isNaN(lat) || isNaN(lng) || !street || !plz || !city) return null;

  const geocoded = await geocodeAddress(street, houseNr, plz, city);
  if (!geocoded) return null; // Can't verify, skip

  const distance = haversineDistance(lat, lng, geocoded.lat, geocoded.lng);

  if (distance > 100) {
    return `Adresse und Koordinaten weichen um ${Math.round(distance)}m ab`;
  }
  return null;
});
