export const dynamic = "force-dynamic";
export const revalidate = 0;
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { findSlugForUicName } from "@/app/lib/name";
import CourseHeader from "../../../components/course/CourseHeader";
import GradeDistributionCard from "../../../components/course/GradeDistributionCard";
import CourseInsightCards from "../../../components/course/CourseInsightCards";
import CourseGpaByProfessor from "../../../components/course/CourseGpaByProfessor";
import SyllabusSubmissionCard from "../../../components/course/SyllabusSubmissionCard";
import SiteFooter from "@/app/components/SiteFooter";

function decodeParam(value: string) {
  return decodeURIComponent(value || "").trim();
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ subject: string; number: string }>;
}) {
  const rawParams = await params;
  const subject = decodeParam(rawParams.subject).toUpperCase();
  const number = decodeParam(rawParams.number).toUpperCase();

  const course = await prisma.course.findUnique({
    where: { subject_number: { subject, number } },
    select: {
      id: true, subject: true, number: true, title: true,
      deptCode: true, deptName: true, avgGpa: true,
      difficultyScore: true, totalRegsAllTime: true,
      isGenEd: true, genEdCategory: true,
    },
  });

  if (!course) notFound();

  const recentTerms = await prisma.term.findMany({
    where: {
      code: { in: ["2024SP","2024SU","2024FA","2025SP","2025SU","2025FA","2026SP"] },
    },
    select: { id: true },
  });
  const recentTermIds = recentTerms.map((t) => t.id);

  const [totals, instructorGroups, allProfessors] = await Promise.all([
    prisma.courseTermStats.aggregate({
      where: { courseId: course.id },
      _sum: {
        gradeRegs: true, a: true, b: true, c: true, d: true,
        f: true, w: true, adv: true, cr: true, dfr: true,
        i: true, ng: true, nr: true, o: true, pr: true, s: true, u: true,
      },
    }),
    prisma.courseInstructorTermStats.groupBy({
      by: ["instructorName"],
      where: { courseId: course.id, termId: { in: recentTermIds } },
      _sum: { gradeRegs: true, a: true, b: true, c: true, d: true, f: true, w: true },
      orderBy: { _sum: { gradeRegs: "desc" } },
    }),
    prisma.professor.findMany({ select: { name: true, slug: true } }),
  ]);

  const sum = totals._sum;
  const a = sum.a ?? 0, b = sum.b ?? 0, c = sum.c ?? 0, d = sum.d ?? 0;
  const f = sum.f ?? 0, w = sum.w ?? 0;
  const adv = sum.adv ?? 0, cr = sum.cr ?? 0, dfr = sum.dfr ?? 0;
  const i = sum.i ?? 0, ng = sum.ng ?? 0, nr = sum.nr ?? 0;
  const o = sum.o ?? 0, pr = sum.pr ?? 0, s = sum.s ?? 0, u = sum.u ?? 0;

  const other = adv + cr + dfr + i + ng + nr + o + pr + s + u;
  const totalRegs = sum.gradeRegs ?? 0;
  const visualTotal = a + b + c + d + f + w;
  const passRate = visualTotal > 0 ? ((a + b + c + d) / visualTotal) * 100 : 0;
  const withdrawalRate = visualTotal > 0 ? (w / visualTotal) * 100 : 0;

  const gradeMap = [
    { label: "A", value: a }, { label: "B", value: b }, { label: "C", value: c },
    { label: "D", value: d }, { label: "F", value: f }, { label: "W", value: w },
  ];
  const mostCommonGrade = gradeMap.reduce(
    (best, cur) => (cur.value > best.value ? cur : best), gradeMap[0]
  )?.label ?? "N/A";

  const professorGpas = instructorGroups
    .map((row) => {
      const pa = row._sum.a ?? 0, pb = row._sum.b ?? 0, pc = row._sum.c ?? 0;
      const pd = row._sum.d ?? 0, pf = row._sum.f ?? 0, pw = row._sum.w ?? 0;
      const pTotalRegs = row._sum.gradeRegs ?? 0;
      const gradedCount = pa + pb + pc + pd + pf;
      const avgGpa = gradedCount > 0
        ? (4 * pa + 3 * pb + 2 * pc + 1 * pd) / gradedCount
        : null;

      return {
        instructorName: row.instructorName,
        slug: findSlugForUicName(row.instructorName, allProfessors),
        avgGpa,
        gradedCount,
        totalRegs: pTotalRegs,
        a: pa, b: pb, c: pc, d: pd, f: pf, w: pw,
      };
    })
    .filter((row) => row.gradedCount >= 20)
    .sort((x, y) => {
      const gpaDiff = (y.avgGpa ?? -1) - (x.avgGpa ?? -1);
      return gpaDiff !== 0 ? gpaDiff : y.gradedCount - x.gradedCount;
    });

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-10">
  <CourseHeader course={course} />

        <div className="mt-6">
          <GradeDistributionCard
            avgGpa={course.avgGpa}
            distribution={[
              { label: "A", value: a, color: "#10b981" },
              { label: "B", value: b, color: "#22c55e" },
              { label: "C", value: c, color: "#eab308" },
              { label: "D", value: d, color: "#f97316" },
              { label: "F", value: f, color: "#ef4444" },
              { label: "W", value: w, color: "#94a3b8" },
            ]}
            visualTotal={visualTotal}
            totalRegs={totalRegs}
            other={other}
          />
        </div>

        <div className="mt-6">
          <CourseInsightCards
            avgGpa={course.avgGpa}
            difficultyScore={course.difficultyScore}
            totalRegs={totalRegs}
            visualTotal={visualTotal}
            passRate={passRate}
            withdrawalRate={withdrawalRate}
            mostCommonGrade={mostCommonGrade}
          />
        </div>

        <div className="mt-6">
          <SyllabusSubmissionCard
            courseCode={`${course.subject} ${course.number}`}
            courseTitle={course.title}
            department={course.deptName || course.deptCode}
          />
        </div>

        <div className="mt-6">
          <CourseGpaByProfessor
            professors={professorGpas}
            courseLabel={`${course.subject} ${course.number}`}
          />
        </div>

      </div>

      <SiteFooter className="mt-12" />
    </main>
  );
}
