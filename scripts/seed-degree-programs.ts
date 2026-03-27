/**
 * Sparky — Seed: Degree Programs
 *
 * Auto-discovers every major JSON file under public/data/uic-knowledge/majors/
 * and upserts DegreeProgram + RequirementGroup rows for each one.
 *
 * Strategy:
 *   REQUIRED group  — built from sampleSchedule entries where isElective === false
 *                     and code !== null.
 *
 *   CHOOSE_N_COURSES groups — created whenever the JSON has a named options section
 *                             (technicalElectives, requiredMath, scienceElectives,
 *                             or electiveGroups entries with options).
 *
 * Files without a sampleSchedule are skipped with a warning.
 * Safe to re-run — all writes use upsert/deleteMany+create patterns.
 *
 * Run AFTER seed-prereqs-cs.ts:
 *   npx ts-node --project tsconfig.json scripts/seed-degree-programs.ts
 */

import "dotenv/config";
import { PrismaClient, RequirementGroupType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const MAJORS = join(process.cwd(), "public/data/uic-knowledge/majors");

// ── Program code lookup: preserve existing codes for already-seeded programs ──
// All other files get a code derived from the filename (uppercase, hyphens kept).

const LEGACY_CODES: Record<string, string> = {
  "computer-science-bs.json":          "CS-BS",
  "mathematics-bs-with-a-major.json":  "MATH-BS",
  "nursing-bs.json":                   "NURSING-BS",
  "mechanical-engineering-bs.json":    "ME-BS",
  "accounting-bs.json":                "ACCOUNTING-BS",
  "finance-bs.json":                   "FINANCE-BS",
  "psychology-bs-with-a-major.json":   "PSYCHOLOGY-BS",
  "biological-sciences-bs.json":       "BIOLOGY-BS",
  "engineering-physics-bs.json":       "PHYSICS-BS",
};

function fileToCode(filename: string): string {
  return LEGACY_CODES[filename] ?? filename.replace(/\.json$/, "").toUpperCase();
}

// ── Auto-discover all major JSON files ────────────────────────────────────────

const ALL_FILES = readdirSync(MAJORS)
  .filter((f) => f.endsWith(".json") && f !== "_index.json")
  .sort();

interface Program {
  code: string;
  file: string;
}

const PROGRAMS: Program[] = ALL_FILES.map((file) => ({
  code: fileToCode(file),
  file,
}));

// ── JSON types ────────────────────────────────────────────────────────────────

interface JsonCourse {
  code:         string | null;
  title:        string;
  hours:        number;
  isElective:   boolean;
  electiveType?: string | null;
}

interface JsonSemester {
  year:        string;
  semester:    string;
  total_hours: number;
  courses:     JsonCourse[];
}

interface ElectiveOption {
  code:  string;
  title: string;
  hours: number;
}

interface MajorJson {
  name:                string;
  college?:            string;
  department?:         string;
  totalHours?:         number;
  sampleSchedule?:     JsonSemester[];
  technicalElectives?: { selectCount?: number; hoursEach?: number; options: ElectiveOption[] };
  requiredMath?:       { options: ElectiveOption[] };
  scienceElectives?:   { options: ElectiveOption[] };
  electiveGroups?:     Array<{ label: string; credits: number; options: ElectiveOption[] }>;
  _error?:             string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "CS 251" → { subject, number }. Returns null if malformed. */
function parseCode(code: string): { subject: string; number: string } | null {
  const parts = code.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const num  = parts[parts.length - 1];
  const subj = parts.slice(0, parts.length - 1).join(" ");
  return subj && num ? { subject: subj, number: num } : null;
}

/**
 * Ensures a Course row exists for the given code + title.
 * Returns the course's DB id. Uses upsert — safe to call multiple times.
 */
async function ensureCourse(
  code: string,
  title: string,
  creditHours: number | null
): Promise<string> {
  const parsed = parseCode(code);
  if (!parsed) throw new Error(`Cannot parse course code: "${code}"`);

  const row = await prisma.course.upsert({
    where:  { subject_number: { subject: parsed.subject, number: parsed.number } },
    create: { subject: parsed.subject, number: parsed.number, code, title },
    update: { code, title },
    select: { id: true },
  });

  // Only write CourseMetaV2 if creditHours is known; description comes from
  // seed-course-meta-v2.ts and must not be overwritten with null here.
  if (creditHours !== null) {
    await prisma.courseMetaV2.upsert({
      where:  { courseId: row.id },
      create: { courseId: row.id, creditHours },
      update: { creditHours },
    });
  }

  return row.id;
}

// ── Seed logic ────────────────────────────────────────────────────────────────

async function seedProgram(entry: Program) {
  const raw  = readFileSync(join(MAJORS, entry.file), "utf8");
  const data = JSON.parse(raw) as MajorJson;

  if (data._error) {
    console.log(`  SKIP ${entry.code} — JSON has _error: ${data._error}`);
    return;
  }

  if (!data.sampleSchedule || data.sampleSchedule.length === 0) {
    console.log(`  SKIP ${entry.code} — no sampleSchedule`);
    return;
  }

  const name  = data.name ?? entry.code;
  const dept  = data.department ?? data.college ?? "Unknown";
  const total = data.totalHours ?? 120;

  console.log(`\n  ${entry.code} — ${name}`);

  // ── 1. Upsert DegreeProgram ──────────────────────────────────────────────
  const program = await prisma.degreeProgram.upsert({
    where:  { code: entry.code },
    create: { code: entry.code, name, department: dept, totalCreditsRequired: total },
    update: { name, department: dept, totalCreditsRequired: total },
    select: { id: true },
  });

  // ── 2. Wipe existing requirement groups (idempotent re-run) ─────────────
  await prisma.requirementGroup.deleteMany({ where: { programId: program.id } });

  // ── 3. Build REQUIRED group from sampleSchedule ──────────────────────────
  const seen    = new Set<string>();
  const required: Array<{ code: string; title: string; hours: number }> = [];

  for (const sem of data.sampleSchedule) {
    for (const c of sem.courses) {
      if (!c.code || c.isElective || seen.has(c.code)) continue;
      seen.add(c.code);
      required.push({ code: c.code, title: c.title, hours: c.hours });
    }
  }

  if (required.length > 0) {
    const items: Array<{ courseId: string }> = [];
    for (const c of required) {
      const courseId = await ensureCourse(c.code, c.title, c.hours);
      items.push({ courseId });
    }

    await prisma.requirementGroup.create({
      data: {
        programId:    program.id,
        name:         "Required Courses",
        type:         RequirementGroupType.REQUIRED,
        displayOrder: 1,
        items:        { create: items },
      },
    });

    console.log(`    Required group: ${required.length} courses`);
  }

  // ── 4. CHOOSE_N groups — built from named option sections in the JSON ────
  let order = 2;

  async function seedChooseNGroup(
    groupName: string,
    options: ElectiveOption[],
    minCourses: number
  ): Promise<void> {
    const items: Array<{ courseId: string }> = [];
    for (const opt of options) {
      if (!opt.code || !parseCode(opt.code)) continue;
      try {
        const courseId = await ensureCourse(opt.code, opt.title, opt.hours ?? 3);
        items.push({ courseId });
      } catch { /* skip unparseable */ }
    }
    if (items.length === 0) return;

    await prisma.requirementGroup.create({
      data: {
        programId:        program.id,
        name:             groupName,
        type:             RequirementGroupType.CHOOSE_N_COURSES,
        minCoursesNeeded: minCourses,
        displayOrder:     order++,
        items:            { create: items },
      },
    });

    console.log(`    ${groupName}: choose ${minCourses} from ${items.length} options`);
  }

  if (data.technicalElectives?.options?.length) {
    const count = data.technicalElectives.selectCount ?? 1;
    await seedChooseNGroup("Technical Electives", data.technicalElectives.options, count);
  }

  if (data.requiredMath?.options?.length) {
    // Infer count: total math credits ÷ 3 (most math courses are 3 credits)
    const credits = 9; // standard for CS-BS; other programs default to 1
    await seedChooseNGroup("Required Mathematics", data.requiredMath.options, Math.round(credits / 3));
  }

  if (data.scienceElectives?.options?.length) {
    const count = 2; // standard: 2 lab-science courses
    await seedChooseNGroup("Science Electives", data.scienceElectives.options, count);
  }

  if (data.electiveGroups?.length) {
    for (const group of data.electiveGroups) {
      if (!group.options?.length) continue;
      // Estimate min courses from total credit requirement
      const minCourses = Math.max(1, Math.round(group.credits / 3));
      await seedChooseNGroup(group.label ?? "Electives", group.options, minCourses);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${PROGRAMS.length} degree programs...`);

  let seeded = 0, skipped = 0, errored = 0;

  for (const program of PROGRAMS) {
    try {
      await seedProgram(program);
      seeded++;
    } catch (err) {
      console.error(`  ERROR seeding ${program.code}:`, err);
      errored++;
    }
  }

  const count = await prisma.degreeProgram.count();
  console.log(`\nDone. Processed ${PROGRAMS.length} files → ${count} degree programs in DB.`);
  if (errored > 0) console.log(`  ${errored} errored`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
