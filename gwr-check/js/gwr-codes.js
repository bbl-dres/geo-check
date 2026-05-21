/**
 * GWR code → multilingual label resolution.
 * Loads data/gwr-codes.json once, provides lookup helpers.
 */
import { getLang } from "./i18n.js";

let codes = null;
let loadPromise = null;

/** Load codes JSON (cached, idempotent) */
export function loadCodes() {
  if (codes) return Promise.resolve(codes);
  if (loadPromise) return loadPromise;
  loadPromise = fetch("data/gwr-codes.json")
    .then((r) => r.json())
    .then((data) => { codes = data; return codes; })
    .catch((err) => {
      console.warn("Failed to load GWR codes:", err);
      codes = {};
      return codes;
    });
  return loadPromise;
}

/**
 * Resolve a code to a label.
 * @param {string} attribute  GWR attribute name (e.g. "GKAT", "GSTAT")
 * @param {string|number} code  The numeric code value
 * @param {string} [lang="de"]  Language: "de", "fr", or "it"
 * @returns {string} Resolved label, or the raw code if not found
 */
export function codeLabel(attribute, code, lang) {
  lang = lang || getLang();
  if (!codes || code === "" || code == null) return "";
  const entry = codes[attribute]?.[String(code)];
  if (!entry) return String(code);
  return entry[lang] || entry.de || String(code);
}

/**
 * Map of GWR output column keys to their code attribute names.
 * Only columns whose values are integer codes needing label resolution.
 */
export const CODE_COLUMNS = {
  gwr_building_type: "GKAT",
  gwr_building_class: "GKLAS",
  gwr_status: "GSTAT",
  gwr_construction_period: "GBAUP",
  gwr_coord_source: "GKSCE",
  gwr_heating_type: "GWAERZH1",
  gwr_heating_energy: "GENH1",
  gwr_hot_water_type: "GWAERZW1",
  gwr_hot_water_energy: "GENW1",
};
