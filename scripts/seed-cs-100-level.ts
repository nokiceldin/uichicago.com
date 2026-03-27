/**
 * Sparky — Seed: CS 100-Level Courses
 *
 * Seeds Course, CourseMetaV2, and PrerequisiteGroup/Edge rows for all
 * CS 100-level courses from the official UIC catalog.
 *
 * Also creates placeholder rows for external prereq courses (MATH 180, MCS 160)
 * so foreign keys are valid. These are not part of the CS degree program.
 *
 * Prerequisite encoding:
 *   AND  → separate PrerequisiteGroup rows on the same courseId
 *   OR   → multiple PrerequisiteEdge rows in the same PrerequisiteGroup
 *
 * Run AFTER `prisma migrate dev`:
 *   npx ts-node --project tsconfig.json scripts/seed-cs-100-level.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Course definitions ────────────────────────────────────────────────────────

const COURSES = [
  // External prereqs (not CS, needed so FK constraints hold)
  {
    subject: "MATH", number: "180", title: "Calculus I",
    creditHours: 5, description: null,
    offeredFall: true, offeredSpring: true, offeredSummer: true,
  },
  {
    subject: "MCS", number: "160", title: "Introduction to Mathematical Computer Science",
    creditHours: 3, description: null,
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },

  // CS 100-level
  {
    subject: "CS", number: "100", title: "Discovering Computer Science",
    creditHours: 3,
    description: "Fundamentals of computing; history of computation; computer organization; program design, testing and debugging; web design; computer animation; software tools; societal and legal issues in computing.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "107", title: "Introduction to Computing and Programming",
    creditHours: 4,
    description: "Access and use of computing resources. Programming and program design. Problem solving. Data types, control structures, modularity, and information hiding.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "109", title: "Programming for Engineers with MatLab",
    creditHours: 3,
    description: "Program design and problem solving using MATLAB. Numeric computation, data types and operators, control structures, functions, file I/O, arrays and structures.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "111", title: "Program Design I",
    creditHours: 3,
    description: "Introduction to programming: control structures; variables and data types; problem decomposition and procedural programming; input and output; aggregate data structures including arrays.",
    offeredFall: true, offeredSpring: true, offeredSummer: true,
  },
  {
    subject: "CS", number: "112", title: "Program Design I in the Context of Biological Problems",
    creditHours: 3,
    description: "Introduction to programming using Biology as the context; control structures, variables, simple and aggregate data types; problem-solving techniques; biology topics include central dogma and genetics.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "113", title: "Program Design I in the Context of Law and Public Policy",
    creditHours: 3,
    description: "Introduction to programming using law and public policy as the context; control structures, variables, simple and aggregate data types; legal topics: security, privacy, encryption, and predictive policing.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "141", title: "Program Design II",
    creditHours: 3,
    description: "Data abstraction and modular design; recursion; lists and stacks; dynamic memory allocation; file manipulation; programming exercises.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "151", title: "Mathematical Foundations of Computing",
    creditHours: 3,
    description: "Discrete mathematics concepts fundamental to computing: propositional logic, predicates and quantifiers; proofs; sets; recursive definitions and induction; functions, relations and graphs; combinatorics and discrete probability.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
  {
    subject: "CS", number: "194", title: "Special Topics in Computer Science",
    creditHours: 3,
    description: "Multidisciplinary computer science topics at first-year level that vary from term to term depending on current student and instructor interests.",
    offeredFall: true, offeredSpring: true, offeredSummer: false,
  },
];

// ── Prerequisite definitions ──────────────────────────────────────────────────
//
// Each entry: { forCode, groups: [ [OR options...], [OR options...] ] }
// Outer array = AND groups. Inner array = OR options within each group.
//
// "concurrent registration counts" is represented the same way as a completed
// prereq — the planner treats concurrent as satisfied for scheduling purposes.

const PREREQUISITES: Array<{
  forCode: string;
  groups: string[][];  // groups[i] = OR options for AND-group i
}> = [
  {
    // CS 107: requires MATH 180 (credit or concurrent)
    forCode: "CS 107",
    groups: [["MATH 180"]],
  },
  {
    // CS 109: requires MATH 180 (credit or concurrent)
    forCode: "CS 109",
    groups: [["MATH 180"]],
  },
  {
    // CS 141: requires (CS 111 OR CS 112 OR CS 113 OR CS 107 OR CS 109, grade C+)
    //                  AND (MATH 180, credit or concurrent)
    forCode: "CS 141",
    groups: [
      ["CS 111", "CS 112", "CS 113", "CS 107", "CS 109"],
      ["MATH 180"],
    ],
  },
  {
    // CS 151: requires (CS 111 OR CS 112 OR CS 113 OR CS 107 OR CS 109 OR MCS 160)
    //                  AND (MATH 180, credit or concurrent)
    //   Note: "placement test" option cannot be represented as a course edge — omitted.
    forCode: "CS 151",
    groups: [
      ["CS 111", "CS 112", "CS 113", "CS 107", "CS 109", "MCS 160"],
      ["MATH 180"],
    ],
  },
  // CS 100, CS 111, CS 112, CS 113, CS 194: no prerequisites
];

// ── Seed logic ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding CS 100-level courses...");

  // 1. Upsert all courses + meta
  const courseMap = new Map<string, string>(); // code → DB id

  for (const c of COURSES) {
    const code = `${c.subject} ${c.number}`;
    const row = await prisma.course.upsert({
      where: { subject_number: { subject: c.subject, number: c.number } },
      create: { subject: c.subject, number: c.number, code, title: c.title },
      update: { code, title: c.title },
    });

    await prisma.courseMetaV2.upsert({
      where: { courseId: row.id },
      create: {
        courseId: row.id,
        creditHours: c.creditHours,
        description: c.description,
        offeredFall: c.offeredFall,
        offeredSpring: c.offeredSpring,
        offeredSummer: c.offeredSummer,
      },
      update: {
        creditHours: c.creditHours,
        description: c.description,
        offeredFall: c.offeredFall,
        offeredSpring: c.offeredSpring,
        offeredSummer: c.offeredSummer,
      },
    });

    courseMap.set(code, row.id);
    console.log(`  Upserted ${code} — ${c.title}`);
  }

  // 2. Upsert prerequisites
  for (const { forCode, groups } of PREREQUISITES) {
    const targetId = courseMap.get(forCode);
    if (!targetId) {
      console.warn(`  WARN: course not found for prereq target "${forCode}" — skipped`);
      continue;
    }

    // Clear existing prereq groups for this course (idempotent)
    await prisma.prerequisiteGroup.deleteMany({ where: { courseId: targetId } });

    for (const orOptions of groups) {
      const validOptions = orOptions.filter((code) => {
        if (!courseMap.has(code)) {
          console.warn(`  WARN: prereq course "${code}" not seeded — edge skipped`);
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
    }

    console.log(`  Prerequisites seeded for ${forCode} (${groups.length} AND-group(s))`);
  }

  console.log("\nDone. CS 100-level courses seeded.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
