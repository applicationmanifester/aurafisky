// -- ISOBAR / PRESSURE FRONT OVERLAY --
//
// Samples mean-sea-level pressure across the current viewport as a coarse
// grid (Open-Meteo's multi-point `current=` query — the same CSV-lat/lng
// pattern the temperature overlay in appToggles.js already uses), contours
// it with a from-scratch marching-squares pass, and draws the result as
// labelled isobar lines with H/L badges at local extrema. No isobar/GRIB
// data source is wired into this app, so the field this draws is only as
// good as a 7×7 sample of Open-Meteo's point forecast — real synoptic
// charts interpolate a much denser model grid. Good enough to show *where*
// pressure is rising or falling across the visible map; not a substitute
// for an actual analysis chart.

import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import { Style, Stroke, Text, Fill, Circle as CircleStyle } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";

const GRID_SIZE = 7; // 7x7 = 49 sample points — enough for marching squares
                      // to read as contour lines, cheap enough for one fetch.
const CONTOUR_INTERVAL_HPA = 4; // Matches the spacing convention on printed
                                 // surface analysis charts.
const MAX_LEVELS = 10; // Safety cap — a pathological grid shouldn't draw 40 lines.

let isobarSource = null;
let isobarLayer = null;
let isobarFetchToken = 0;

function _ensureLayer() {
  if (isobarLayer) return;
  isobarSource = new VectorSource();
  isobarLayer = new VectorLayer({ source: isobarSource, zIndex: 320 });
  this.map.addLayer(isobarLayer);
}

/**
 * Builds the lat/lng sample grid for the current viewport, expanded 15%
 * past the visible edges so contour lines don't visibly truncate right at
 * the screen border.
 *
 * @returns {{ lats: number[], lngs: number[] } | null}
 */
function _viewportGrid() {
  const size = this.map.getSize();
  if (!size) return null;
  const extent = this.map.getView().calculateExtent(size);
  const [minLng, minLat] = toLonLat([extent[0], extent[1]]);
  const [maxLng, maxLat] = toLonLat([extent[2], extent[3]]);

  const latPad = (maxLat - minLat) * 0.15;
  const lngPad = (maxLng - minLng) * 0.15;
  const south = Math.max(-85, minLat - latPad);
  const north = Math.min(85, maxLat + latPad);
  const west = minLng - lngPad;
  const east = maxLng + lngPad;

  const lats = [];
  const lngs = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    // North to south, so row 0 is the top of the grid — matches the top/
    // bottom edge naming in the marching-squares pass below.
    lats.push(north - ((north - south) * i) / (GRID_SIZE - 1));
    lngs.push(west + ((east - west) * i) / (GRID_SIZE - 1));
  }
  return { lats, lngs };
}

/**
 * Fetches pressure_msl at every grid point in one request.
 *
 * @param {number[]} lats
 * @param {number[]} lngs
 * @returns {Promise<(number|null)[][]>} grid[row][col]
 */
