import { prisma } from "@/app/lib/prisma";
import { calcGpa, normName, mapKeyToDbName, courseLabel, courseTitle, getProfCourseMap } from "./utils";

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
    orderBy: easiestFirst ? { avgGpa: "desc" } : { avgGpa: "asc" },
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

  params.push(limit);
  return prisma.$queryRawUnsafe(
    `SELECT subject, number, title, "avgGpa", "difficultyScore", "totalRegsAllTime", "deptName", "isGenEd", "genEdCategory"
     FROM "Course" WHERE ${conditions.join(" AND ")}
     ORDER BY "avgGpa" ${easiestFirst ? "DESC" : "ASC"} NULLS LAST LIMIT $${params.length}`,
    ...params
  ) as Promise<any[]>;
}

// ─── Gen Ed courses ───────────────────────────────────────────────────────────

export async function fetchGenEdCourses(category?: string | null, limit = 30) {
  const where = category
    ? { isGenEd: true, avgGpa: { not: null }, genEdCategory: { contains: category, mode: "insensitive" as const } }
    : { isGenEd: true, avgGpa: { not: null } };

  return prisma.course.findMany({
    where,
    orderBy: { avgGpa: "desc" },
    take: limit,
    select: {
      subject: true, number: true, title: true, avgGpa: true,
      difficultyScore: true, genEdCategory: true, totalRegsAllTime: true,
    },
  });
}

// ─── Professors by department ─────────────────────────────────────────────────

export async function fetchProfessorsByDept(deptName?: string | null, limit = 30) {
  if (deptName) {
    return prisma.$queryRawUnsafe(
      `SELECT name, department, "rmpQuality", "rmpDifficulty", "rmpRatingsCount", "rmpWouldTakeAgain", slug, "aiSummary",
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
    `SELECT name, department, "rmpQuality", "rmpDifficulty", "rmpRatingsCount", "rmpWouldTakeAgain", slug, "aiSummary",
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
  const prof = await prisma.professor.findFirst({
    where: { name: { contains: profNameHint, mode: "insensitive" } },
    select: {
      name: true, department: true, rmpQuality: true, rmpDifficulty: true,
      rmpRatingsCount: true, rmpWouldTakeAgain: true, aiSummary: true, slug: true,
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