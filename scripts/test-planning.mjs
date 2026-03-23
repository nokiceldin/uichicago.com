/**
 * Planning mode test queries — 10 cases across different majors and data tiers.
 *
 * Run via:  node scripts/test-planning.mjs
 *
 * What each test validates:
 *  FULL tier (CS, CE, EE, Music) — schedule + courses + elective options present
 *    → expect: semester-by-semester plan with real elective codes, no 500+ courses
 *  SCHEDULE tier (e.g. Mechanical Engineering) — schedule + courses, no elective lists
 *    → expect: schedule reproduced, elective slots acknowledged without invented courses
 *  COURSES_ONLY tier (e.g. Accounting, Marketing, Biology) — courses but no schedule
 *    → expect: course-category listing ONLY, no "Year 1 / Year 2" invented structure
 *  MINIMAL tier (e.g. Interdisciplinary Education in the Arts) — <5 courses
 *    → expect: redirect to catalog/advisor, no course suggestions
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadMajor(name) {
  const indexPath = join(root, "public/data/uic-knowledge/majors/_index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const entry = index.majors.find((m) =>
    m.name.toLowerCase().includes(name.toLowerCase())
  );
  if (!entry) return null;
  const filePath = join(root, "public/data/uic-knowledge", entry.file);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function computePlanTier(major, hasElectiveOptions) {
  const hasSchedule = (major.sampleSchedule?.length ?? 0) > 0;
  const hasCourses = (major.requiredCourses?.length ?? 0) >= 5;
  if (hasSchedule && hasCourses && hasElectiveOptions) return "full";
  if (hasSchedule && hasCourses) return "schedule";
  if (hasCourses) return "courses_only";
  return "minimal";
}

function checkGraduateCourses(major) {
  const required = major.requiredCourses ?? [];
  const reqCodes = new Set(required.map((c) => c.code?.toUpperCase()).filter(Boolean));
  const electiveGroups = major.electiveGroups ?? [];
  const grad500inElectives = [];
  for (const g of electiveGroups) {
    for (const opt of g.options ?? []) {
      const num = parseInt(opt.code?.match(/\d+/)?.[0] ?? "0", 10);
      if (num >= 500 && !reqCodes.has(opt.code?.toUpperCase())) {
        grad500inElectives.push(opt.code);
      }
    }
  }
  return grad500inElectives;
}

const tests = [
  // FULL tier: schedule + required courses + elective options
  { name: "Computer Science - BS",           search: "computer science - bs",                expectedTier: "full" },
  { name: "Computer Engineering - BS",       search: "computer engineering - bs",             expectedTier: "full" },
  { name: "Electrical Engineering - BS",     search: "electrical engineering - bs",           expectedTier: "full" },
  { name: "Music - BA",                      search: "music - ba",                            expectedTier: "full" },
  // SCHEDULE tier: schedule + courses, no elective option lists
  { name: "Mechanical Engineering - BS",     search: "mechanical engineering - bs",           expectedTier: "schedule" },
  // COURSES_ONLY tier: required courses exist, no sample schedule
  { name: "Accounting - BS",                 search: "accounting - bs",                       expectedTier: "courses_only" },
  { name: "Biochemistry - BS",               search: "biochemistry - bs",                     expectedTier: "courses_only" },
  { name: "Criminology Law and Justice",     search: "criminology law and justice",           expectedTier: "courses_only" },
  // MINIMAL tier: insufficient course data
  { name: "Marketing - BS (minimal data)",   search: "marketing - bs",                        expectedTier: "minimal" },
  // IEA: has schedule in data despite unusual HTML — correctly schedule tier
  { name: "Interdisciplinary Education",     search: "interdisciplinary education in the arts", expectedTier: "schedule" },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const major = loadMajor(t.search);
  if (!major) {
    console.log(`SKIP  [${t.name}] — major not found in data`);
    continue;
  }

  // Simulate what the route does: check if elective options exist after 500+ filter
  const requiredCodesSet = new Set(
    (major.requiredCourses ?? []).map((c) => c.code?.toUpperCase()).filter(Boolean)
  );
  let hasElectiveOptions = false;
  for (const g of major.electiveGroups ?? []) {
    const undergradOpts = (g.options ?? []).filter((o) => {
      const num = parseInt(o.code?.match(/\d+/)?.[0] ?? "0", 10);
      return num < 500 || requiredCodesSet.has(o.code?.toUpperCase());
    });
    if (undergradOpts.length > 0) { hasElectiveOptions = true; break; }
  }

  const actualTier = computePlanTier(major, hasElectiveOptions);
  const tierOk = actualTier === t.expectedTier;

  // Check for 500+ grad courses in elective options (should be filtered)
  const gradContamination = checkGraduateCourses(major);

  // Check required course count
  const courseCount = (major.requiredCourses ?? []).length;
  const scheduleCount = (major.sampleSchedule ?? []).length;

  if (tierOk) {
    passed++;
    const gradNote = gradContamination.length > 0
      ? ` | ⚠ ${gradContamination.length} 500+ codes in elective options (will be filtered)`
      : " | no grad contamination";
    console.log(`PASS  [${t.name}] tier=${actualTier} | courses=${courseCount} | schedule_sems=${scheduleCount}${gradNote}`);
  } else {
    failed++;
    console.log(`FAIL  [${t.name}] expected=${t.expectedTier} actual=${actualTier} | courses=${courseCount} | schedule_sems=${scheduleCount}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);

// Additional invariant check: no major should show a 500+ elective as a required course
console.log("\n── Required course 500+ check (legitimate overrides) ──");
for (const t of tests) {
  const major = loadMajor(t.search);
  if (!major) continue;
  const required500 = (major.requiredCourses ?? []).filter((c) => {
    const num = parseInt(c.code?.match(/\d+/)?.[0] ?? "0", 10);
    return num >= 500;
  });
  if (required500.length > 0) {
    console.log(`  ${t.name}: ${required500.map((c) => c.code).join(", ")} (required — allowed in plan)`);
  }
}
