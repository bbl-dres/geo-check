/**
 * Per-building PDF report with match analysis, recommendations, and maps.
 * Uses jsPDF + autoTable, lazy-loaded from CDN.
 * Maps use Swisstopo WMS (public, no API key).
 */
import { t, getLang, getLocale } from "./i18n.js";
import { codeLabel, loadCodes } from "./gwr-codes.js";
import { confidenceLabel, haversineMeters } from "./utils.js";

/* ── CDN dependencies ── */

const JSPDF_CDN = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const AUTOTABLE_CDN = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js";

/* ── Colors (RGB arrays for jsPDF) ── */

const FEDERAL_BLUE = [26, 54, 93];   // --federal-blue #1a365d
const DARK_GRAY = [31, 41, 55];      // --gray-800
const MID_GRAY = [107, 114, 128];    // --gray-500
const LIGHT_GRAY = [243, 244, 246];  // --gray-100
const BORDER_GRAY = [209, 213, 219]; // --gray-300
const GREEN = [21, 128, 61];         // --color-good-text
const YELLOW = [161, 98, 7];         // --color-partial-text
const RED = [220, 38, 38];           // --color-poor-text
const GRAY_TEXT = [75, 85, 99];      // --gray-600
const BLUE_LINK = [26, 54, 93];      // same as federal blue

/* ── PDF layout constants ── */

const PAGE_W = 210;
const MARGIN_L = 18;
const MARGIN_R = 18;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const FOOTER_Y = 290;
const HEADER_Y = 20; // content starts after header

/* ── Swisstopo WMS ── */

const WMS_BASE = "https://wms.geo.admin.ch/";
const WMS_PARAMS = "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:2056&FORMAT=image/png";
const CADASTRAL_LAYERS = "ch.swisstopo.pixelkarte-farbe,ch.swisstopo-vd.amtliche-vermessung";
const AERIAL_LAYERS = "ch.swisstopo.swissimage";
const MAP_IMG_W = 800;
const MAP_IMG_H = 600;
const MAP_EXTENT_E = 60;  // ±meters east-west  (120m total)
const MAP_EXTENT_N = 45;  // ±meters north-south (90m total → 4:3 = 800:600)

/* ── Public API ── */

let _currentRow = null; // module-level ref for overflow page headers

export async function generateBuildingReport(row) {
  _currentRow = row;
  await ensureJsPDF();
  await loadCodes();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Page 1: data & analysis
  drawHeader(doc, row);
  let y = HEADER_Y;
  y = drawBuildingInfo(doc, row, y);
  y = drawScoreBox(doc, row, y);
  y = drawComparisonTable(doc, row, y);
  y = drawRecommendations(doc, row, y);
  drawLinks(doc, row, y);

  // Page 2: maps (if coordinates available)
  const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude) || null;
  const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude) || null;

  if (lat != null && lng != null) {
    doc.addPage();
    drawHeader(doc, row);
    await drawMapsPage(doc, lat, lng);
  }

  // Footer on all pages
  drawFooters(doc);

  // Save
  const id = (row.internal_id || row.egid || "building").replace(/[^a-zA-Z0-9_-]/g, "_");
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  doc.save(`geo-check-${id}-${ts}.pdf`);
}

/* ── Page 1 sections ── */

function drawHeader(doc, row) {
  // Title
  doc.setTextColor(...FEDERAL_BLUE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Geo-Check", MARGIN_L, 10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MID_GRAY);
  doc.setFontSize(9);
  doc.text("\u00b7  " + t("report.title"), MARGIN_L + 27, 10);

  // Right: ID + date
  const now = new Date();
  const dateStr = now.toLocaleDateString(getLocale(), { dateStyle: "medium" }) + ", " + now.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
  const idStr = row ? (row.internal_id || row.egid || "") : "";
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  if (idStr) doc.text(idStr + "  \u00b7  " + dateStr, PAGE_W - MARGIN_R, 10, { align: "right" });
  else doc.text(dateStr, PAGE_W - MARGIN_R, 10, { align: "right" });

  // Separator line
  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, 14, PAGE_W - MARGIN_R, 14);
}

/** Draw a section heading — simple bold text matching the app style */
function drawSectionTitle(doc, text, y, separator = false) {
  if (separator) {
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_L, y - 4, PAGE_W - MARGIN_R, y - 4);
    y += 2;
  }
  doc.setTextColor(...DARK_GRAY);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN_L, y);
  return y + 7;
}

