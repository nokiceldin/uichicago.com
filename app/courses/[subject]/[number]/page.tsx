export const dynamic = "force-dynamic";
export const revalidate = 0;
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import prisma from "@/lib/prisma";
import { findProfessorDirectorySlugForUicName, getProfessorDirectory } from "@/lib/professors/directory";
import { buildCourseHref, normalizeCourseCode } from "@/lib/chat/entity-linking";
import CourseHeader from "../../../components/course/CourseHeader";
import GradeDistributionCard from "../../../components/course/GradeDistributionCard";
import CourseInsightCards from "../../../components/course/CourseInsightCards";
import CourseGpaByProfessor from "../../../components/course/CourseGpaByProfessor";
import CoursePageNavigator from "@/app/components/loops/CoursePageNavigator";
import ViewHistoryNudge from "@/app/components/loops/ViewHistoryNudge";
import SiteFooter from "@/app/components/SiteFooter";
import SaveCourseControl from "@/app/components/saved/SaveCourseControl";

const COURSE_CODE_REGEX = /\b([A-Z]{2,4})\s+(\d{3}[A-Z]?)\b/g;

function decodeParam(value: string) {
  return decodeURIComponent(value || "").trim();
}

function extractCourseCodesFromText(text: string) {
  return [...new Set(
    [...text.matchAll(COURSE_CODE_REGEX)]
      .map((match) => normalizeCourseCode(`${match[1]} ${match[2]}`))
      .filter(Boolean)
  )];
}

