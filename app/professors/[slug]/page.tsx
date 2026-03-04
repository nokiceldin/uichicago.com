import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";

type ProfCoursesMap = Record<string, string[]>;

function mapKeyToDbName(key: string) {
  const s = (key || "").trim();
  if (!s) return s;

  if (s.includes(",")) {
    const parts = s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[0];
      const first = parts.slice(1).join(" ");
      return `${first} ${last}`.replace(/\s+/g, " ").trim();
    }
  }

  return s;
}

function normName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function courseLabelFromItem(s: string) {
  const t = (s || "").trim().toUpperCase();
  const m = t.match(/^([A-Z&]+)\s*\|?\s*(\d+[A-Z]?)\b/);
  if (m) return `${m[1]} ${m[2]}`;

  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) {
    const mm = `${pipe[0]} ${pipe[1]}`.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/);
    if (mm) return `${mm[1]} ${mm[2]}`;
  }

  return t;
}

function courseTitleFromItem(s: string) {
  const t = (s || "").trim();
  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) return pipe.slice(1).join(" | ");
  return "";
}

const globalForCourseMap = globalThis as unknown as { __profCourseMap?: ProfCoursesMap };

function getProfCourseMap(): ProfCoursesMap {
  if (globalForCourseMap.__profCourseMap) return globalForCourseMap.__profCourseMap;

  const filePath = path.join(process.cwd(), "public", "data", "professor_to_courses.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const map = JSON.parse(raw) as ProfCoursesMap;

  globalForCourseMap.__profCourseMap = map;
  return map;
}

function getActiveDbNames() {
  const courseMap = getProfCourseMap();
  const out: string[] = [];

  for (const key of Object.keys(courseMap)) {
    out.push(mapKeyToDbName(key));
  }

  return out;
}

type CourseRankRow = {
  courseLabel: string;
  courseTitle: string;
  profRank: number | null;
  totalInCourse: number;
  profScore: number;
  profRatings: number;
};

export default async function ProfessorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!slug) notFound();

  const C = 20;
  const M = 4.0;

  const activeDbNames = getActiveDbNames();

  const result = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH scored AS (
      SELECT
        "id",
        "slug",
        "name",
        "department",
        "school",
        COALESCE("rmpQuality", 0) as "quality",
        COALESCE("rmpRatingsCount", 0) as "ratingsCount",
        COALESCE("rmpUrl", '') as "rmpUrl",
        COALESCE("aiSummary", '') as "aiSummary",
        CASE
          WHEN COALESCE("rmpRatingsCount", 0) = 0 THEN 0
          ELSE
            (COALESCE("rmpRatingsCount", 0)::float / (COALESCE("rmpRatingsCount", 0) + ${C})) * COALESCE("rmpQuality", 0)
            + (${C}::float / (COALESCE("rmpRatingsCount", 0) + ${C})) * ${M}
        END as "score"
      FROM "Professor"
      WHERE "name" = ANY($2)
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (ORDER BY "score" DESC, "ratingsCount" DESC, "name" ASC) as "overallRank",
        ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "score" DESC, "ratingsCount" DESC, "name" ASC) as "deptRank"
      FROM scored
    )
    SELECT *
    FROM ranked
    WHERE "slug" = $1
    `,
    slug,
    activeDbNames
  );

  const professor = result[0];
  if (!professor) notFound();

  const courseMap = getProfCourseMap();

  const profNorm = normName(professor.name);

  const profMapKey =
    Object.keys(courseMap).find((k) => normName(mapKeyToDbName(k)) === profNorm) || "";

  const profCoursesRaw: string[] = profMapKey ? courseMap[profMapKey] || [] : [];

  const profCourses = profCoursesRaw
    .map((item) => {
      const label = courseLabelFromItem(item);
      return {
        raw: item,
        courseLabel: label,
        courseTitle: courseTitleFromItem(item),
      };
    })
    .filter((x) => x.courseLabel);

  async function computeRankForCourse(courseLabel: string, courseTitle: string): Promise<CourseRankRow> {
    const peerDbNames: string[] = [];

    for (const [key, courses] of Object.entries(courseMap)) {
      const hasIt = (courses || []).some((c) => courseLabelFromItem(c) === courseLabel);
      if (hasIt) peerDbNames.push(mapKeyToDbName(key));
    }

    if (peerDbNames.length === 0) {
      return {
        courseLabel,
        courseTitle,
        profRank: null,
        totalInCourse: 0,
        profScore: Number(professor.score || 0),
        profRatings: Number(professor.ratingsCount || 0),
      };
    }

    const peers = await prisma.professor.findMany({
      where: { name: { in: peerDbNames } },
      select: { name: true, rmpQuality: true, rmpRatingsCount: true },
    });

    const scored = peers.map((p) => {
      const quality = Number(p.rmpQuality ?? 0);
      const ratings = Number(p.rmpRatingsCount ?? 0);
      const score =
        ratings === 0
          ? 0
          : (ratings / (ratings + C)) * quality + (C / (ratings + C)) * M;

      return {
        name: p.name,
        quality,
        ratings,
        score,
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.ratings !== a.ratings) return b.ratings - a.ratings;
      return a.name.localeCompare(b.name);
    });

    const idx = scored.findIndex((p) => normName(p.name) === profNorm);

    return {
      courseLabel,
      courseTitle,
      profRank: idx === -1 ? null : idx + 1,
      totalInCourse: scored.length,
      profScore: Number(professor.score || 0),
      profRatings: Number(professor.ratingsCount || 0),
    };
  }

  const courseRanks: CourseRankRow[] = await Promise.all(
    profCourses.map((c) => computeRankForCourse(c.courseLabel, c.courseTitle))
  );

  return (
    <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-zinc-900/40">
          <div className="mb-8 flex items-center gap-8">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full text-4xl font-bold text-white shadow-lg ${
                professor.quality >= 4.5
                  ? "bg-emerald-500"
                  : professor.quality >= 4.0
                  ? "bg-green-500"
                  : professor.quality >= 3.0
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            >
              {Number(professor.quality || 0).toFixed(1)}
            </div>

            <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <div>
                <span className="font-semibold">Overall Rank:</span> #{professor.overallRank}
              </div>

              <div>
                <span className="font-semibold">Rank in {professor.department}:</span> #{professor.deptRank}
              </div>

              <div>{professor.ratingsCount} total ratings</div>
            </div>
          </div>

          <h1 className="text-4xl font-semibold tracking-tight">{professor.name}</h1>
          <div className="mt-6 flex flex-wrap gap-2">
  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-white/5 dark:text-zinc-200 dark:ring-white/10">
    #{professor.overallRank} overall
  </span>
  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-white/5 dark:text-zinc-200 dark:ring-white/10">
    #{professor.deptRank} in {professor.department}
  </span>
  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-white/5 dark:text-zinc-200 dark:ring-white/10">
    {professor.ratingsCount} reviews
  </span>
</div>
{professor.aiSummary && (
  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white/70 p-5 text-sm leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
    {professor.aiSummary.split("\n\n").map((block: string, i: number) => {
      const isBullets = block.trim().startsWith("•");
      if (isBullets) {
        const items = block
          .split("\n")
          .map(s => s.replace(/^•\s*/, "").trim())
          .filter(Boolean);

        return (
          <ul key={i} className="mt-3 list-disc space-y-1 pl-5">
            {items.map((it, idx) => (
              <li key={idx}>{it}</li>
            ))}
          </ul>
        );
      }

      return (
        <p
          key={i}
          className={
            i === 0
              ? "text-base font-semibold text-zinc-900 dark:text-zinc-100"
              : "mt-3 text-sm text-zinc-700 dark:text-zinc-200"
          }
        >
          {block}
        </p>
      );
    })}
  </div>
)}

          <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <div>
              <span className="font-semibold">Department:</span> {professor.department}
            </div>

            <div>
              <span className="font-semibold">School:</span> {professor.school}
            </div>
          </div>

          {professor.rmpUrl && (
            <div className="mt-6">
              <a
                href={professor.rmpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white dark:text-zinc-900"
              >
                View on RateMyProfessor
              </a>
            </div>
          )}

          <div className="mt-10">
            <h2 className="text-lg font-semibold">Courses taught and rank in each course</h2>

            {courseRanks.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                No course data found for this professor.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
                <div className="grid grid-cols-12 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                  <div className="col-span-4">Course</div>
                  <div className="col-span-5">Title</div>
                  <div className="col-span-3 text-right">Rank</div>
                </div>

                {courseRanks.map((r) => (
                  <div
                    key={r.courseLabel}
                    className="grid grid-cols-12 items-center border-t border-zinc-200 px-4 py-3 text-sm dark:border-white/10"
                  >
                    <div className="col-span-4 font-semibold">{r.courseLabel}</div>
                    <div className="col-span-5 text-zinc-600 dark:text-zinc-300">
                      {r.courseTitle || "Untitled"}
                    </div>
                    <div className="col-span-3 text-right">
                      {r.profRank ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200">
                          #{r.profRank} of {r.totalInCourse}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">No data</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}