async function _fetchPressureGrid(lats, lngs) {
  const points = [];
  for (const lat of lats) for (const lng of lngs) points.push({ lat, lng });

  const latParam = points.map((p) => p.lat.toFixed(3)).join(",");
  const lngParam = points.map((p) => p.lng.toFixed(3)).join(",");

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latParam}&longitude=${lngParam}&current=pressure_msl&timezone=auto`,
  );
  if (!res.ok) throw new Error("Pressure grid fetch failed");
  let results = await res.json();
  if (!Array.isArray(results)) results = [results];

  const grid = [];
  let i = 0;
  for (let r = 0; r < lats.length; r++) {
    const row = [];
    for (let c = 0; c < lngs.length; c++) {
      const v = results[i]?.current?.pressure_msl;
      row.push(typeof v === "number" ? v : null);
      i++;
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Marching squares over an irregular-but-rectangular lat/lng grid.
 *
 * Rather than the usual 16-case lookup table, this counts how many of a
 * cell's 4 edges the contour level crosses (always 0, 2, or 4 — 4 only at
 * a saddle, where diagonal corners share a side of the level and the other
 * diagonal shares the other) and connects them directly. That sidesteps
 * needing the full case table while producing the same topology; the two
 * saddle sub-cases are told apart by which diagonal pair agrees with each
 * other, not by an extra "average vs. level" heuristic.
 *
 * @param {(number|null)[][]} grid
 * @param {number[]} lats
 * @param {number[]} lngs
 * @param {number} level
 * @returns {Array<[[number, number], [number, number]]>} lng/lat segment pairs
 */
function _marchingSquares(grid, lats, lngs, level) {
  const segments = [];
  const rows = lats.length;
  const cols = lngs.length;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = grid[r][c];
      const tr = grid[r][c + 1];
      const bl = grid[r + 1][c];
      const br = grid[r + 1][c + 1];
      if (tl == null || tr == null || bl == null || br == null) continue;

      const above = (v) => v > level;

      const topCrosses = above(tl) !== above(tr);
      const rightCrosses = above(tr) !== above(br);
      const bottomCrosses = above(bl) !== above(br);
      const leftCrosses = above(tl) !== above(bl);

      const lerp = (a, b, va, vb) => a + ((level - va) / (vb - va)) * (b - a);

      const topPt = topCrosses
        ? [lerp(lngs[c], lngs[c + 1], tl, tr), lats[r]]
        : null;
      const rightPt = rightCrosses
        ? [lngs[c + 1], lerp(lats[r], lats[r + 1], tr, br)]
        : null;
      const bottomPt = bottomCrosses
        ? [lerp(lngs[c], lngs[c + 1], bl, br), lats[r + 1]]
        : null;
      const leftPt = leftCrosses
        ? [lngs[c], lerp(lats[r], lats[r + 1], tl, bl)]
        : null;

      const crossed = [topPt, rightPt, bottomPt, leftPt].filter(Boolean);
      if (crossed.length === 2) {
        segments.push([crossed[0], crossed[1]]);
      } else if (crossed.length === 4) {
        // Saddle: TL/BR agreeing (both above or both below level) means the
        // contour isolates TL from TR+BL+BR-ish — pair (top,left) and
        // (bottom,right) to keep TL cut off on its own; otherwise TR/BL
        // agree and the pairing flips to (top,right) + (bottom,left).
        if (above(tl) === above(br)) {
          segments.push([topPt, leftPt]);
          segments.push([bottomPt, rightPt]);
        } else {
          segments.push([topPt, rightPt]);
          segments.push([bottomPt, leftPt]);
        }
      }
    }
  }
  return segments;
}

// Exported alongside init() purely for unit testing (see tests/isobars.test.mjs)
// — a precedent already set by features/ensemble.js's renderEnsemble export.
// Pure function, no `this`/app dependency, safe to call directly.
export { _marchingSquares as marchingSquaresContour };

function _lineStyle(isDark) {
  return new Style({
    stroke: new Stroke({
      color: isDark ? "rgba(226,232,240,0.55)" : "rgba(51,65,85,0.6)",
      width: 1.25,
      lineDash: [1, 0],
    }),
  });
}

function _labelStyle(text, isDark) {
  return new Style({
    text: new Text({
      text,
      font: "600 10px sans-serif",
      fill: new Fill({ color: isDark ? "#e2e8f0" : "#334155" }),
      stroke: new Stroke({ color: isDark ? "#0f172a" : "#f8fafc", width: 2 }),
    }),
  });
}

function _badgeStyle(letter, hpa, isDark) {
  const isHigh = letter === "H";
  return new Style({
    image: new CircleStyle({
      radius: 12,
      fill: new Fill({
        color: isHigh ? "rgba(37,99,235,0.85)" : "rgba(220,38,38,0.85)",
      }),
      stroke: new Stroke({ color: "#fff", width: 1.5 }),
    }),
    text: new Text({
      text: `${letter}\n${Math.round(hpa)}`,
      font: "700 10px sans-serif",
      fill: new Fill({ color: "#fff" }),
      offsetY: 0,
      textAlign: "center",
    }),
  });
}

/**
 * Finds grid cells that are a strict local extremum vs. all 8 neighbors —
 * the isobar map's H/L badges. Only checked on the interior of the grid so
 * every candidate has a full neighbor ring.
 */
function _findExtrema(grid, lats, lngs) {
  const rows = lats.length;
  const cols = lngs.length;
  const extrema = [];

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const v = grid[r][c];
      if (v == null) continue;
      let isMax = true;
      let isMin = true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const n = grid[r + dr][c + dc];
          if (n == null) continue;
          if (n >= v) isMax = false;
          if (n <= v) isMin = false;
        }
      }
      if (isMax) extrema.push({ type: "H", lat: lats[r], lng: lngs[c], hpa: v });
      else if (isMin) extrema.push({ type: "L", lat: lats[r], lng: lngs[c], hpa: v });
    }
  }
  return extrema;
}

async function _renderIsobars() {
  this._ensureIsobarLayer();
  const token = ++isobarFetchToken;

  const gridDef = this._isobarViewportGrid();
  if (!gridDef) return;
  const { lats, lngs } = gridDef;

  let grid;
  try {
    grid = await this._fetchPressureGrid(lats, lngs);
  } catch (e) {
    console.warn("Isobar fetch failed:", e);
    return;
  }
  // A slower toggle-off/pan-away race lands here after a newer request has
  // already started (or the overlay was switched off); drop the stale result.
  if (token !== isobarFetchToken || !this.isobarsEnabled) return;

  isobarSource.clear();

  const values = grid.flat().filter((v) => v != null);
  if (values.length < 4) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat field (calm high-pressure ridge sampled at synoptic scale) has
  // nothing to contour — drawing zero lines is the correct rendering, not
  // a bug to work around.
  if (max - min < CONTOUR_INTERVAL_HPA) return;

  const firstLevel = Math.ceil(min / CONTOUR_INTERVAL_HPA) * CONTOUR_INTERVAL_HPA;
  const levels = [];
  for (
    let lvl = firstLevel;
    lvl <= max && levels.length < MAX_LEVELS;
    lvl += CONTOUR_INTERVAL_HPA
  ) {
    levels.push(lvl);
  }

  for (const level of levels) {
    const segments = this._isobarMarchingSquares(grid, lats, lngs, level);
    if (!segments.length) continue;

    for (const [a, b] of segments) {
      const feature = new Feature(
        new LineString([fromLonLat(a), fromLonLat(b)]),
      );
      feature.setStyle(_lineStyle(this.isDark));
      isobarSource.addFeature(feature);
    }

    // One label per level, at the midpoint of its longest segment — cheap
    // stand-in for proper along-line label placement.
    let longest = null;
    let longestLen = -1;
    for (const [a, b] of segments) {
      const len = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (len > longestLen) {
        longestLen = len;
        longest = [a, b];
      }
    }
    if (longest) {
      const mid = [
        (longest[0][0] + longest[1][0]) / 2,
        (longest[0][1] + longest[1][1]) / 2,
      ];
      const labelFeature = new Feature(new Point(fromLonLat(mid)));
      labelFeature.setStyle(_labelStyle(`${level}`, this.isDark));
      isobarSource.addFeature(labelFeature);
    }
  }

  for (const ex of this._findIsobarExtrema(grid, lats, lngs)) {
    const feature = new Feature(new Point(fromLonLat([ex.lng, ex.lat])));
    feature.setStyle(_badgeStyle(ex.type, ex.hpa, this.isDark));
    isobarSource.addFeature(feature);
  }
}

function toggleIsobars(force) {
  this.isobarsEnabled = force ?? !this.isobarsEnabled;

  if (this.$.isobarToggleBtn) {
    this.$.isobarToggleBtn.setAttribute("aria-pressed", String(this.isobarsEnabled));
    this.$.isobarToggleBtn.classList.toggle("isobar-active", this.isobarsEnabled);
    this.$.isobarToggleBtn.textContent = this.isobarsEnabled ? "ON" : "OFF";
  }

  if (this.isobarsEnabled) {
    this._renderIsobars();
    if (!this._isobarMoveEndHandler) {
      // Re-sample when the user pans/zooms to a materially different view.
      // moveend already fires at a sane rate (not per-frame like postrender),
      // so no extra debounce is needed on top of it.
      this._isobarMoveEndHandler = () => {
        if (this.isobarsEnabled) this._renderIsobars();
      };
      this.map.on("moveend", this._isobarMoveEndHandler);
    }
  } else {
    isobarSource?.clear();
    isobarFetchToken++; // invalidate any in-flight fetch
  }
}

export function init(app) {
  app._ensureIsobarLayer = _ensureLayer;
  app._isobarViewportGrid = _viewportGrid;
  app._fetchPressureGrid = _fetchPressureGrid;
  app._isobarMarchingSquares = _marchingSquares;
  app._findIsobarExtrema = _findExtrema;
  app._renderIsobars = _renderIsobars;
  app.toggleIsobars = toggleIsobars;
  app.isobarsEnabled = false;
}
