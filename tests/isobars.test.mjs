// Runs under Vitest (see vitest.config.ts `include`).
import { test } from "vitest";
import assert from "node:assert/strict";
import { marchingSquaresContour } from "../features/isobars.js";

test("marchingSquaresContour bisects a simple left-right gradient", () => {
  const grid = [
    [0, 10],
    [0, 10],
  ];
  const segs = marchingSquaresContour(grid, [10, 0], [0, 10], 5);
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0], [
    [5, 10],
    [5, 0],
  ]);
});

test("marchingSquaresContour draws nothing across a flat field", () => {
  const grid = [
    [5, 5],
    [5, 5],
  ];
  const segs = marchingSquaresContour(grid, [10, 0], [0, 10], 5);
  assert.equal(segs.length, 0);
});

test("marchingSquaresContour isolates a single high corner", () => {
  const grid = [
    [10, 0],
    [0, 0],
  ];
  const segs = marchingSquaresContour(grid, [10, 0], [0, 10], 5);
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0], [
    [5, 10],
    [0, 5],
  ]);
});

test("marchingSquaresContour resolves a saddle into two separate segments", () => {
  // TL and BR both high (10), TR and BL both low (0) — a diagonal saddle.
  const grid = [
    [10, 0],
    [0, 10],
  ];
  const segs = marchingSquaresContour(grid, [10, 0], [0, 10], 5);
  assert.equal(segs.length, 2);
  // Each segment should isolate one high corner rather than connecting
  // across the whole cell (which would misrepresent the field).
  assert.deepEqual(segs[0], [
    [5, 10],
    [0, 5],
  ]);
  assert.deepEqual(segs[1], [
    [5, 0],
    [10, 5],
  ]);
});

test("marchingSquaresContour rings a single peak in a 3x3 grid", () => {
  const grid = [
    [0, 0, 0],
    [0, 10, 0],
    [0, 0, 0],
  ];
  const segs = marchingSquaresContour(grid, [2, 1, 0], [0, 1, 2], 5);
  // One crossing segment per surrounding cell — a closed diamond around the peak.
  assert.equal(segs.length, 4);
});

test("marchingSquaresContour skips cells with missing samples", () => {
  const grid = [
    [0, 10],
    [null, 10],
  ];
  const segs = marchingSquaresContour(grid, [10, 0], [0, 10], 5);
  assert.equal(segs.length, 0);
});
