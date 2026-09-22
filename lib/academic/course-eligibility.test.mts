import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCourseEligibility, parseCatalogPrerequisites } from "./course-eligibility.ts";

test("parses and evaluates a simple minimum-grade prerequisite", () => {
  const parsed = parseCatalogPrerequisites(
    "Course Information: Prerequisite(s): Grade of C or better in ACTG 210 .",
  );
  assert.equal(parsed.confidence, "exact");
  assert.deepEqual(evaluateCourseEligibility(parsed, {
    completed: [{ code: "ACTG 210", grade: "B" }],
  }).status, "eligible");
  assert.deepEqual(evaluateCourseEligibility(parsed, {
    completed: [{ code: "ACTG 210", grade: "D" }],
  }).status, "blocked");
});

test("supports OR alternatives", () => {
  const parsed = parseCatalogPrerequisites(
    "Prerequisite(s): Grade of C or better in CS 111 or Grade of C or better in CS 112 .",
  );
  assert.equal(parsed.confidence, "exact");
  const result = evaluateCourseEligibility(parsed, {
    completed: [{ code: "CS 112", grade: "A" }],
  });
  assert.equal(result.status, "eligible");
  assert.deepEqual(result.satisfied, ["CS 112"]);
});

test("allows an explicit concurrent prerequisite", () => {
  const parsed = parseCatalogPrerequisites(
    "Prerequisite(s): Credit or concurrent registration in MATH 180 .",
  );
  const result = evaluateCourseEligibility(parsed, {
    completed: [],
    inProgress: ["MATH 180"],
  });
  assert.equal(result.status, "eligible");
});

test("keeps placement and consent conditions unresolved", () => {
  const parsed = parseCatalogPrerequisites(
    "Prerequisite(s): MATH 180; or appropriate score on the department placement test or consent of the instructor.",
  );
  assert.equal(parsed.confidence, "partial");
  const result = evaluateCourseEligibility(parsed, { completed: [] });
  assert.equal(result.status, "review");
  assert.ok(result.unresolved.includes("Placement requirement"));
  assert.ok(result.unresolved.includes("Consent or approval requirement"));
});

test("does not treat recommended background as a prerequisite", () => {
  const parsed = parseCatalogPrerequisites(
    "Prerequisite(s): CS 251. Recommended background: CS 301 or MATH 215.",
  );
  assert.equal(parsed.sourceText, "CS 251.");
  assert.deepEqual(evaluateCourseEligibility(parsed, {
    completed: [{ code: "CS 251", grade: "B" }],
  }).status, "eligible");
});
