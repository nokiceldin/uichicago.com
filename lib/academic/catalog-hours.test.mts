import assert from "node:assert/strict";
import test from "node:test";
import { catalogHoursCountTowardGraduation, parseFixedCatalogHours } from "./catalog-hours.ts";

test("reads fixed catalog hours including zero and one", () => {
  assert.equal(parseFixedCatalogHours("1"), 1);
  assert.equal(parseFixedCatalogHours("0"), 0);
  assert.equal(parseFixedCatalogHours("4"), 4);
});

test("does not invent one value for variable-hour courses", () => {
  assert.equal(parseFixedCatalogHours("0-3"), null);
  assert.equal(parseFixedCatalogHours("3 or 4"), null);
});

test("recognizes courses that carry enrollment hours but no graduation credit", () => {
  assert.equal(catalogHoursCountTowardGraduation("Satisfactory/Unsatisfactory. No graduation credit."), false);
  assert.equal(catalogHoursCountTowardGraduation("Counts toward the degree."), true);
});