function drawBuildingInfo(doc, row, y) {
  y = drawSectionTitle(doc, t("report.buildingInfo"), y);

  const statusKey = row.gwr_match === "matched" ? "report.statusMatched"
    : row.gwr_match === "not_found" ? "report.statusNotFound" : "report.statusSkipped";

  const addr = [
    row.gwr_street || row.street || "",
    row.gwr_street_number || row.street_number || ""
  ].filter(Boolean).join(" ");
  const place = [
    row.gwr_zip || row.zip || "",
    row.gwr_city || row.city || ""
  ].filter(Boolean).join(" ");

  const lines = [
    [t("report.internalId"), row.internal_id || "\u2014"],
    [t("report.egid"), row.egid || "\u2014"],
    [t("report.address"), [addr, place].filter(Boolean).join(", ") || "\u2014"],
    [t("report.canton"), row.gwr_region || row.region || "\u2014"],
    [t("report.gwrStatus"), t(statusKey)],
  ];

  doc.setFontSize(9);
  for (const [label, value] of lines) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY_TEXT);
    doc.text(label, MARGIN_L, y);
    doc.setTextColor(...DARK_GRAY);
    doc.text(String(value), MARGIN_L + 38, y);
    y += 5;
  }
  return y + 4;
}

function drawScoreBox(doc, row, y) {
  const numScore = row.match_score !== "" && row.match_score != null ? Number(row.match_score) : null;
  if (numScore == null) return y + 3;

  const boxH = 16;
  const color = numScore >= 80 ? GREEN : numScore >= 50 ? YELLOW : RED;

  // Light background
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(MARGIN_L, y, CONTENT_W, boxH, "F");
  // Colored left accent bar
  doc.setFillColor(...color);
  doc.rect(MARGIN_L, y, 3, boxH, "F");

  // Score
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);
  doc.text(numScore + "%", MARGIN_L + 10, y + 11);

  // Confidence label
  doc.setFontSize(10);
  doc.setTextColor(...DARK_GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(`${t("report.confidence")}: ${confidenceLabel(numScore)}`, MARGIN_L + 34, y + 11);

  return y + boxH + 8;
}

function drawComparisonTable(doc, row, y) {
  y = drawSectionTitle(doc, t("report.fieldComparison"), y, true);
  y -= 4; // tighter gap before table

  const rows = buildComparisonRows(row);

  doc.autoTable({
    startY: y,
    margin: { left: MARGIN_L, right: MARGIN_R },
    head: [[t("report.field"), t("report.inputValue"), t("report.gwrValue"), t("report.matchResult")]],
    body: rows.map((f) => [f.label, f.input, f.gwr, f.result]),
    theme: "grid",
    headStyles: { fillColor: FEDERAL_BLUE, textColor: 255, fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3, textColor: DARK_GRAY, lineColor: BORDER_GRAY, lineWidth: 0.3 },
    alternateRowStyles: { fillColor: [249, 250, 251] }, // --gray-50
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold" },
      3: { cellWidth: 25, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.column.index === 3 && data.section === "body") {
        const v = String(data.cell.raw).toLowerCase();
        if (v === "exact") data.cell.styles.textColor = GREEN;
        else if (v === "similar") data.cell.styles.textColor = YELLOW;
        else if (v === "mismatch") data.cell.styles.textColor = RED;
        else data.cell.styles.textColor = GRAY_TEXT;
      }
    },
  });

  return doc.lastAutoTable.finalY + 10;
}

function drawRecommendations(doc, row, y) {
  if (y > 230) { doc.addPage(); drawHeader(doc, _currentRow); y = HEADER_Y; }
  y = drawSectionTitle(doc, t("report.recommendations"), y, true);

  const recs = buildRecommendations(row);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  if (recs.length === 0) {
    doc.setTextColor(...GREEN);
    doc.text("\u2713 " + t("report.recAllGood"), MARGIN_L + 3, y);
    return y + 8;
  }

  for (const rec of recs) {
    if (y > 270) { doc.addPage(); drawHeader(doc, _currentRow); y = HEADER_Y; }
    const color = rec.severity === "error" ? RED : rec.severity === "warning" ? YELLOW : GRAY_TEXT;
    const icon = rec.severity === "error" ? "\u2717" : rec.severity === "warning" ? "!" : "\u2022";
    doc.setTextColor(...color);
    doc.text(icon, MARGIN_L + 3, y);
    doc.setTextColor(...DARK_GRAY);
    const lines = doc.splitTextToSize(rec.text, CONTENT_W - 10);
    doc.text(lines, MARGIN_L + 8, y);
    y += lines.length * 4.5 + 2;
  }
  return y + 5;
}

