import assert from "node:assert/strict";
import test from "node:test";
import { applyPlannerProgress } from "./planner-progress.ts";
import { normalizeAcademicRecord } from "./audit.ts";

const course = (code: string, credits: number | null = 3) => ({ code, credits, status: "planned" as const });

test("later standing never hides unfinished earlier requirements", () => {
  const schedule = [
    { totalHours: 6, courses: [course("CS 141"), course("CS 151")] },
    { totalHours: 4, courses: [course("CS 251", 4)] },
  ];
  const result = applyPlannerProgress(schedule, normalizeAcademicRecord(["CS 141"], []), 1, 1, false);
  assert.deepEqual(result.unscheduledRequirements.map(c => c.code), ["CS 151"]);
  assert.deepEqual(result.semesters[0].courses.map(c => c.code), ["CS 251"]);
  assert.equal(schedule[0].courses[0].status, "planned", "input stays immutable");
});

test("future display removes recorded coursework and recalculates hours", () => {
  const result = applyPlannerProgress([
    { totalHours: 10, courses: [course("CS 141"), course("CS 251", 4), course("CS 301")] },
  ], normalizeAcademicRecord(["CS 141"], ["CS 251"]), 0, 1, false);
  assert.deepEqual(result.semesters[0].courses.map(c => c.code), ["CS 301"]);
  assert.equal(result.semesters[0].totalHours, 3);
});

test("full view distinguishes recorded completion and current work, including zero credits", () => {
  const result = applyPlannerProgress([
    { totalHours: 4, courses: [course("CS 499", 0), course("CS 251", 4)] },
  ], normalizeAcademicRecord(["CS 499"], ["CS 251"]), 0, 1, true);
  assert.deepEqual(result.semesters[0].courses.map(c => c.status), ["completed", "in_progress"]);
  assert.equal(result.semesters[0].totalHours, 4);
});

test("unknown credit hours never become a fabricated total", () => {
  const result = applyPlannerProgress([{ totalHours: 3, courses: [course("CS 398", null)] }], normalizeAcademicRecord([], []), 0, 1, true);
  assert.equal(result.semesters[0].totalHours, null);
});