function renderDescriptionWithCourseLinks(text: string, linkableCourseCodes: Set<string>) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(COURSE_CODE_REGEX)) {
    const fullMatch = match[0];
    const normalized = normalizeCourseCode(fullMatch);
    const matchIndex = match.index ?? -1;

    if (!normalized || !linkableCourseCodes.has(normalized) || matchIndex < 0) continue;

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    parts.push(
      <Link
        key={`${normalized}-${matchIndex}`}
        href={buildCourseHref(normalized)}
        className="font-semibold text-emerald-700 underline decoration-emerald-400/60 underline-offset-2 transition hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
      >
        {fullMatch}
      </Link>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex === 0) return text;
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function compareCourseDirectoryOrder(
  a: { difficultyScore: number | null; totalRegsAllTime: number | null; subject: string; number: string; title: string | null },
  b: { difficultyScore: number | null; totalRegsAllTime: number | null; subject: string; number: string; title: string | null },
) {
  const leftDifficulty = a.difficultyScore ?? Number.NEGATIVE_INFINITY;
  const rightDifficulty = b.difficultyScore ?? Number.NEGATIVE_INFINITY;
  if (rightDifficulty !== leftDifficulty) return rightDifficulty - leftDifficulty;

  const leftRegs = a.totalRegsAllTime ?? 0;
  const rightRegs = b.totalRegsAllTime ?? 0;
  if (rightRegs !== leftRegs) return rightRegs - leftRegs;

  const subjectDiff = a.subject.localeCompare(b.subject);
  if (subjectDiff !== 0) return subjectDiff;

  const numberDiff = a.number.localeCompare(b.number, undefined, { numeric: true });
  if (numberDiff !== 0) return numberDiff;

  return (a.title || "").localeCompare(b.title || "");
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
      metaV2: {
        select: {
          creditHours: true,
          description: true,
          offeredFall: true,
          offeredSpring: true,
          offeredSummer: true,
        },
      },
    },
  });

  if (!course) notFound();

  const courseDescription = course.metaV2?.description?.trim() || "No catalog description is available for this course yet.";
  const mentionedCourseCodes = extractCourseCodesFromText(courseDescription);

  const recentTerms = await prisma.term.findMany({
    where: {
      code: { in: ["2024SP","2024SU","2024FA","2025SP","2025SU","2025FA","2026SP"] },
    },
    select: { id: true },
  });
  const recentTermIds = recentTerms.map((t) => t.id);

  const [totals, instructorGroups, relatedCourses, relatedGenEds, linkedDescriptionCourses, courseDirectory] = await Promise.all([
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
    prisma.course.findMany({
      where: {
        subject: course.subject,
        NOT: {
          id: course.id,
        },
      },
      take: 2,
      orderBy: [
        { totalRegsAllTime: "desc" },
        { avgGpa: "desc" },
      ],
      select: {
        id: true,
        subject: true,
        number: true,
        title: true,
        avgGpa: true,
        difficultyScore: true,
        totalRegsAllTime: true,
      },
    }),
    course.isGenEd && course.genEdCategory
      ? prisma.course.findMany({
          where: {
            isGenEd: true,
            genEdCategory: course.genEdCategory,
            NOT: {
              id: course.id,
            },
          },
          take: 3,
          orderBy: [
            { difficultyScore: "desc" },
            { totalRegsAllTime: "desc" },
          ],
          select: {
            id: true,
            subject: true,
            number: true,
            title: true,
            avgGpa: true,
            difficultyScore: true,
            totalRegsAllTime: true,
          },
        })
      : Promise.resolve([]),
    mentionedCourseCodes.length > 0
      ? prisma.course.findMany({
          where: {
            OR: mentionedCourseCodes.map((code) => {
              const [subject, number] = code.split(" ");
              return { subject, number };
            }),
          },
          select: {
            subject: true,
            number: true,
          },
        })
      : Promise.resolve([]),
    prisma.course.findMany({
      select: {
        subject: true,
        number: true,
        title: true,
        difficultyScore: true,
        avgGpa: true,
        totalRegsAllTime: true,
      },
    }),
  ]);
  const linkableDescriptionCourseCodes = new Set(
    linkedDescriptionCourses.map((item) => normalizeCourseCode(`${item.subject} ${item.number}`)).filter(Boolean)
  );

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

  const professorDirectory = await getProfessorDirectory();
  const professorDirectoryBySlug = new Map(
    professorDirectory.map((entry) => [entry.slug, entry] as const)
  );

  const professorGpas = (await Promise.all(
    instructorGroups
      .map(async (row) => {
        const pa = row._sum.a ?? 0, pb = row._sum.b ?? 0, pc = row._sum.c ?? 0;
        const pd = row._sum.d ?? 0, pf = row._sum.f ?? 0, pw = row._sum.w ?? 0;
        const pTotalRegs = row._sum.gradeRegs ?? 0;
        const gradedCount = pa + pb + pc + pd + pf;
        const avgGpa = gradedCount > 0
          ? (4 * pa + 3 * pb + 2 * pc + 1 * pd) / gradedCount
          : null;
        const slug = await findProfessorDirectorySlugForUicName(row.instructorName);
        const directoryEntry = slug ? professorDirectoryBySlug.get(slug) : null;

        return {
          instructorName: row.instructorName,
          slug,
          avgGpa,
          quality: directoryEntry?.isRated ? directoryEntry.quality : null,
          gradedCount,
          totalRegs: pTotalRegs,
          a: pa, b: pb, c: pc, d: pd, f: pf, w: pw,
        };
      })
  ))
    .filter((row) => row.gradedCount >= 20)
    .sort((x, y) => {
      const gpaDiff = (y.avgGpa ?? -1) - (x.avgGpa ?? -1);
      return gpaDiff !== 0 ? gpaDiff : y.gradedCount - x.gradedCount;
    });

  const topProfessor = professorGpas.find((row) => row.slug);
  const sparkyPrompt = encodeURIComponent(
    `I am considering ${course.subject} ${course.number} ${course.title ? `(${course.title}) ` : ""}at UIC. Summarize how hard it is, who should take it, and which professor looks best.`,
  );
  const comparePrompt = `Compare ${[`${course.subject} ${course.number}`, ...relatedCourses.slice(0, 2).map((item) => `${item.subject} ${item.number}`)].join(", ")} for difficulty, GPA, and which kind of UIC student each is best for.`;
  const orderedCourseDirectory = [...courseDirectory].sort(compareCourseDirectoryOrder);
  const currentIndex = orderedCourseDirectory.findIndex(
    (entry) => entry.subject === course.subject && entry.number === course.number
  );
  const previousCourse = currentIndex > 0 ? orderedCourseDirectory[currentIndex - 1] : null;
  const nextCourse = currentIndex >= 0 && currentIndex < orderedCourseDirectory.length - 1
    ? orderedCourseDirectory[currentIndex + 1]
    : null;

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-linear-to-b from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent" />
      <CoursePageNavigator
        currentCode={`${course.subject} ${course.number}`}
        previous={
          previousCourse
            ? {
                href: buildCourseHref(`${previousCourse.subject} ${previousCourse.number}`),
                code: `${previousCourse.subject} ${previousCourse.number}`,
                title: previousCourse.title ?? "Untitled course",
                difficulty: previousCourse.difficultyScore != null ? previousCourse.difficultyScore.toFixed(1) : "N/A",
                gpa: previousCourse.avgGpa != null ? previousCourse.avgGpa.toFixed(2) : "N/A",
              }
            : null
        }
        next={
          nextCourse
            ? {
                href: buildCourseHref(`${nextCourse.subject} ${nextCourse.number}`),
                code: `${nextCourse.subject} ${nextCourse.number}`,
                title: nextCourse.title ?? "Untitled course",
                difficulty: nextCourse.difficultyScore != null ? nextCourse.difficultyScore.toFixed(1) : "N/A",
                gpa: nextCourse.avgGpa != null ? nextCourse.avgGpa.toFixed(2) : "N/A",
              }
            : null
        }
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-10">
  <CourseHeader
    course={course}
    actions={<SaveCourseControl course={{ id: course.id, subject: course.subject, number: course.number, title: course.title ?? "" }} />}
  />

        <ViewHistoryNudge
          kind="course"
          item={{
            key: `${course.subject} ${course.number}`,
            title: course.title || "UIC course",
            href: `/courses/${course.subject}/${course.number}`,
            group: course.subject,
          }}
          comparePrompt={comparePrompt}
        />

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
          <CourseGpaByProfessor
            professors={professorGpas}
            courseLabel={`${course.subject} ${course.number}`}
          />
        </div>

        <div className="mt-6">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/40 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">
                  Keep Exploring
                </div>
                <h2 className="mt-2 text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">
                  Keep exploring
                </h2>
              </div>
              <p className="max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
                Compare a professor, browse nearby courses, or ask Sparky.
              </p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/8 dark:bg-white/4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                  Best professor lead
                </div>
                {topProfessor ? (
                  <>
                    <div className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">
                      {topProfessor.instructorName}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      Top GPA signal with {new Intl.NumberFormat("en-US").format(topProfessor.gradedCount)} grades.
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                        Avg GPA {topProfessor.avgGpa?.toFixed(2) ?? "N/A"}
                      </span>
                      <Link
                        href={`/professors/${topProfessor.slug}`}
                        className="text-sm font-semibold text-zinc-900 transition hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-300"
                      >
                        Open profile →
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    No professor page yet. Use the table above to compare sections.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/8 dark:bg-white/4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                  More from {course.subject}
                </div>
                <div className="mt-3 space-y-3">
                  {relatedCourses.length > 0 ? (
                    relatedCourses.map((related) => (
                      <Link
                        key={related.id}
                        href={`/courses/${related.subject}/${related.number}`}
                        className="block rounded-xl border border-zinc-200 bg-white px-3 py-3 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/8 dark:bg-zinc-900/50 dark:hover:bg-white/6"
                      >
                        <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {related.subject} {related.number}
                        </div>
                        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {related.title || "Untitled"}
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      No nearby matches found.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/8 dark:bg-white/4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                  Decision shortcut
                </div>
                <div className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">
                  Ask Sparky about this class
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Get a quick summary of difficulty, fit, and professor picks.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/chat?q=${sparkyPrompt}`}
                    className="inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                  >
                    Ask Sparky →
                  </Link>
                  {relatedGenEds[0] ? (
                    <Link
                      href={`/courses/${relatedGenEds[0].subject}/${relatedGenEds[0].number}`}
                      className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/8"
                    >
                      Easier Gen Ed option →
                    </Link>
                  ) : null}
                </div>
                {relatedGenEds.length > 0 ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    More options: {relatedGenEds.map((item) => `${item.subject} ${item.number}`).join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/40 sm:p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              About This Class
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-zinc-700 dark:text-zinc-300 sm:text-[15px]">
              {renderDescriptionWithCourseLinks(courseDescription, linkableDescriptionCourseCodes)}
            </p>
          </section>
        </div>

      </div>

      <SiteFooter className="mt-12" />
    </main>
  );
}
