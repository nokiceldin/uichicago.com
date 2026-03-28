import { prisma } from "@/lib/prisma";
import { calcGpa, normName, mapKeyToDbName, courseLabel, courseTitle, getProfCourseMap } from "./utils";

function isReliableRankingCourse(course: {
  number?: string | null;
  title?: string | null;
  totalRegsAllTime?: number | null;
}) {
  const num = parseInt(course.number?.match(/\d+/)?.[0] ?? "0", 10);
  const title = (course.title ?? "").toLowerCase();
  const totalRegs = course.totalRegsAllTime ?? 0;

  if (!Number.isFinite(num) || num <= 0 || num >= 500) return false;
  if (totalRegs < 50) return false;
  if (/special topics|spec topics|\bspec\b|independent study|ind study|thesis|seminar|research|advanced topics|wksp|workshop/.test(title)) return false;
  if (/in the context of|freshman seminar|orientation|practicum for|teaching methods/.test(title)) return false;
  return true;
}

// ─── Course detail ────────────────────────────────────────────────────────────

export async function fetchCourseDetail(subject: string, number: string) {
  const course = await prisma.course.findFirst({
    where: {
      subject: { equals: subject, mode: "insensitive" },
      number: { equals: number, mode: "insensitive" },
    },
  });
  if (!course) return null;

  const totals = await prisma.courseTermStats.aggregate({
    where: { courseId: course.id },
    _sum: { gradeRegs: true, a: true, b: true, c: true, d: true, f: true, w: true },
  });

  const instrStats = await prisma.courseInstructorTermStats.findMany({
    where: { courseId: course.id },
    include: { term: true },
    orderBy: { gradeRegs: "desc" },
    take: 100,
  });

  const map: Record<string, {
    a: number; b: number; c: number; d: number; f: number; w: number; total: number; terms: string[];
  }> = {};

  for (const s of instrStats) {
    if (!map[s.instructorName])
      map[s.instructorName] = { a: 0, b: 0, c: 0, d: 0, f: 0, w: 0, total: 0, terms: [] };
    map[s.instructorName].a += s.a;
    map[s.instructorName].b += s.b;
    map[s.instructorName].c += s.c;
    map[s.instructorName].d += s.d;
    map[s.instructorName].f += s.f;
    map[s.instructorName].w += s.w;
    map[s.instructorName].total += s.gradeRegs;
    if (!map[s.instructorName].terms.includes(s.term.code))
      map[s.instructorName].terms.push(s.term.code);
  }

  const instructors = await Promise.all(
    Object.entries(map).map(async ([name, v]) => {
      const gpa = calcGpa(v.a, v.b, v.c, v.d, v.f);
      const graded = v.a + v.b + v.c + v.d + v.f;
      const aRate = graded > 0 ? +((v.a / graded) * 100).toFixed(1) : null;
      const normInstr = normName(name);

      const profRow = await prisma.professor
        .findFirst({
          where: { name: { contains: name.split(",")[0]?.trim() || name, mode: "insensitive" } },
          select: { rmpQuality: true, rmpDifficulty: true, rmpRatingsCount: true, slug: true },
        })
        .catch(() => null);

      const allInstrs = Object.entries(map)
        .map(([n, vv]: [string, { a: number; b: number; c: number; d: number; f: number }]) => ({ name: n, gpa: calcGpa(vv.a, vv.b, vv.c, vv.d, vv.f) }))
        .filter((x) => x.gpa != null)
        .sort((a, b) => (b.gpa ?? 0) - (a.gpa ?? 0));

      const rank = allInstrs.findIndex((x) => normName(x.name) === normInstr) + 1;

      return {
        instructor: name,
        avgGpa: gpa,
        aRate,
        wRate: v.total > 0 ? +((v.w / v.total) * 100).toFixed(1) : null,
        totalStudents: v.total,
        terms: v.terms.sort().join(", "),
        gradeRank: rank > 0 ? `#${rank} of ${allInstrs.length}` : null,
        rmpQuality: profRow?.rmpQuality ?? null,
        rmpDifficulty: profRow?.rmpDifficulty ?? null,
        rmpRatingsCount: profRow?.rmpRatingsCount ?? null,
      };
    })
  );

  instructors.sort((a, b) => (b.avgGpa ?? 0) - (a.avgGpa ?? 0));
  return { course, totals, instructors };
}

// ─── Courses by code list ─────────────────────────────────────────────────────

export async function fetchCoursesByCodesRanked(courseCodes: string[], easiestFirst = true) {
  const parsed = courseCodes
    .map((c: string) => {
      const m = c.trim().match(/^([A-Z&]+)\s+(\d+[A-Z]?)$/i);
      return m ? { subject: m[1].toUpperCase(), number: m[2].toUpperCase() } : null;
    })
    .filter((x): x is { subject: string; number: string } => x !== null);

  if (!parsed.length) return [];

  return prisma.course.findMany({
    where: { OR: parsed.map((p) => ({ subject: p.subject, number: p.number })) },
    select: {
      subject: true, number: true, title: true, avgGpa: true,
      difficultyScore: true, totalRegsAllTime: true, deptName: true,
      isGenEd: true, genEdCategory: true,
    },
    orderBy: easiestFirst
      ? [{ difficultyScore: "desc" }, { avgGpa: "desc" }]
      : [{ difficultyScore: "asc" }, { avgGpa: "asc" }],
    take: 60,
  });
}