function drawLinks(doc, row, y) {
  if (y > 250) { doc.addPage(); drawHeader(doc, _currentRow); y = HEADER_Y; }
  y = drawSectionTitle(doc, t("report.links"), y, true);

  const links = buildLinksData(row);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  for (const link of links) {
    if (y > 275) { doc.addPage(); drawHeader(doc, _currentRow); y = HEADER_Y; }
    doc.setTextColor(...GRAY_TEXT);
    doc.text(link.label + ": ", MARGIN_L, y);
    const labelW = doc.getTextWidth(link.label + ": ");
    // Truncate URL display to fit within content width
    const maxUrlW = CONTENT_W - labelW;
    let displayUrl = link.url;
    doc.setTextColor(...BLUE_LINK);
    while (doc.getTextWidth(displayUrl) > maxUrlW && displayUrl.length > 20) {
      displayUrl = displayUrl.slice(0, -4) + "\u2026";
    }
    doc.textWithLink(displayUrl, MARGIN_L + labelW, y, { url: link.url });
    y += 5;
  }
}

function drawFooters(doc) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Separator line
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_L, FOOTER_Y - 4, PAGE_W - MARGIN_R, FOOTER_Y - 4);
    // Footer text
    doc.setFontSize(7);
    doc.setTextColor(...MID_GRAY);
    doc.text(t("report.footer"), MARGIN_L, FOOTER_Y);
    doc.text(`${i} / ${pageCount}`, PAGE_W - MARGIN_R, FOOTER_Y, { align: "right" });
  }
}

/* ── Page 2: Maps ── */

async function drawMapsPage(doc, lat, lng) {
  const { E, N } = wgs84ToLv95(lat, lng);
  const bbox = `${E - MAP_EXTENT_E},${N - MAP_EXTENT_N},${E + MAP_EXTENT_E},${N + MAP_EXTENT_N}`;
  let y = HEADER_Y;

  // Calculate max map height so both maps + titles + gaps fit above footer
  // Layout: title(3) + map + gap(8) + title(3) + map ≤ (FOOTER_Y - 5 - y)
  const available = FOOTER_Y - 5 - y;
  const overhead = 3 + 8 + 3; // two titles + gap
  const maxMapH = (available - overhead) / 2;

  // Natural dimensions: full content width, 4:3 ratio
  let mapW = CONTENT_W;
  let mapH = mapW * (MAP_IMG_H / MAP_IMG_W);
  // Constrain if too tall
  if (mapH > maxMapH) {
    mapH = maxMapH;
    mapW = mapH * (MAP_IMG_W / MAP_IMG_H);
  }
  const mapX = MARGIN_L + (CONTENT_W - mapW) / 2; // center if narrower

  // Cadastral map
  y = drawSectionTitle(doc, t("report.mapCadastral"), y);
  y -= 4;
  const cadastralImg = await fetchMapImage(CADASTRAL_LAYERS, bbox);
  y = embedMapSized(doc, cadastralImg, mapX, y, mapW, mapH, t("report.mapCadastralNA"));
  y += 8;

  // Aerial image
  y = drawSectionTitle(doc, t("report.mapAerial"), y);
  y -= 4;
  const aerialImg = await fetchMapImage(AERIAL_LAYERS, bbox);
  embedMapSized(doc, aerialImg, mapX, y, mapW, mapH, t("report.mapAerialNA"));
}

/**
 * Fetch a WMS map image, draw marker + scale bar on canvas, return as data URL.
 * Returns null on failure.
 */
async function fetchMapImage(layers, bbox) {
  try {
    const url = `${WMS_BASE}?${WMS_PARAMS}&LAYERS=${layers}&BBOX=${bbox}&WIDTH=${MAP_IMG_W}&HEIGHT=${MAP_IMG_H}`;
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bmpUrl = URL.createObjectURL(blob);

    const img = await loadImage(bmpUrl);
    URL.revokeObjectURL(bmpUrl);

    const canvas = document.createElement("canvas");
    canvas.width = MAP_IMG_W;
    canvas.height = MAP_IMG_H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    drawMarker(ctx, MAP_IMG_W / 2, MAP_IMG_H / 2);
    drawScaleBar(ctx);

    return canvas.toDataURL("image/jpeg", 0.92);
  } catch (err) {
    console.warn("Map image fetch failed:", err);
    return null;
  }
}

/** Embed a map data-URL into the PDF, or show a placeholder message */
function embedMapSized(doc, dataUrl, x, y, w, h, fallbackMsg) {
  if (dataUrl) {
    doc.addImage(dataUrl, "JPEG", x, y, w, h);
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);
  } else {
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(x, y, w, h, 2, 2, "F");
    doc.setTextColor(...GRAY_TEXT);
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(fallbackMsg, x + w / 2, y + h / 2, { align: "center" });
  }
  return y + h;
}

