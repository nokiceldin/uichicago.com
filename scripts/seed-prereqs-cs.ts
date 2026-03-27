/**
 * Sparky — Seed: CS Prerequisite Graph
 *
 * Seeds Course, CourseMetaV2, PrerequisiteGroup, and PrerequisiteEdge rows for
 * the full UIC CS curriculum (100-level through 400-level). Covers all courses
 * a CS-BS student needs for the planner and for prereq-check answers.
 *
 * Prerequisite encoding (mirrors the DB schema):
 *   AND → separate PrerequisiteGroup rows on the same courseId
 *   OR  → multiple PrerequisiteEdge rows inside one PrerequisiteGroup
 *
 * "Concurrent registration" is treated the same as a completed prereq in this
 * model — the planner schedules the concurrent course one semester earlier,
 * which is accurate enough for planning purposes.
 *
 * Sources:
 *   - 100–300 level: verified from catalog-scraped.json
 *   - 400-level: official UIC CS-BS curriculum (catalog.uic.edu)
 *
 * Run AFTER `prisma migrate dev` and seed-course-meta-v2.ts:
 *   npx ts-node --project tsconfig.json scripts/seed-prereqs-cs.ts
 *
 * Safe to re-run — all operations use upsert. Prereq groups for each course
 * are wiped and rebuilt on each run to stay idempotent.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── Course definitions ────────────────────────────────────────────────────────
// description: null here because seed-course-meta-v2.ts populates it from the
// catalog JSON. CourseMetaV2 upserts below only set creditHours and offered
// semesters — the description upsert from that script wins on conflict.

interface CourseDef {
  subject: string;
  number: string;
  title: string;
  creditHours: number | null;
  offeredFall: boolean;
  offeredSpring: boolean;
  offeredSummer: boolean;
}

const COURSES: CourseDef[] = [
  // ── External prerequisites ─────────────────────────────────────────────────
  // These are not CS courses but appear as prereqs. Upserted as placeholders
  // so FK constraints hold. Description/meta will be filled by seed-course-meta-v2.
  { subject: "MATH", number: "180", title: "Calculus I",                                     creditHours: 5, offeredFall: true,  offeredSpring: true,  offeredSummer: true  },
  { subject: "MATH", number: "181", title: "Calculus II",                                    creditHours: 5, offeredFall: true,  offeredSpring: true,  offeredSummer: true  },
  { subject: "MATH", number: "210", title: "Calculus III",                                   creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: true  },
  { subject: "MCS",  number: "160", title: "Introduction to Mathematical Computer Science",   creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "ECE",  number: "266", title: "Introduction to Logic Design",                   creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },

  // ── CS 100-level ────────────────────────────────────────────────────────────
  { subject: "CS", number: "100", title: "Discovering Computer Science",                     creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "107", title: "Introduction to Computing and Programming",        creditHours: 4, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "109", title: "Programming for Engineers with MatLab",            creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "111", title: "Program Design I",                                 creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: true  },
  { subject: "CS", number: "112", title: "Program Design I in the Context of Biological Problems",    creditHours: 3, offeredFall: true, offeredSpring: true, offeredSummer: false },
  { subject: "CS", number: "113", title: "Program Design I in the Context of Law and Public Policy",  creditHours: 3, offeredFall: true, offeredSpring: true, offeredSummer: false },
  { subject: "CS", number: "141", title: "Program Design II",                                creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "151", title: "Mathematical Foundations of Computing",            creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "194", title: "Special Topics in Computer Science",               creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },

  // ── CS 200-level ────────────────────────────────────────────────────────────
  { subject: "CS", number: "211", title: "Programming Practicum",                            creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "251", title: "Data Structures",                                  creditHours: 4, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "261", title: "Machine Organization",                             creditHours: 4, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "277", title: "Technical and Professional Communication in CS",   creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },

  // ── CS 300-level ────────────────────────────────────────────────────────────
  { subject: "CS", number: "301", title: "Languages and Automata",                           creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "341", title: "Programming Language Design and Implementation",   creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "342", title: "Software Design",                                  creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "351", title: "Advanced Data Structure Practicum",                creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "361", title: "Systems Programming",                              creditHours: 4, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "362", title: "Computer Design",                                  creditHours: 4, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "377", title: "Ethical Issues in Computing",                      creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "378", title: "Framework-based Software Development for Hand-held Devices", creditHours: 3, offeredFall: true, offeredSpring: true, offeredSummer: false },

  // ── CS 400-level ────────────────────────────────────────────────────────────
  { subject: "CS", number: "401", title: "Theory of Computation",                            creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "411", title: "Database Systems",                                 creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "412", title: "Introduction to Machine Learning",                 creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "415", title: "Compiler Design",                                  creditHours: 3, offeredFall: true,  offeredSpring: false, offeredSummer: false },
  { subject: "CS", number: "418", title: "Introduction to Computer Graphics",                creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "421", title: "Software Engineering",                             creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "422", title: "User Interface Design and Programming",            creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "424", title: "Real-Time Systems and Internet of Things",         creditHours: 3, offeredFall: true,  offeredSpring: false, offeredSummer: false },
  { subject: "CS", number: "425", title: "Distributed Systems",                              creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "440", title: "Artificial Intelligence",                          creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "441", title: "Applied Machine Learning",                         creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "450", title: "Introduction to Networking",                       creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "461", title: "Operating Systems",                                creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "466", title: "Introduction to Bioinformatics",                   creditHours: 3, offeredFall: true,  offeredSpring: false, offeredSummer: false },
  { subject: "CS", number: "474", title: "Image and Video Computing",                        creditHours: 3, offeredFall: false, offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "476", title: "Program Verification",                             creditHours: 3, offeredFall: false, offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "484", title: "Parallel Programming",                             creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "491", title: "Senior Project",                                   creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "494", title: "Special Topics in CS",                             creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "495", title: "Undergraduate Research",                           creditHours: 3, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
  { subject: "CS", number: "499", title: "Professional Development Seminar",                 creditHours: 0, offeredFall: true,  offeredSpring: true,  offeredSummer: false },
];

// ── Prerequisite definitions ──────────────────────────────────────────────────
//
// groups: outer array = AND (all groups must be satisfied)
//         inner array = OR (any one option satisfies the group)
//
// Sources verified from catalog-scraped.json (100–300 level) and
// official UIC CS-BS requirements (400-level).

interface PrereqDef {
  forCode: string;
  groups: string[][];
}

const PREREQUISITES: PrereqDef[] = [

  // ── 100-level ────────────────────────────────────────────────────────────
  {
    forCode: "CS 107",
    groups: [["MATH 180"]],
  },
  {
    forCode: "CS 109",
    groups: [["MATH 180"]],
  },
  {
    // CS 141: (CS 111 OR 112 OR 113 OR 107 OR 109) AND MATH 180
    forCode: "CS 141",
    groups: [
      ["CS 111", "CS 112", "CS 113", "CS 107", "CS 109"],
      ["MATH 180"],
    ],
  },
  {
    // CS 151: (CS 111 OR 112 OR 113 OR 107 OR 109 OR MCS 160) AND MATH 180
    forCode: "CS 151",
    groups: [
      ["CS 111", "CS 112", "CS 113", "CS 107", "CS 109", "MCS 160"],
      ["MATH 180"],
    ],
  },

  // ── 200-level ────────────────────────────────────────────────────────────
  {
    // CS 211: CS 141 (grade C or better)
    forCode: "CS 211",
    groups: [["CS 141"]],
  },
  {
    // CS 251: (CS 141 OR CS 107) AND CS 151 AND CS 211 (concurrent OK)
    // Modeling CS 107 as alternate for CS 141 (CE major path) — include both.
    forCode: "CS 251",
    groups: [
      ["CS 141", "CS 107"],
      ["CS 151"],
      ["CS 211"],
    ],
  },
  {
    // CS 261: CS 141 AND CS 211 (concurrent OK)
    forCode: "CS 261",
    groups: [
      ["CS 141"],
      ["CS 211"],
    ],
  },
  {
    // CS 277: CS 141
    forCode: "CS 277",
    groups: [["CS 141"]],
  },

  // ── 300-level ────────────────────────────────────────────────────────────
  {
    // CS 301: CS 151 (grade C+) AND CS 251 (concurrent OK)
    forCode: "CS 301",
    groups: [
      ["CS 151"],
      ["CS 251"],
    ],
  },
  {
    // CS 341: CS 211 AND CS 251
    forCode: "CS 341",
    groups: [
      ["CS 211"],
      ["CS 251"],
    ],
  },
  {
    // CS 342: CS 251 AND CS 211
    forCode: "CS 342",
    groups: [
      ["CS 251"],
      ["CS 211"],
    ],
  },
  {
    // CS 351: CS 251 AND CS 211
    forCode: "CS 351",
    groups: [
      ["CS 251"],
      ["CS 211"],
    ],
  },
  {
    // CS 361: CS 251 AND CS 211 AND CS 261
    forCode: "CS 361",
    groups: [
      ["CS 251"],
      ["CS 211"],
      ["CS 261"],
    ],
  },
  {
    // CS 362: CS 211 AND CS 261
    forCode: "CS 362",
    groups: [
      ["CS 211"],
      ["CS 261"],
    ],
  },
  {
    // CS 377: CS 251 (concurrent OK)
    forCode: "CS 377",
    groups: [["CS 251"]],
  },
  {
    // CS 378: CS 342
    forCode: "CS 378",
    groups: [["CS 342"]],
  },

  // ── 400-level ────────────────────────────────────────────────────────────
  {
    // CS 401: CS 251 AND CS 301
    forCode: "CS 401",
    groups: [
      ["CS 251"],
      ["CS 301"],
    ],
  },
  {
    // CS 411: CS 251
    forCode: "CS 411",
    groups: [["CS 251"]],
  },
  {
    // CS 412: CS 251
    forCode: "CS 412",
    groups: [["CS 251"]],
  },
  {
    // CS 415: CS 361 (compiler design requires systems knowledge)
    forCode: "CS 415",
    groups: [["CS 361"]],
  },
  {
    // CS 418: CS 251 AND CS 211
    forCode: "CS 418",
    groups: [
      ["CS 251"],
      ["CS 211"],
    ],
  },
  {
    // CS 421: CS 301 AND CS 361
    forCode: "CS 421",
    groups: [
      ["CS 301"],
      ["CS 361"],
    ],
  },
  {
    // CS 422: CS 251
    forCode: "CS 422",
    groups: [["CS 251"]],
  },
  {
    // CS 424: CS 361
    forCode: "CS 424",
    groups: [["CS 361"]],
  },
  {
    // CS 425: CS 361
    forCode: "CS 425",
    groups: [["CS 361"]],
  },
  {
    // CS 440: CS 251
    forCode: "CS 440",
    groups: [["CS 251"]],
  },
  {
    // CS 441: CS 251 AND CS 411
    forCode: "CS 441",
    groups: [
      ["CS 251"],
      ["CS 411"],
    ],
  },
  {
    // CS 450: CS 251
    forCode: "CS 450",
    groups: [["CS 251"]],
  },
  {
    // CS 461: CS 361
    forCode: "CS 461",
    groups: [["CS 361"]],
  },
  {
    // CS 466: CS 251 AND CS 301
    forCode: "CS 466",
    groups: [
      ["CS 251"],
      ["CS 301"],
    ],
  },
  {
    // CS 474: CS 251 AND CS 211
    forCode: "CS 474",
    groups: [
      ["CS 251"],
      ["CS 211"],
    ],
  },
  {
    // CS 476: CS 301 AND CS 361
    forCode: "CS 476",
    groups: [
      ["CS 301"],
      ["CS 361"],
    ],
  },
  {
    // CS 484: CS 251
    forCode: "CS 484",
    groups: [["CS 251"]],
  },
  {
    // CS 491: CS 361
    forCode: "CS 491",
    groups: [["CS 361"]],
  },
];

// ── Seed logic ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding CS prerequisite graph...\n");

  // 1. Upsert all courses and their CourseMetaV2 rows.
  const courseMap = new Map<string, string>(); // "CS 251" → DB id

  console.log("Step 1: Upserting courses + meta...");
  for (const c of COURSES) {
    const code = `${c.subject} ${c.number}`;
    const row = await prisma.course.upsert({
      where:  { subject_number: { subject: c.subject, number: c.number } },
      create: { subject: c.subject, number: c.number, code, title: c.title },
      update: { code, title: c.title },
    });

    // Only set meta fields that aren't coming from the catalog seed —
    // description is deliberately omitted here so the catalog seed wins.
    await prisma.courseMetaV2.upsert({
      where:  { courseId: row.id },
      create: {
        courseId:      row.id,
        creditHours:   c.creditHours,
        offeredFall:   c.offeredFall,
        offeredSpring: c.offeredSpring,
        offeredSummer: c.offeredSummer,
      },
      update: {
        creditHours:   c.creditHours,
        offeredFall:   c.offeredFall,
        offeredSpring: c.offeredSpring,
        offeredSummer: c.offeredSummer,
      },
    });

    courseMap.set(code, row.id);
  }
  console.log(`  ${COURSES.length} courses upserted.`);

  // 2. Seed prerequisite groups. Each course's groups are wiped first so
  //    re-runs don't accumulate duplicate groups.
  console.log("\nStep 2: Seeding prerequisite groups...");

  let groupsCreated = 0;
  let edgesCreated  = 0;

  for (const { forCode, groups } of PREREQUISITES) {
    const targetId = courseMap.get(forCode);
    if (!targetId) {
      console.warn(`  WARN: "${forCode}" not in courseMap — skipped`);
      continue;
    }

    // Wipe existing groups for idempotency.
    await prisma.prerequisiteGroup.deleteMany({ where: { courseId: targetId } });

    for (const orOptions of groups) {
      const validOptions = orOptions.filter((code) => {
        if (!courseMap.has(code)) {
          console.warn(`  WARN: prereq "${code}" not seeded — edge skipped`);
          return false;
        }
        return true;
      });

      if (validOptions.length === 0) continue;

      await prisma.prerequisiteGroup.create({
        data: {
          courseId: targetId,
          edges: {
            create: validOptions.map((code) => ({
              prereqCourseId: courseMap.get(code)!,
            })),
          },
        },
      });

      groupsCreated++;
      edgesCreated += validOptions.length;
    }

    console.log(`  ${forCode}: ${groups.length} AND-group(s) seeded`);
  }

  console.log(`\nDone.`);
  console.log(`  Courses upserted:       ${COURSES.length}`);
  console.log(`  Prerequisite groups:    ${groupsCreated}`);
  console.log(`  Prerequisite edges:     ${edgesCreated}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
