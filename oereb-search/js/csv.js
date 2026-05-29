/* ── CSV + GeoJSON I/O ─────────────────────────────────────────────────────
   Dependency-free CSV parse/serialize and GeoJSON assembly for batch mode.
   The parser is a single-pass state machine, so quoted fields containing the
   delimiter, embedded quotes ("" → ") and newlines are handled correctly. */

/** Detect the most likely delimiter from the first physical line. */
function detectDelimiter(text) {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  let best = ",";
  let bestN = -1;
  for (const [d, n] of Object.entries(counts)) {
    if (n > bestN) { bestN = n; best = d; }
  }
  return best;
}

/**
 * Parse CSV text → { headers, rows, delimiter }.
 *   - headers: string[] (original column names, in order)
 *   - rows:    Array<Record<string, string>> keyed by header
 * Strips a UTF-8 BOM and trims field whitespace.
 */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const delimiter = detectDelimiter(text);

  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let started = false; // any char seen on the current record?

  const endField = () => { record.push(field.trim()); field = ""; };
  const endRecord = () => {
    endField();
    // Skip fully empty records (e.g. trailing newline / blank lines)
    if (record.some((v) => v !== "")) records.push(record);
    record = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true; started = true;
    } else if (ch === delimiter) {
      endField(); started = true;
    } else if (ch === "\n") {
      endRecord();
    } else if (ch === "\r") {
      /* ignore — handled by \n */
    } else {
      field += ch; started = true;
    }
  }
  if (started || field !== "" || record.length) endRecord();

  if (!records.length) return { headers: [], rows: [], delimiter };

  const headers = records[0];
  const rows = records.slice(1).map((values) => {
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    return row;
  });
  return { headers, rows, delimiter };
}

/** Escape one CSV cell (semicolon-delimited output). */
function csvCell(val) {
  const v = String(val ?? "").replace(/"/g, '""');
  return /[;\n"]/.test(v) ? `"${v}"` : v;
}

/**
 * Serialize rows to a CSV string (semicolon-delimited, UTF-8 BOM) — opens
 * cleanly in Swiss-locale Excel. `columns` fixes the column set and order.
 */
export function toCSV(columns, rows) {
  const lines = [columns.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(";"));
  }
  return "﻿" + lines.join("\r\n");
}

/**
 * Build a GeoJSON FeatureCollection from result rows.
 *   - geometry comes from each row's `_geometry` (already WGS84), or null for
 *     rows that failed lookup — so every input row survives into the output.
 *   - properties = every non-underscore-prefixed key (the IN_/OUT_ columns).
 */
export function toGeoJSON(rows) {
  const features = rows.map((row) => {
    const properties = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k.startsWith("_")) properties[k] = v;
    }
    return { type: "Feature", geometry: row._geometry || null, properties };
  });
  return { type: "FeatureCollection", features };
}

/** Trigger a browser download of a Blob. */
export function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadCSV(columns, rows, filename) {
  saveBlob(new Blob([toCSV(columns, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadGeoJSON(rows, filename) {
  const json = JSON.stringify(toGeoJSON(rows), null, 2);
  saveBlob(new Blob([json], { type: "application/geo+json" }), filename);
}
