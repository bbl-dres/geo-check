/* ── Geometry helpers (vendored third-party algorithms) ─────────────────────
   Visual-center (pole of inaccessibility) used to place the map marker inside
   irregular parcels, plus the supporting polylabel algorithm and the tiny
   priority queue it needs. Split out of app.js so the vendored code is clearly
   delineated and independently importable/testable.

   - polylabel: mapbox/polylabel (MIT)
   - TinyQueue: mourner/tinyqueue (ISC) */

import { polygonArea } from "./oereb-api.js";

/**
 * Visual center (pole of inaccessibility) of a GeoJSON Polygon/MultiPolygon —
 * the point inside the polygon farthest from any edge. Robust for irregular
 * Swiss parcels where the bbox / mass centroid would land outside the shape.
 *
 * Algorithm: mapbox/polylabel (MIT). For MultiPolygon we use the largest ring
 * by area — visually the most useful place for the marker.
 *
 * Returns [E, N] in the geometry's CRS (here: LV95, units = meters), or null
 * if the geometry is missing/empty.
 */
export function computeVisualCenter(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return polylabel(geometry.coordinates, 1.0);
  }
  if (geometry.type === "MultiPolygon") {
    let largest = null;
    let largestArea = -Infinity;
    for (const poly of geometry.coordinates) {
      const a = polygonArea(poly);
      if (a > largestArea) { largestArea = a; largest = poly; }
    }
    return largest ? polylabel(largest, 1.0) : null;
  }
  return null;
}

// polylabel (vendored, MIT) — pole of inaccessibility for a polygon.
//   https://github.com/mapbox/polylabel
//   https://blog.mapbox.com/a-new-algorithm-for-finding-a-visual-center-of-a-polygon-7c77e6492fbc
// Polygon = [outerRing, hole1, hole2, ...]; ring = [[x, y], ...].
// `precision` is in input CRS units (we pass 1.0 -> 1 meter on LV95).
function polylabel(polygon, precision) {
  // Bounding box of the outer ring
  let minX, minY, maxX, maxY;
  for (let i = 0; i < polygon[0].length; i++) {
    const p = polygon[0][i];
    if (!i || p[0] < minX) minX = p[0];
    if (!i || p[1] < minY) minY = p[1];
    if (!i || p[0] > maxX) maxX = p[0];
    if (!i || p[1] > maxY) maxY = p[1];
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.max(precision, Math.min(width, height));
  if (cellSize === 0) return [minX, minY];

  // Cover the bbox in square cells, ranked by upper-bound distance to the edge
  const cellQueue = new TinyQueue([], (a, b) => b.max - a.max);
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      cellQueue.push(new Cell(x + cellSize / 2, y + cellSize / 2, cellSize / 2, polygon));
    }
  }

  // Seed best with mass centroid; bbox center is also a candidate
  let bestCell = getCentroidCell(polygon);
  const bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, polygon);
  if (bboxCell.d > bestCell.d) bestCell = bboxCell;

  while (cellQueue.length) {
    const cell = cellQueue.pop();
    if (cell.d > bestCell.d) bestCell = cell;
    // Skip subdivision if this cell can't beat the current best meaningfully
    if (cell.max - bestCell.d <= precision) continue;
    const h = cell.h / 2;
    cellQueue.push(new Cell(cell.x - h, cell.y - h, h, polygon));
    cellQueue.push(new Cell(cell.x + h, cell.y - h, h, polygon));
    cellQueue.push(new Cell(cell.x - h, cell.y + h, h, polygon));
    cellQueue.push(new Cell(cell.x + h, cell.y + h, h, polygon));
  }

  return [bestCell.x, bestCell.y];
}

function Cell(x, y, h, polygon) {
  this.x = x;
  this.y = y;
  this.h = h;                                 // cell half-size
  this.d = pointToPolygonDist(x, y, polygon); // signed distance to polygon
  this.max = this.d + this.h * Math.SQRT2;    // upper bound for any point in cell
}

// Signed distance from (x, y) to polygon edges. Positive inside, negative outside.
function pointToPolygonDist(x, y, polygon) {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i];
      const b = ring[j];
      // Ray-casting toggle for point-in-polygon
      if ((a[1] > y) !== (b[1] > y) &&
          (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) {
        inside = !inside;
      }
      minDistSq = Math.min(minDistSq, segDistSq(x, y, a, b));
    }
  }
  return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// Squared distance from point (px, py) to segment a-b.
function segDistSq(px, py, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

// Mass centroid of the outer ring as a fallback seed.
function getCentroidCell(polygon) {
  let area = 0, x = 0, y = 0;
  const ring = polygon[0];
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const a = ring[i], b = ring[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area === 0) return new Cell(ring[0][0], ring[0][1], 0, polygon);
  return new Cell(x / area, y / area, 0, polygon);
}

// Minimal binary-heap priority queue (vendored from mourner/tinyqueue, ISC).
class TinyQueue {
  constructor(data = [], compare = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    this.data = data;
    this.length = data.length;
    this.compare = compare;
    if (this.length > 0) {
      for (let i = (this.length >> 1) - 1; i >= 0; i--) this._down(i);
    }
  }
  push(item) {
    this.data.push(item);
    this._up(this.length++);
  }
  pop() {
    if (this.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop();
    this.length--;
    if (this.length > 0) { this.data[0] = bottom; this._down(0); }
    return top;
  }
  _up(pos) {
    const { data, compare } = this;
    const item = data[pos];
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      const current = data[parent];
      if (compare(item, current) >= 0) break;
      data[pos] = current;
      pos = parent;
    }
    data[pos] = item;
  }
  _down(pos) {
    const { data, compare, length } = this;
    const halfLength = length >> 1;
    const item = data[pos];
    while (pos < halfLength) {
      let bestChild = (pos << 1) + 1;
      const right = bestChild + 1;
      if (right < length && compare(data[right], data[bestChild]) < 0) bestChild = right;
      if (compare(data[bestChild], item) >= 0) break;
      data[pos] = data[bestChild];
      pos = bestChild;
    }
    data[pos] = item;
  }
}
