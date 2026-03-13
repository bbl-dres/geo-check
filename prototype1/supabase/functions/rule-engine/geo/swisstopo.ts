/**
 * swisstopo.ts - Swisstopo Geocoding API client
 *
 * Uses the free api3.geo.admin.ch SearchServer for:
 * - Address geocoding (address → coordinates)
 * - Coordinate distance calculations
 */

const SEARCH_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer";

interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Geocode a Swiss address to coordinates.
 * Returns null if no result found.
 */
export async function geocodeAddress(
  street: string,
  houseNumber: string,
  plz: string,
  city: string,
): Promise<GeocodeResult | null> {
  const searchText = `${street} ${houseNumber}, ${plz} ${city}`.trim();

  const params = new URLSearchParams({
    searchText,
    type: "locations",
    origins: "address",
    limit: "1",
    sr: "4326", // WGS84
  });

  try {
    const response = await fetch(`${SEARCH_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    const results = data.results;

    if (!results || results.length === 0) return null;

    const attrs = results[0].attrs;
    return {
      lat: attrs.lat,
      lng: attrs.lon,
      label: attrs.label,
    };
  } catch (err) {
    console.error("Swisstopo geocoding error:", err);
    return null;
  }
}

/**
 * Calculate distance between two coordinates in meters (Haversine formula).
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
