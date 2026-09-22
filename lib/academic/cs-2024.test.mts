import assert from "node:assert/strict";
import test from "node:test";
import { buildCsAudit, formatCsAuditForChat } from "./cs-audit.ts";
import type { SavedAuditImport } from "./audit-import-review.ts";

function fixture(done: [string, number][], current: [string, number][] = []) {
  const snapshot: SavedAuditImport = {
    version: 1, importedAt: "2026-09-21", metadata: { program: "0112 BS: Computer Science", catalogCode: "202408", preparedOn: "2026-09-20" },
    attempts: [...done, ...current].map(([code, hours], i) => ({ code, hours, term: "FA26", grade: i < done.length ? "A" : "IP", flags: [], status: i < done.length ? "graded" : "in_progress", sourceLine: i + 1 })),
    choices: [...done.map(() => "completed" as const), ...current.map(() => "in_progress" as const)],
    totals: { allCoursesEarned: null, degreeEarned: null, degreeInProgress: null, degreeRequired: null }, requirements: [], exceptions: [], warnings: [],
  };
  const completed = done.map(([c]) => c), active = current.map(([c]) => c);
  const audit = buildCsAudit("CS", completed, active, "202408", snapshot)!;
  return { audit, snapshot, completed, active, get: (id: string) => audit.requirements.find(r => r.id === `cs.${id}`)! };
}

test("archived program selection is strict and never falls back to the live catalog", () => {
  const { snapshot, audit } = fixture([["CS 112", 3]]);
  assert.equal(audit.catalogYear, "2024-2025");
  assert.equal(audit.requirements[0].status, "reported_complete");
  assert.equal(buildCsAudit("CS", [], [], "202508", snapshot), null);
  assert.equal(buildCsAudit("CS", [], [], "202408"), null);
  assert.equal(buildCsAudit("Computer Science and Design", [], [], "202408", snapshot), null);
  assert.equal(buildCsAudit("CS", [], [], "202408", { ...snapshot, metadata: { ...snapshot.metadata, program: "0112 BS: Computer Science Software Engineering" } }), null);
  assert.equal(audit.scope, "partial");
  assert.match(audit.notice, /provisionally mapped/);
});

test("MATH 218 replaces 310 and IE 342 removes incompatible statistics options", () => {
  const { get } = fixture([["IE 342", 3], ["MATH 218", 3]]);
  const math = get("math");
  assert.equal(math.status, "missing");
  assert.match(math.explanation, /6\/9 reported credits; 3 additional credits/);
  for (const excluded of ["MATH 310", "MATH 320", "STAT 381", "STAT 401"]) assert.ok(!math.options.includes(excluded));
  assert.ok(math.options.includes("MATH 215"));
});

test("linear-algebra alternatives and incompatible statistics cannot inflate credit", () => {
  const { get } = fixture([["IE 342", 3], ["MATH 218", 3], ["MATH 310", 3], ["MATH 320", 3], ["STAT 401", 3], ["STAT 381", 3]]);
  assert.equal(get("math").status, "missing");
  assert.equal(get("math").completed.length, 2);
});

test("math reports current courses as conditional", () => {
  const { get } = fixture([["IE 342", 3], ["MATH 218", 3]], [["MATH 215", 3]]);
  assert.equal(get("math").status, "in_progress");
  assert.deepEqual(get("math").inProgress, ["MATH 215"]);
});

test("technical electives require BOTH six courses and 18 credits, max one non-CS", () => {
  const cs: [string, number][] = ["CS 411", "CS 412", "CS 415", "CS 418"].map(c => [c, 3]);
  assert.equal(fixture([...cs, ["IT 301", 3], ["ECE 469", 3]]).get("technical").status, "missing");
  assert.equal(fixture([...cs, ["CS 421", 3], ["IT 301", 3]]).get("technical").status, "reported_complete");
  assert.equal(fixture([...cs, ["CS 421", 1], ["IT 301", 1]]).get("technical").status, "missing");
  assert.equal(fixture(cs.map(([c]) => [c, 5])).get("technical").status, "missing");
});

test("MCS 471 cannot silently satisfy math AND technical groups", () => {
  const { get } = fixture([["MCS 471", 3], ["IE 342", 3], ["MATH 218", 3]]);
  assert.equal(get("math").status, "unknown");
  assert.equal(get("technical").status, "unknown");
  assert.ok(!get("math").completed.includes("MCS 471"));
  assert.ok(!get("technical").completed.includes("MCS 471"));
});

test("CS 398 approval is unresolved, never automatically counted", () => {
  const { get } = fixture([["CS 398", 3]]);
  assert.equal(get("technical").status, "unknown");
  assert.deepEqual(get("technical").completed, []);
});

test("science needs a full lab bundle and two distinct choices", () => {
  assert.equal(fixture([["BIOS 110", 4], ["CHEM 122", 4]]).get("science").status, "missing");
  assert.equal(fixture([["BIOS 110", 4], ["CHEM 122", 3]], [["CHEM 123", 1]]).get("science").status, "in_progress");
  assert.equal(fixture([["CHEM 116", 5], ["CHEM 122", 3], ["CHEM 123", 2]]).get("science").status, "missing");
  assert.equal(fixture([["BIOS 110", 4]], [["BIOS 120", 4]]).get("science").status, "in_progress");
  assert.equal(fixture([["BIOS 110", 3], ["BIOS 120", 3]]).get("science").status, "missing");
});

test("changed records or invalid import choices cannot establish group credit", () => {
  const { snapshot, completed } = fixture([["IE 342", 3], ["MATH 218", 3], ["MATH 215", 3]]);
  const changed = buildCsAudit("CS", [...completed, "CS 141"], [], "202408", snapshot)!;
  assert.equal(changed.requirements.find(r => r.id === "cs.math")?.status, "unknown");
  assert.match(changed.notice, /no longer matches/);
  const invalid = buildCsAudit("CS", completed, [], "202408", { ...snapshot, choices: [] })!;
  assert.equal(invalid.requirements.find(r => r.id === "cs.math")?.status, "unknown");
});

test("zero-credit CS 499 remains required and graduation stays unresolved", () => {
  const { get, audit, snapshot } = fixture([["ENGR 100", 1]]);
  assert.equal(get("course.CS-499").status, "missing");
  assert.equal(get("seminar").status, "reported_complete");
  assert.equal(get("graduation").status, "unknown");
  assert.match(formatCsAuditForChat(audit), /2024–2025/);
  const exception = buildCsAudit("CS", ["ENGR 100"], [], "202408", { ...snapshot, exceptions: [{ index: 1, status: "needs_review" }] })!;
  assert.match(exception.notice, /exceptions require advisor review/);
});

test("option lists respect already-used science alternatives and outside-CS capacity", () => {
  const { get } = fixture([["CHEM 116", 5], ["IT 301", 3]]);
  assert.ok(!get("science").options.some(c => /CHEM 12[23]/.test(c)));
  assert.ok(get("science").options.includes("CHEM 124 + CHEM 125"));
  assert.ok(get("technical").options.every(c => c.startsWith("CS ")));
});

test("split transcript credits fail closed and current IE 342 supersedes STAT 381", () => {
  const { snapshot, completed } = fixture([["IE 342", 3], ["MATH 218", 3], ["MATH 215", 3]]);
  snapshot.attempts[0].flags = [">S"];
  const audit = buildCsAudit("CS", completed, [], "202408", snapshot)!;
  assert.equal(audit.requirements.find(r => r.id === "cs.math")?.status, "unknown");
  assert.equal(fixture([["STAT 381", 3]], [["IE 342", 3]]).get("statistics").status, "in_progress");
});