/** Draw a marker pin on canvas at (cx, cy) */
function drawMarker(ctx, cx, cy) {
  const r = 12;
  // Drop shadow
  ctx.beginPath();
  ctx.arc(cx, cy + 2, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fill();
  // Outer circle (federal blue)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#1a365d";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
  // Inner dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

/** Draw a scale bar in the bottom-left of the canvas */
function drawScaleBar(ctx) {
  // Map extent is MAP_EXTENT_E*2 meters across MAP_IMG_W pixels
  const metersPerPx = (MAP_EXTENT_E * 2) / MAP_IMG_W;
  // Pick a round scale length
  const targetPx = 100;
  const targetMeters = targetPx * metersPerPx;
  const round = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const scaleMeters = round.find((v) => v >= targetMeters * 0.6) || round[round.length - 1];
  const barPx = scaleMeters / metersPerPx;

  const x = 16;
  const y = MAP_IMG_H - 20;

  // Background
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(x - 6, y - 20, barPx + 28, 30);

  // Bar
  ctx.fillStyle = "#1a365d";
  ctx.fillRect(x, y, barPx, 3);
  // End ticks
  ctx.fillRect(x, y - 4, 2, 11);
  ctx.fillRect(x + barPx - 2, y - 4, 2, 11);

  // Label
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "#1a365d";
  ctx.textBaseline = "bottom";
  const label = scaleMeters >= 1000 ? `${scaleMeters / 1000} km` : `${scaleMeters} m`;
  ctx.fillText(label, x, y - 5);
}

/* ── Data builders ── */

function buildComparisonRows(row) {
  const fields = [
    { key: "street", matchKey: "match_street" },
    { key: "street_number", matchKey: "match_street_number" },
    { key: "zip", matchKey: "match_zip" },
    { key: "city", matchKey: "match_city" },
    { key: "region", matchKey: "match_region" },
    { key: "building_type", matchKey: "match_building_type" },
  ];

  const rows = [];
  for (const f of fields) {
    let inputVal = String(row[f.key] ?? "").trim();
    let gwrVal = String(row[`gwr_${f.key}`] ?? "").trim();
    const matchResult = String(row[f.matchKey] ?? "").trim();

    if (f.key === "building_type") {
      if (inputVal) inputVal = codeLabel("GKAT", inputVal);
      if (gwrVal) gwrVal = codeLabel("GKAT", gwrVal);
    }

    rows.push({
      label: t(`col.${f.key}`),
      input: inputVal || "\u2014",
      gwr: gwrVal || "\u2014",
      result: matchResult || "\u2014",
    });
  }

  // Coordinates row
  const inputLat = parseFloat(row.latitude);
  const inputLng = parseFloat(row.longitude);
  const gwrLat = parseFloat(row.gwr_latitude);
  const gwrLng = parseFloat(row.gwr_longitude);

  const fmtCoord = (lat, lng) =>
    !isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "\u2014";

  rows.push({
    label: t("col.latitude") + " / " + t("col.longitude"),
    input: fmtCoord(inputLat, inputLng),
    gwr: fmtCoord(gwrLat, gwrLng),
    result: String(row.match_coordinates ?? "").trim() || "\u2014",
  });

  return rows;
}

function buildRecommendations(row) {
  const recs = [];

  if (row.gwr_match === "not_found") {
    recs.push({ severity: "error", text: t("report.recNotFound") });
    return recs;
  }
  if (row.gwr_match === "skipped") {
    recs.push({ severity: "warning", text: t("report.recSkipped") });
    return recs;
  }

  const status = String(row.gwr_status ?? "");
  if (status === "1007") {
    recs.push({ severity: "error", text: t("report.recDemolished", { year: row.gwr_demolition_year || "\u2014" }) });
  }
  if (["1001", "1002", "1003"].includes(status)) {
    recs.push({ severity: "warning", text: t("report.recNotCompleted", { status: codeLabel("GSTAT", status) }) });
  }

  let mismatchCount = 0;

  if (row.match_street === "mismatch") {
    recs.push({ severity: "warning", text: t("report.recStreet", { value: row.gwr_street || "\u2014" }) });
    mismatchCount++;
  }
  if (row.match_street_number === "mismatch") {
    recs.push({ severity: "warning", text: t("report.recStreetNumber", { input: row.street_number || "\u2014", gwr: row.gwr_street_number || "\u2014" }) });
    mismatchCount++;
  }
  if (row.match_zip === "mismatch") {
    recs.push({ severity: "warning", text: t("report.recZip", { input: row.zip || "\u2014", gwr: row.gwr_zip || "\u2014" }) });
    mismatchCount++;
  }
  if (row.match_city === "mismatch") {
    recs.push({ severity: "warning", text: t("report.recCity", { input: row.city || "\u2014", gwr: row.gwr_city || "\u2014" }) });
    mismatchCount++;
  }
  if (row.match_region === "mismatch") {
    recs.push({ severity: "info", text: t("report.recRegion", { input: row.region || "\u2014", gwr: row.gwr_region || "\u2014" }) });
    mismatchCount++;
  }
  if (row.match_building_type === "mismatch") {
    const inputLabel = row.building_type ? codeLabel("GKAT", row.building_type) : "\u2014";
    const gwrLabel = row.gwr_building_type ? codeLabel("GKAT", row.gwr_building_type) : "\u2014";
    recs.push({ severity: "warning", text: t("report.recBuildingType", { input: inputLabel, gwr: gwrLabel }) });
    mismatchCount++;
  }
  if (row.match_coordinates === "mismatch") {
    const iLat = parseFloat(row.latitude), iLng = parseFloat(row.longitude);
    const gLat = parseFloat(row.gwr_latitude), gLng = parseFloat(row.gwr_longitude);
    if (!isNaN(iLat) && !isNaN(iLng) && !isNaN(gLat) && !isNaN(gLng)) {
      const dist = Math.round(haversineMeters(iLat, iLng, gLat, gLng));
      recs.push({ severity: "warning", text: t("report.recCoordFar", { distance: dist }) });
    }
    mismatchCount++;
  }

  const numScore = row.match_score !== "" && row.match_score != null ? Number(row.match_score) : null;
  if (numScore != null && numScore < 50) {
    recs.push({ severity: "error", text: t("report.recLowConf") });
  }
  if (mismatchCount >= 3) {
    recs.push({ severity: "error", text: t("report.recMultiple") });
  }

  return recs;
}

function buildLinksData(row) {
  const egid = row.gwr_egid || row.egid || "";
  const lat = parseFloat(row.gwr_latitude) || parseFloat(row.latitude) || null;
  const lng = parseFloat(row.gwr_longitude) || parseFloat(row.longitude) || null;
  const lang = getLang();
  const links = [];

  if (egid) {
    links.push({ label: t("report.linkGwr"), url: `https://www.housing-stat.ch/${lang}/query/egid.html?egid=${egid}` });
  }
  if (lat != null && lng != null) {
    const oerebLayers = "ch.swisstopo.zeitreihen@year=1864,f;ch.bfs.gebaeude_wohnungs_register,f;ch.bav.haltestellen-oev,f;ch.swisstopo.swisstlm3d-wanderwege,f;ch.astra.wanderland-sperrungen_umleitungen,f;ch.swisstopo-vd.stand-oerebkataster";
    links.push({ label: t("report.linkOereb"), url: `https://map.geo.admin.ch/#/map?lang=${lang}&swisssearch=${lng},${lat}&topic=ech&layers=${oerebLayers}&bgLayer=ch.swisstopo.pixelkarte-farbe&featureInfo=default` });
  }
  if (egid) {
    links.push({ label: t("report.linkSwisstopo"), url: `https://map.geo.admin.ch/?lang=${lang}&swisssearch=${egid}` });
  }
  if (lat != null && lng != null) {
    links.push({ label: t("report.linkGoogleMaps"), url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` });
    links.push({ label: t("report.linkGoogleEarth"), url: `https://earth.google.com/web/@${lat},${lng},0a,200d,35y,0h,45t,0r` });
  }
  return links;
}

/* ── Coordinate conversion: WGS84 → LV95 (official Swisstopo approximate formula) ── */

function wgs84ToLv95(lat, lng) {
  const latSec = lat * 3600;
  const lngSec = lng * 3600;
  const latAux = (latSec - 169028.66) / 10000;
  const lngAux = (lngSec - 26782.5) / 10000;

  const E = 2600072.37
    + 211455.93 * lngAux
    - 10938.51 * lngAux * latAux
    - 0.36 * lngAux * latAux * latAux
    - 44.54 * lngAux * lngAux * lngAux;

  const N = 1200147.07
    + 308807.95 * latAux
    + 3745.25 * lngAux * lngAux
    + 76.63 * latAux * latAux
    - 194.56 * lngAux * lngAux * latAux
    + 119.79 * latAux * latAux * latAux;

  return { E, N };
}

/* ── Helpers ── */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function ensureJsPDF() {
  if (window.jspdf) return;
  await loadScript(JSPDF_CDN);
  await loadScript(AUTOTABLE_CDN);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
