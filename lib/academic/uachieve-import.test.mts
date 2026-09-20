import assert from "node:assert/strict";
import test from "node:test";
import { parseUachieveText } from "./uachieve-import.ts";

// Synthetic miniature audit: no private student document is stored in the repo.
const sample = `Student UIN:\t000000000
Student Name:\tExample Student
Program:\t0112 BS: Computer Science
Catalog Year:\t202408
Prepared On:\t09/20/2026
Requirement: Engineering Courses - CS Major\tRequirement Unfulfilled\tEngineering Courses - CS Major
EARNED:\t4.00 HOURS
WS26\tCS 261\t4.00\tA
Requirement: Understanding the Past\tRequirement Complete\tUnderstanding the Past
Requirement: Total Degree Hours\tRequirement Unfulfilled\tTotal Degree Hours
128 hours required
EARNED:\t4.00 HOURS
In-Prog:\t4.00 HOURS
WS26\tCS 261\t2.00\tA\t>S
WS26\tCS 261\t2.00\tA\t>S
FA26\tBIOS 120\t4.00\tIP\t>I
Requirement: ALL COURSES\tRequirement\tALL COURSES
EARNED:\t5.00 HOURS
In-Prog:\t4.00 HOURS
WS26\tCS 261\t4.00\tA
WS26\tENGR 100\t1.00\tS*
FA26\tBIOS 120\t4.00\tIP\t>I
EXCEPTION SUMMARY - FOR INTERNAL USE ONLY
CB HN 196 YT= RCRSE=FREE ELECTIVE AC= RC=`;

test("imports only the course-history section, preserving allocations separately", () => {
  const audit = parseUachieveText(sample);
  assert.equal(audit.attempts.length, 3);
  assert.equal(audit.attempts.filter(a => a.code === "CS 261").length, 1);
  assert.equal(audit.attempts.find(a => a.code === "CS 261")?.hours, 4);
  assert.equal(audit.requirements.find(r => r.title === "Total Degree Hours")?.appliedCourses.filter(a => a.code === "CS 261").length, 2);
});

test("preserves catalog identity, status-only completion, and distinct credit totals", () => {
  const audit = parseUachieveText(sample);
  assert.equal(audit.metadata.catalogCode, "202408");
  assert.equal(audit.totals.allCoursesEarned, 5);
  assert.equal(audit.totals.degreeEarned, 4);
  assert.equal(audit.totals.degreeInProgress, 4);
  assert.equal(audit.totals.degreeRequired, 128);
  assert.equal(audit.requirements.find(r => r.title === "Understanding the Past")?.status, "complete");
});

test("keeps IP, special grades, and exception uncertainty without exposing identity", () => {
  const audit = parseUachieveText(sample);
  assert.equal(audit.attempts.find(a => a.code === "BIOS 120")?.status, "in_progress");
  assert.equal(audit.attempts.find(a => a.code === "ENGR 100")?.grade, "S*");
  assert.equal(audit.exceptions.length, 1);
  assert.equal(audit.requiresReview, true);
  assert.doesNotMatch(JSON.stringify(audit), /Example Student|000000000/);
});

test("never falls back to treating repeated allocations as a transcript", () => {
  const audit = parseUachieveText(sample.split("Requirement: ALL COURSES")[0]);
  assert.equal(audit.attempts.length, 0);
  assert.ok(audit.warnings.some(w => w.includes("ALL COURSES is missing")));
});

test("marks unknown grades and repeated attempts for review", () => {
  const audit = parseUachieveText(sample.replace("EXCEPTION SUMMARY", "FA26 CS 342 3.00 XYZ\nFA26 CS 342 3.00 IP\nEXCEPTION SUMMARY"));
  assert.ok(audit.warnings.some(w => w.includes("Unrecognized grade")));
  assert.ok(audit.warnings.some(w => w.includes("Repeated course/term")));
  assert.ok(audit.warnings.some(w => w.includes("do not match")));
});

test("PDF-like text without requirement markers fails closed", () => {
  const audit = parseUachieveText("ALL COURSES\nFA26 CS 251 4.00 IP");
  assert.equal(audit.attempts.length, 0);
  assert.ok(audit.warnings.length > 0);
});

test("malformed history rows are reported, not silently interpreted", () => {
  const audit = parseUachieveText(sample.replace("EXCEPTION SUMMARY", "FA26 CS 342 unknown IP\nEXCEPTION SUMMARY"));
  assert.ok(audit.warnings.some(w => w.includes("Unrecognized course row")));
});
