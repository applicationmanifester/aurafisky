import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cToF,
  fToC,
  kmhToMph,
  mphToKmh,
  mmToIn,
  inToMm,
  hpaToInhg,
  inhgToHpa,
  getTempClass,
} from "../src/utils.js";

test("cToF converts freezing and boiling points", () => {
  assert.equal(cToF(0), 32);
  assert.equal(cToF(100), 212);
  assert.ok(Math.abs(cToF(20) - 68) < 1e-9);
});

test("fToC is the inverse of cToF", () => {
  assert.ok(Math.abs(fToC(cToF(37)) - 37) < 1e-9);
});

test("kmhToMph and mphToKmh round-trip", () => {
  assert.ok(Math.abs(kmhToMph(10) - 6.21371) < 1e-5);
  assert.ok(Math.abs(mphToKmh(kmhToMph(50)) - 50) < 1e-9);
});

test("mmToIn and inToMm round-trip", () => {
  assert.ok(Math.abs(mmToIn(25.4) - 1) < 1e-6);
  assert.ok(Math.abs(inToMm(mmToIn(10)) - 10) < 1e-9);
});

test("hpaToInhg and inhgToHpa round-trip", () => {
  assert.ok(Math.abs(hpaToInhg(1013) - 29.91) < 1e-2);
  assert.ok(Math.abs(inhgToHpa(hpaToInhg(1000)) - 1000) < 1e-6);
});

test("getTempClass buckets temperatures correctly", () => {
  assert.equal(getTempClass(null), "temp-neutral");
  assert.equal(getTempClass(-5), "temp-freezing");
  assert.equal(getTempClass(5), "temp-cold");
  assert.equal(getTempClass(15), "temp-mild");
  assert.equal(getTempClass(25), "temp-warm");
  assert.equal(getTempClass(35), "temp-hot");
});
