import test from "node:test";
import assert from "node:assert/strict";
import {
  AYAH_COUNTS,
  SURAH_NAMES,
  parseSelection,
  summarizeSelection,
  toGlobalNumber,
} from "../src/quran.js";

test("114 surahs and 6236 ayahs", () => {
  assert.equal(AYAH_COUNTS.length, 114);
  assert.equal(SURAH_NAMES.length, 114);
  assert.equal(
    AYAH_COUNTS.reduce((a, b) => a + b, 0),
    6236,
  );
});
test("summary groups verses by surah name and compresses ranges", () => {
  const selection = parseSelection("114:1-3, 2:255, 1:1-7, 2:285-286");
  assert.equal(
    summarizeSelection(selection),
    "سورة الفاتحة: الآيات 1–7\nسورة البقرة: الآيات 255، 285–286\nسورة الناس: الآيات 1–3",
  );
});
test("mushaf order and deduplication", () => {
  const actual = parseSelection("114:6, 2:255\n1:1-2, 1:2");
  assert.deepEqual(
    actual.map((v) => v.reference),
    ["1:1", "1:2", "2:255", "114:6"],
  );
});
test("arabic digits and mixed punctuation", () => {
  assert.deepEqual(
    parseSelection("٢:٢٥٥، ١:١-٢").map((v) => v.reference),
    ["1:1", "1:2", "2:255"],
  );
});
test("first and final verse map to 1 and 6236", () => {
  assert.equal(toGlobalNumber(1, 1), 1);
  assert.equal(toGlobalNumber(114, 6), 6236);
  assert.equal(toGlobalNumber(2, 255), 262);
});
test("invalid and reversed references are rejected", () => {
  for (const input of [
    "0:1",
    "115:1",
    "2:287",
    "113:6",
    "1:4-2",
    "hello",
    "",
    "1:1-7, 2:1-80",
  ]) {
    assert.throws(() => parseSelection(input));
  }
});
test("trims whitespace and accepts Persian digits", () => {
  assert.equal(parseSelection("  ۲ : ۲۵۵  ")[0].number, 262);
});

test("applies a caller-provided device limit after deduplication", () => {
  assert.equal(parseSelection("1:1-3, 1:1", 3).length, 3);
  assert.throws(() => parseSelection("1:1-4", 3), /الحد الأقصى 3/);
});
