import prisma from "@/lib/prisma";
import {
  findProfessorDirectoryEntryForUicName,
  getProfessorDirectory,
} from "@/lib/professors/directory";

export const COURSE_INSTRUCTOR_TERM_CODES = [
  "2024SP",
  "2024SU",
  "2024FA",
  "2025SP",
  "2025SU",
  "2025FA",
  "2026SP",
] as const;

export const MIN_COURSE_INSTRUCTOR_GRADED_OUTCOMES = 20;

export type CourseInstructorStats = {
  instructorName: string;
  slug: string | null;
  avgGpa: number;
  quality: number | null;
  difficulty: number | null;
  ratingsCount: number | null;
  wouldTakeAgain: number | null;
  aiSummary: string | null;
  gradedCount: number;
  totalRegs: number;
  aRate: number;
  wRate: number;
  a: number;
  b: number;
  c: number;
  d: number;
  f: number;
  w: number;
};

/**
 * Canonical instructor comparison data used by course pages and Sparky.
 * Keeping the term window, sample threshold, name matching, and calculations
 * here prevents the two product surfaces from presenting different facts.
 */
export async function getCourseInstructorStats(courseId: string): Promise<CourseInstructorStats[]> {
  const [termRows, directory] = await Promise.all([
    prisma.term.findMany({
      where: { code: { in: [...COURSE_INSTRUCTOR_TERM_CODES] } },
      select: { id: true },
    }),
    getProfessorDirectory(),
  ]);

  const rows = await prisma.courseInstructorTermStats.groupBy({
    by: ["instructorName"],
    where: {
      courseId,
      termId: { in: termRows.map((term) => term.id) },
    },
    _sum: { gradeRegs: true, a: true, b: true, c: true, d: true, f: true, w: true },
    orderBy: { _sum: { gradeRegs: "desc" } },
  });

  return rows
    .map((row) => {
      const a = row._sum.a ?? 0;
      const b = row._sum.b ?? 0;
      const c = row._sum.c ?? 0;
      const d = row._sum.d ?? 0;
      const f = row._sum.f ?? 0;
      const w = row._sum.w ?? 0;
      const totalRegs = row._sum.gradeRegs ?? 0;
      const gradedCount = a + b + c + d + f;
      if (gradedCount < MIN_COURSE_INSTRUCTOR_GRADED_OUTCOMES) return null;

      const directoryEntry = findProfessorDirectoryEntryForUicName(row.instructorName, directory);
      const avgGpa = (4 * a + 3 * b + 2 * c + d) / gradedCount;

      return {
        instructorName: row.instructorName,
        slug: directoryEntry?.slug ?? null,
        avgGpa,
        quality: directoryEntry?.isRated ? directoryEntry.quality : null,
        difficulty: directoryEntry?.isRated ? directoryEntry.difficulty : null,
        ratingsCount: directoryEntry?.isRated ? directoryEntry.ratingsCount : null,
        wouldTakeAgain: directoryEntry?.isRated ? directoryEntry.wouldTakeAgain : null,
        aiSummary: directoryEntry?.isRated ? directoryEntry.aiSummary || null : null,
        gradedCount,
        totalRegs,
        aRate: (a / gradedCount) * 100,
        wRate: totalRegs > 0 ? (w / totalRegs) * 100 : 0,
        a,
        b,
        c,
        d,
        f,
        w,
      } satisfies CourseInstructorStats;
    })
    .filter((row): row is CourseInstructorStats => row !== null)
    .sort((left, right) => right.avgGpa - left.avgGpa || right.gradedCount - left.gradedCount);
}
