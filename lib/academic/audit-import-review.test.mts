import assert from "node:assert/strict";
import test from "node:test";
import { parseUachieveText } from "./uachieve-import.ts";
import { defaultImportChoices, prepareAuditImport, reviewImport } from "./audit-import-review.ts";
import { buildCsAudit } from "./cs-audit.ts";
import { normalizeStudyProfileSnapshot, parseStoredPreferences, serializeStoredPreferences } from "../study/profile.ts";

const sample = `Student UIN:\t000000000
Student Name:\tSynthetic Student
Program:\t0112 BS: Computer Science
Catalog Year:\t202408
Requirement: ALL COURSES\tRequirement\tALL COURSES
FA24 CS 141 3.00 A
FA24 CS 151 3.00 F
WS25 CS 151 3.00 B
FA26 CS 251 4.00 IP >I
FA26 MATH 210 3.00 W
FA26 CS 211 3.00 NC`;

test("review defaults exclude repeated, failed, withdrawn and no-credit courses", () => {
  const audit = parseUachieveText(sample);
  assert.deepEqual(defaultImportChoices(audit), ["completed", "skip", "skip", "in_progress", "skip", "skip"]);
});

test("save revalidates choices rather than trusting the browser", () => {
  const audit = parseUachieveText(sample);
  const choices = defaultImportChoices(audit);
  choices[1] = "completed";
  assert.throws(() => reviewImport(audit, choices), /Unsupported/);
  choices[1] = "skip";
  choices[3] = "completed";
  assert.throws(() => reviewImport(audit, choices), /Unsupported/);
  assert.throws(() => reviewImport(audit, []), /every course/);
});

test("two passing attempts cannot silently collapse to a single course", () => {
  const audit = parseUachieveText(sample.replace("CS 151 3.00 F", "CS 151 3.00 C"));
  const choices = defaultImportChoices(audit);
  choices[1] = "completed"; choices[2] = "completed";
  assert.throws(() => reviewImport(audit, choices), /one attempt/);
});

test("selected records round-trip through account and device persistence", () => {
  const choices = defaultImportChoices(parseUachieveText(sample));
  choices[2] = "completed";
  const imported = prepareAuditImport(sample, choices, "2026-09-20T12:00:00Z");
  assert.deepEqual(imported.completedCourses, ["CS 141", "CS 151"]);
  assert.deepEqual(imported.currentCourses, ["CS 251"]);
  const stored = serializeStoredPreferences("Keep my notes", imported, { themeMode: "light" }, { customFolders: ["Keep my folder"] });
  const parsed = parseStoredPreferences(stored);
  assert.equal(parsed.notes, "Keep my notes");
  assert.deepEqual(parsed.workspaceState.customFolders, ["Keep my folder"]);
  const local = normalizeStudyProfileSnapshot({ plannerProfile: parsed.plannerProfile });
  assert.equal(local?.plannerProfile.auditImport?.metadata.catalogCode, "202408");
  assert.equal(local?.plannerProfile.auditImport?.attempts.length, 6);
  assert.doesNotMatch(stored, /Synthetic Student|000000000/);
});

test("known but unmapped catalogs cannot use the current CS rule snapshot", () => {
  assert.equal(buildCsAudit("CS", ["CS 141"], [], "202408"), null);
  assert.ok(buildCsAudit("CS", ["CS 141"], []));
});

test("missing catalog and empty imports cannot replace the saved record", () => {
  const noCatalog = parseUachieveText(sample.replace("Catalog Year:\t202408", ""));
  assert.throws(() => reviewImport(noCatalog, defaultImportChoices(noCatalog)), /catalog code/);
  const audit = parseUachieveText(sample);
  assert.throws(() => reviewImport(audit, audit.attempts.map(() => "skip")), /at least one/);
});
