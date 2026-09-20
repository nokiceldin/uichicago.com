import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRule, normalizeAcademicRecord, normalizeCourses, type Rule } from "./audit.ts";
import { buildCsAudit, formatCsAuditForChat } from "./cs-audit.ts";

test("academic record normalizes valid codes without inventing courses", () => {
  assert.deepEqual(normalizeCourses(["cs141", " CS 141 ", null, {}, "junior", "all sophomore classes"]), ["CS 141"]);
  assert.deepEqual(normalizeAcademicRecord(["cs141"], ["CS 141", "CS251"]), {
    completedCourses: ["CS 141"], currentCourses: ["CS 251"],
  });
});

test("no record means no inferred completion, including zero-credit CS 499", () => {
  const audit = buildCsAudit("CS", [], [])!;
  assert.equal(audit.requirements.filter(r => r.status === "reported_complete").length, 0);
  assert.equal(audit.requirements.find(r => r.label === "CS 499")?.status, "missing");
});

test("intro alternatives require one course, not every course", () => {
  for (const code of ["CS 111", "CS 112", "CS 113"]) {
    const intro = buildCsAudit("computer-science-bs", [code], [])!.requirements[0];
    assert.equal(intro.status, "reported_complete");
    assert.deepEqual(intro.options, []);
  }
});

test("current courses remain conditional and cannot become completed", () => {
  const audit = buildCsAudit("Computer Science", ["CS 141"], ["CS 251"])!;
  assert.equal(audit.requirements.find(r => r.label === "CS 251")?.status, "in_progress");
  assert.equal(audit.requirements.find(r => r.label === "CS 141")?.status, "reported_complete");
});

test("nested lecture/lab expression requires both components", () => {
  const rule: Rule = { kind: "any", rules: [
    { kind: "all", rules: [{ kind: "course", code: "CHEM 122" }, { kind: "course", code: "CHEM 123" }] },
    { kind: "course", code: "CHEM 116" },
  ] };
  assert.equal(evaluateRule(rule, normalizeAcademicRecord(["CHEM 122"], [])).status, "missing");
  assert.equal(evaluateRule(rule, normalizeAcademicRecord(["CHEM 122"], ["CHEM 123"])).status, "in_progress");
  assert.equal(evaluateRule(rule, normalizeAcademicRecord(["CHEM 122", "CHEM 123"], [])).status, "reported_complete");
  assert.equal(evaluateRule(rule, normalizeAcademicRecord(["CHEM 116"], [])).status, "reported_complete");
});

test("unknown and empty rules never silently pass", () => {
  const record = normalizeAcademicRecord([], []);
  assert.equal(evaluateRule({ kind: "all", rules: [] }, record).status, "unknown");
  assert.equal(evaluateRule({ kind: "unknown", reason: "Policy unavailable" }, record).status, "unknown");
});

test("CS rules never apply to adjacent programs", () => {
  for (const major of ["Computer Science and Design", "Computer Science and Linguistics", "Computer Engineering", "CS Software Engineering Concentration"]) {
    assert.equal(buildCsAudit(major, [], []), null);
  }
});

test("finishing every implemented course cannot imply degree completion", () => {
  const audit = buildCsAudit("CS", ["CS 111", "IE 342"], [])!;
  assert.equal(audit.scope, "partial");
  assert.equal(audit.requirements.find(r => r.id === "cs.graduation")?.status, "unknown");
  assert.match(formatCsAuditForChat(audit), /Do not infer completion/);
  assert.match(audit.notice, /catalog year/);
  assert.equal(new Set(audit.requirements.map(r => r.id)).size, audit.requirements.length);
});
