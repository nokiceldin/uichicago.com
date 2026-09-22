import assert from "node:assert/strict";
import test from "node:test";
import { alignRecordedCoursesToTimeline } from "./planner-timeline.ts";

const course = (code: string, status: "completed" | "in_progress" | "planned", kind: "required" | "elective" = "required", bucket = "required") => ({
  slotId: code.toLowerCase().replace(" ", "-"), code, status, kind, bucket,
});

test("moves a future in-progress course into the current semester, never a past semester", () => {
  const result = alignRecordedCoursesToTimeline([
    { id: "semester-1", courses: [course("CS 111", "completed")] },
    { id: "semester-2", courses: [course("CS 141", "completed")] },
    { id: "semester-3", courses: [course("MATH 210", "planned")] },
    { id: "semester-4", courses: [course("CS 261", "completed")] },
    { id: "semester-5", courses: [course("SOC 100", "planned", "elective", "gen_ed_any")] },
    { id: "semester-6", courses: [course("BIOS 120", "in_progress", "elective", "science_elective")] },
  ], 5);

  assert.equal(result[4].courses.some(item => item.code === "BIOS 120" && item.status === "in_progress"), true);
  assert.equal(result.slice(0, 4).some(semester => semester.courses.some(item => item.status === "in_progress")), false);
  assert.equal(result[5].courses.some(item => item.code === "SOC 100" && item.status === "planned"), true);
});

test("moves completed future requirements only into semesters before the current one", () => {
  const result = alignRecordedCoursesToTimeline([
    { id: "semester-1", courses: [course("CS 111", "completed")] },
    { id: "semester-2", courses: [course("CS 141", "planned")] },
    { id: "semester-3", courses: [course("CS 251", "planned")] },
    { id: "semester-4", courses: [course("CS 301", "completed")] },
  ], 3);
  assert.equal(result.slice(0, 2).some(semester => semester.courses.some(item => item.code === "CS 301")), true);
  assert.equal(result[2].courses.some(item => item.status === "completed"), false);
});

test("current semester contains only courses the student is actually taking", () => {
  const result = alignRecordedCoursesToTimeline([
    { id: "semester-1", courses: [course("CS 111", "completed")] },
    { id: "semester-2", courses: [course("CS 141", "completed")] },
    { id: "semester-3", courses: [course("CS 251", "completed")] },
    { id: "semester-4", courses: [course("CS 261", "completed")] },
    { id: "semester-5", courses: [
      course("CS 342", "in_progress"),
      course("CS 361", "in_progress"),
      course("SOC 100", "planned", "elective", "gen_ed_any"),
      course("BIOS 120", "in_progress", "elective", "science_elective"),
    ] },
    { id: "semester-6", courses: [course("CS 341", "planned")] },
    { id: "semester-7", courses: [course("CS 401", "planned"), course("CS 377", "planned")] },
  ], 5);

  assert.deepEqual(result[4].courses.map(item => item.code), ["CS 342", "CS 361", "BIOS 120"]);
  assert.equal(result[4].courses.every(item => item.status === "in_progress"), true);
  assert.equal(result.slice(5).some(semester => semester.courses.some(item => item.code === "SOC 100" && item.status === "planned")), true);
});
