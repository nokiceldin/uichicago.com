import assert from "node:assert/strict";
import test from "node:test";
import { formatCourseTermScope, summarizeCourseOutcomes } from "./outcome-summary.ts";

test("uses letter grades for attainment rates and A-F plus W for withdrawal rate", () => {
  const summary = summarizeCourseOutcomes({ a: 40, b: 30, c: 20, d: 5, f: 5, w: 20 });

  assert.equal(summary.letterGradeTotal, 100);
  assert.equal(summary.visibleOutcomeTotal, 120);
  assert.equal(summary.cOrBetterRate, 90);
  assert.equal(summary.dOrBetterRate, 95);
  assert.ok(Math.abs((summary.withdrawalRate ?? 0) - (100 / 6)) < 0.000001);
  assert.equal(summary.mostCommonLetterGrade, "A");
});

test("returns unavailable grade metrics when no letter-grade outcomes exist", () => {
  const empty = summarizeCourseOutcomes({});
  assert.equal(empty.cOrBetterRate, null);
  assert.equal(empty.dOrBetterRate, null);
  assert.equal(empty.withdrawalRate, null);
  assert.equal(empty.mostCommonLetterGrade, null);

  const withdrawalsOnly = summarizeCourseOutcomes({ w: 8 });
  assert.equal(withdrawalsOnly.cOrBetterRate, null);
  assert.equal(withdrawalsOnly.dOrBetterRate, null);
  assert.equal(withdrawalsOnly.withdrawalRate, 100);
  assert.equal(withdrawalsOnly.mostCommonLetterGrade, null);
});

test("formats course term ranges in semester order", () => {
  assert.equal(formatCourseTermScope([]), "No term-level grade data");
  assert.equal(formatCourseTermScope([{ code: "2024FA", name: "Fall 2024" }]), "Fall 2024");
  assert.equal(
    formatCourseTermScope([
      { code: "2025SP", name: "Spring 2025" },
      { code: "2022FA", name: "Fall 2022" },
      { code: "2023SU", name: "Summer 2023" },
    ]),
    "Fall 2022–Spring 2025",
  );
});
