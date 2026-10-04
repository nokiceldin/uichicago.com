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

test("groups UIC AND requirements separately from OR alternatives", () => {
  const parsed = parseCatalogPrerequisites(
    "Prerequisite (s): Grade of C or better in CS 141 or Grade of C or better in CS 107; and Grade of C or better in CS 151; and Credit or concurrent registration in CS 211 or Credit or concurrent registration in ECE 266.",
  );
  assert.equal(parsed.confidence, "exact");
  assert.equal(evaluateCourseEligibility(parsed, {
    completed: [
      { code: "CS 141", grade: "B" },
      { code: "CS 151", grade: "A" },
    ],
    inProgress: ["CS 211"],
  }).status, "eligible");
  assert.equal(evaluateCourseEligibility(parsed, {
    completed: [
      { code: "CS 141", grade: "B" },
      { code: "CS 151", grade: "A" },
    ],
  }).status, "blocked");
});

test("does not mistake 'credit or concurrent' for an alternative to an earlier prerequisite", () => {
  const parsed = parseCatalogPrerequisites(
    "Prerequisite(s): Grade of C or better in CS 141; and Credit or concurrent registration in CS 211.",
  );
  assert.equal(evaluateCourseEligibility(parsed, {
    completed: [],
    inProgress: ["CS 211"],
  }).status, "blocked");
  assert.equal(evaluateCourseEligibility(parsed, {
    completed: [{ code: "CS 141", grade: "A" }],
    inProgress: ["CS 211"],
  }).status, "eligible");
});

test("meaningful unsupported qualifiers force review even when course rules pass", () => {
  for (const description of [
    "Prerequisite(s): CS 111 and a minimum 2.50 GPA.",
    "Prerequisite(s): Grade of C or better in CS 111 and successful completion of a portfolio review.",
  ]) {
    const parsed = parseCatalogPrerequisites(description);
    assert.equal(parsed.confidence, "partial");
    assert.ok(parsed.unresolvedConditions.includes("Unsupported prerequisite qualifier"));
    assert.equal(evaluateCourseEligibility(parsed, {
      completed: [{ code: "CS 111", grade: "A" }],
    }).status, "review");
  }
});