// ─── Courses by subject or department ────────────────────────────────────────

export async function fetchCoursesBySubjectOrDept(
  subject?: string | null,
  deptName?: string | null,
  limit = 40,
  easiestFirst = true
) {
  const conditions: string[] = [`"avgGpa" IS NOT NULL`, `"difficultyScore" IS NOT NULL`];
  const params: (string | number)[] = [];

  if (subject) {
    params.push(subject.toUpperCase());
    conditions.push(`subject = $${params.length}`);
  } else if (deptName) {
    params.push(`%${deptName}%`);
    conditions.push(`"deptName" ILIKE $${params.length}`);
  }

  const dir = easiestFirst ? "DESC" : "ASC";
  params.push(limit);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT subject, number, title, "avgGpa", "difficultyScore", "totalRegsAllTime", "deptName", "isGenEd", "genEdCategory"
     FROM "Course" WHERE ${conditions.join(" AND ")}
     ORDER BY "difficultyScore" ${dir} NULLS LAST, "avgGpa" ${dir} NULLS LAST LIMIT $${params.length}`,
    ...params
  );

  return rows.filter(isReliableRankingCourse).slice(0, limit);
}

// ─── Gen Ed courses ───────────────────────────────────────────────────────────

export async function fetchGenEdCourses(category?: string | null, limit = 30) {
  const where = category
    ? { isGenEd: true, avgGpa: { not: null }, genEdCategory: { contains: category, mode: "insensitive" as const } }
    : { isGenEd: true, avgGpa: { not: null } };

  const courses = await prisma.course.findMany({
    where,
    orderBy: [{ difficultyScore: "desc" }, { avgGpa: "desc" }],
    take: limit * 3,
    select: {
      subject: true, number: true, title: true, avgGpa: true,
      difficultyScore: true, genEdCategory: true, totalRegsAllTime: true,
    },
  });

  return courses
    .filter((course) => {
      if (!isReliableRankingCourse(course)) return false;
      const num = parseInt(course.number?.match(/\d+/)?.[0] ?? "0", 10);
      return Number.isFinite(num) && num > 0 && num < 300;
    })
    .slice(0, limit);
}

// ─── Professors by department ─────────────────────────────────────────────────

export async function fetchProfessorsByDept(deptName?: string | null, limit = 30) {
  if (deptName) {
    return prisma.$queryRawUnsafe(
      `SELECT name, department, "rmpQuality", "rmpDifficulty", "rmpRatingsCount", "rmpWouldTakeAgain", slug, "aiSummary", "salary", "salaryTitle",
       CASE WHEN COALESCE("rmpRatingsCount",0)=0 THEN 0
         ELSE (COALESCE("rmpRatingsCount",0)::float/(COALESCE("rmpRatingsCount",0)+20))*COALESCE("rmpQuality",0)
              +(20::float/(COALESCE("rmpRatingsCount",0)+20))*4.0 END as score
       FROM "Professor"
       WHERE "rmpRatingsCount" IS NOT NULL AND "rmpRatingsCount" > 0
       AND department ILIKE $1
       ORDER BY score DESC NULLS LAST LIMIT $2`,
      `%${deptName}%`,
      limit
    ) as Promise<any[]>;
  }
  return prisma.$queryRawUnsafe(
    `SELECT name, department, "rmpQuality", "rmpDifficulty", "rmpRatingsCount", "rmpWouldTakeAgain", slug, "aiSummary", "salary", "salaryTitle",
     CASE WHEN COALESCE("rmpRatingsCount",0)=0 THEN 0
       ELSE (COALESCE("rmpRatingsCount",0)::float/(COALESCE("rmpRatingsCount",0)+20))*COALESCE("rmpQuality",0)
            +(20::float/(COALESCE("rmpRatingsCount",0)+20))*4.0 END as score
     FROM "Professor"
     WHERE "rmpRatingsCount" IS NOT NULL AND "rmpRatingsCount" > 0
     ORDER BY score DESC NULLS LAST LIMIT $1`,
    limit
  ) as Promise<any[]>;
}

// ─── Professor with course rankings ──────────────────────────────────────────

export async function fetchProfessorWithCourseRankings(profNameHint: string) {
  // Try direct match first, then try each word of the hint individually
const nameParts = profNameHint.split(/\s+/).filter(p => p.length >= 3);
const prof = await prisma.professor.findFirst({
  where: {
    OR: [
      { name: { contains: profNameHint, mode: "insensitive" as const } },
      ...nameParts.map(part => ({ name: { contains: part, mode: "insensitive" as const } })),
    ]
  },
  orderBy: { rmpRatingsCount: "desc" },
    select: {
      name: true, department: true, rmpQuality: true, rmpDifficulty: true,
      rmpRatingsCount: true, rmpWouldTakeAgain: true, aiSummary: true, slug: true,
      salary: true, salaryTitle: true,
    },
  });
  if (!prof) return null;

  const courseMap = getProfCourseMap();
  const profNorm = normName(prof.name);
  const mapKey =
    Object.keys(courseMap).find((k) => normName(mapKeyToDbName(k)) === profNorm) || "";
  const courses = mapKey
    ? (courseMap[mapKey] || []).map((item) => ({ label: courseLabel(item), title: courseTitle(item) }))
    : [];

  return { prof, courses };
}

// ─── Recent news ──────────────────────────────────────────────────────────────

export async function fetchRecentNews(category?: string | null, limit = 10) {
  const where = category
    ? { category, publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    : { publishedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } };

  return prisma.newsItem.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { title: true, aiSummary: true, publishedAt: true, source: true, url: true, category: true },
  });
}

// ─── Easiest/best professors FOR A SPECIFIC COURSE ────────────────────────────
// This is the core "who's easiest for CS 211?" query — pure SQL, no vectors

export async function fetchProfessorsForCourse(
  subject: string,
  number: string,
  easiestFirst = true
) {
  const course = await prisma.course.findFirst({
    where: {
      subject: { equals: subject, mode: "insensitive" },
      number: { equals: number, mode: "insensitive" },
    },
    select: { id: true, title: true, subject: true, number: true, avgGpa: true },
  });
  if (!course) return null;

  const stats = await prisma.courseInstructorTermStats.groupBy({
    by: ["instructorName"],
    where: { courseId: course.id },
    _sum: { a: true, b: true, c: true, d: true, f: true, w: true, gradeRegs: true },
    orderBy: { _sum: { gradeRegs: "desc" } },
  });

  const courseMap = getProfCourseMap();

  const instructors = await Promise.all(
    stats.map(async (s) => {
      const sum = s._sum;
      const graded = (sum.a ?? 0) + (sum.b ?? 0) + (sum.c ?? 0) + (sum.d ?? 0) + (sum.f ?? 0);
      const gpa = graded > 0 ? calcGpa(sum.a ?? 0, sum.b ?? 0, sum.c ?? 0, sum.d ?? 0, sum.f ?? 0) : null;
      const aRate = graded > 0 ? +((( sum.a ?? 0) / graded) * 100).toFixed(1) : null;
      const wRate = (sum.gradeRegs ?? 0) > 0 ? +(((sum.w ?? 0) / (sum.gradeRegs ?? 1)) * 100).toFixed(1) : null;

      // Try to find RMP data
      const prof = await prisma.professor.findFirst({
        where: { name: { contains: s.instructorName.split(",")[0]?.trim() ?? s.instructorName, mode: "insensitive" } },
        select: { rmpQuality: true, rmpDifficulty: true, rmpRatingsCount: true, rmpWouldTakeAgain: true, aiSummary: true, slug: true },
      });

      return {
        name: s.instructorName,
        gpa,
        aRate,
        wRate,
        totalStudents: sum.gradeRegs ?? 0,
        rmpQuality: prof?.rmpQuality ?? null,
        rmpDifficulty: prof?.rmpDifficulty ?? null,
        rmpRatingsCount: prof?.rmpRatingsCount ?? null,
        rmpWouldTakeAgain: prof?.rmpWouldTakeAgain ?? null,
        aiSummary: prof?.aiSummary ?? null,
        slug: prof?.slug ?? null,
      };
    })
  );

  // Sort by GPA (easiest = highest GPA first) or hardest
  const sorted = instructors
    .filter(i => i.gpa !== null && i.totalStudents >= 10)
    .sort((a, b) => easiestFirst ? (b.gpa! - a.gpa!) : (a.gpa! - b.gpa!));

  return { course, instructors: sorted };
}

// ─── Course GPA ranking within a department/subject ──────────────────────────
// "easiest CS courses", "highest GPA MATH courses"

export async function fetchCourseGpaRanking(
  subject: string | null,
  deptName: string | null,
  easiestFirst = true,
  isGenEdOnly = false,
  limit = 20
) {
  const where: any = { avgGpa: { not: null } };
  if (subject) where.subject = { equals: subject, mode: "insensitive" };
  if (deptName && !subject) where.deptName = { contains: deptName, mode: "insensitive" };
  if (isGenEdOnly) where.isGenEd = true;

  const courses = await prisma.course.findMany({
    where,
    select: {
      subject: true, number: true, title: true,
      avgGpa: true, difficultyScore: true,
      totalRegsAllTime: true, isGenEd: true, genEdCategory: true,
    },
    orderBy: easiestFirst
      ? [{ difficultyScore: "desc" }, { avgGpa: "desc" }]
      : [{ difficultyScore: "asc" }, { avgGpa: "asc" }],
    take: limit * 4,
  });

  return courses.filter(isReliableRankingCourse).slice(0, limit);
}
