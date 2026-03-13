import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";

type ProfCoursesMap = Record<string, string[]>;

function mapKeyToDbName(key: string) {
  const s = (key || "").trim();
  if (!s) return s;
  if (s.includes(",")) {
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
  }
  return s;
}

function normName(s: string) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function courseLabelFromItem(s: string) {
  const t = (s || "").trim().toUpperCase();
  const m = t.match(/^([A-Z&]+)\s*\|?\s*(\d+[A-Z]?)\b/);
  if (m) return `${m[1]} ${m[2]}`;
  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) { const mm = `${pipe[0]} ${pipe[1]}`.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/); if (mm) return `${mm[1]} ${mm[2]}`; }
  return t;
}
function courseTitleFromItem(s: string) { const pipe = (s || "").trim().split("|").map((x) => x.trim()); return pipe.length >= 2 ? pipe.slice(1).join(" | ") : ""; }

const globalForCourseMap = globalThis as unknown as { __profCourseMap?: ProfCoursesMap };
function getProfCourseMap(): ProfCoursesMap {
  if (globalForCourseMap.__profCourseMap) return globalForCourseMap.__profCourseMap;
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "data", "professor_to_courses.json"), "utf8");
  return (globalForCourseMap.__profCourseMap = JSON.parse(raw));
}

type CourseRankRow = { courseLabel: string; courseTitle: string; profRank: number | null; totalInCourse: number; profScore: number; profRatings: number; };

function ratingBg(v: number) {
  if (v >= 4.5) return "bg-emerald-500";
  if (v >= 4.0) return "bg-green-500";
  if (v >= 3.0) return "bg-amber-500";
  return "bg-red-500";
}

function rankBadgeClass(rank: number, total: number) {
  const pct = rank / total;
  if (pct <= 0.25) return "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:ring-emerald-500/25";
  if (pct <= 0.5) return "text-green-700 bg-green-50 ring-green-200 dark:text-green-400 dark:bg-green-500/15 dark:ring-green-500/25";
  if (pct <= 0.75) return "text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-400 dark:bg-amber-500/15 dark:ring-amber-500/25";
  return "text-zinc-600 bg-zinc-100 ring-zinc-200 dark:text-zinc-400 dark:bg-white/5 dark:ring-white/10";
}

export default async function ProfessorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) notFound();

  const C = 20, M = 4.0;
  const result = await prisma.$queryRawUnsafe<any[]>(`
    WITH scored AS (
      SELECT "id","slug","name","department","school",
        COALESCE("rmpQuality",0) as "quality", COALESCE("rmpRatingsCount",0) as "ratingsCount",
        COALESCE("rmpUrl",'') as "rmpUrl", COALESCE("aiSummary",'') as "aiSummary",
        CASE WHEN COALESCE("rmpRatingsCount",0)=0 THEN 0
          ELSE (COALESCE("rmpRatingsCount",0)::float/(COALESCE("rmpRatingsCount",0)+${C}))*COALESCE("rmpQuality",0)
               +(${C}::float/(COALESCE("rmpRatingsCount",0)+${C}))*${M} END as "score"
      FROM "Professor"
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY "score" DESC,"ratingsCount" DESC,"name" ASC) as "overallRank",
        ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "score" DESC,"ratingsCount" DESC,"name" ASC) as "deptRank"
      FROM scored
    )
    SELECT * FROM ranked WHERE "slug"=$1`, slug);

  const professor = result[0];
  if (!professor) notFound();

  const courseMap = getProfCourseMap();
  const profNorm = normName(professor.name);
  const profMapKey = Object.keys(courseMap).find((k) => normName(mapKeyToDbName(k)) === profNorm) || "";
  const profCourses = (profMapKey ? courseMap[profMapKey] || [] : []).map((item) => ({ courseLabel: courseLabelFromItem(item), courseTitle: courseTitleFromItem(item) })).filter((x) => x.courseLabel);

  async function computeRankForCourse(courseLabel: string, courseTitle: string): Promise<CourseRankRow> {
    const peerDbNames: string[] = [];
    for (const [key, courses] of Object.entries(courseMap)) { if ((courses || []).some((c) => courseLabelFromItem(c) === courseLabel)) peerDbNames.push(mapKeyToDbName(key)); }
    if (peerDbNames.length === 0) return { courseLabel, courseTitle, profRank: null, totalInCourse: 0, profScore: Number(professor.score || 0), profRatings: Number(professor.ratingsCount || 0) };
    const peers = await prisma.professor.findMany({ where: { name: { in: peerDbNames } }, select: { name: true, rmpQuality: true, rmpRatingsCount: true } });
    const scored = peers.map((p) => { const q = Number(p.rmpQuality ?? 0), r = Number(p.rmpRatingsCount ?? 0); return { name: p.name, score: r === 0 ? 0 : (r/(r+C))*q+(C/(r+C))*M, ratings: r }; });
    scored.sort((a, b) => b.score !== a.score ? b.score - a.score : b.ratings !== a.ratings ? b.ratings - a.ratings : a.name.localeCompare(b.name));
    const idx = scored.findIndex((p) => normName(p.name) === profNorm);
    return { courseLabel, courseTitle, profRank: idx === -1 ? null : idx + 1, totalInCourse: scored.length, profScore: Number(professor.score || 0), profRatings: Number(professor.ratingsCount || 0) };
  }

  const courseRanks: CourseRankRow[] = await Promise.all(profCourses.map((c) => computeRankForCourse(c.courseLabel, c.courseTitle)));
  const bg = ratingBg(Number(professor.quality || 0));

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-emerald-50/60 to-transparent dark:from-emerald-950/30 dark:to-transparent" />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Profile card */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50 dark:shadow-black/40">
          <div className={`h-1 w-full ${bg}`} />
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-6">
              <div className={`flex-shrink-0 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl text-3xl sm:text-4xl font-black text-white shadow-lg ${bg}`}>
                {Number(professor.quality || 0).toFixed(1)}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl lg:text-4xl">{professor.name}</h1>
                <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">{professor.school}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[`#${professor.overallRank} overall`, `#${professor.deptRank} in ${professor.department}`, `${professor.ratingsCount} reviews`].map((t) => (
                    <span key={t} className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-white/10">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {professor.aiSummary && (
              <div className="mt-6 rounded-xl border border-zinc-100 dark:border-white/8 bg-zinc-50 dark:bg-white/[0.03] p-5 text-sm leading-relaxed">
                {professor.aiSummary.split("\n\n").map((block: string, i: number) => {
                  if (block.trim().startsWith("•")) {
                    const items = block.split("\n").map((s: string) => s.replace(/^•\s*/, "").trim()).filter(Boolean);
                    return <ul key={i} className="mt-3 space-y-1.5 pl-4">{items.map((it: string, idx: number) => <li key={idx} className="flex items-start gap-2 text-zinc-500 dark:text-zinc-400"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />{it}</li>)}</ul>;
                  }
                  return <p key={i} className={i === 0 ? "font-bold text-zinc-900 dark:text-white" : "mt-3 text-zinc-500 dark:text-zinc-400"}>{block}</p>;
                })}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              {[{ label: "Department", value: professor.department }, { label: "School", value: professor.school }].map((s) => (
                <div key={s.label} className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] px-4 py-3 ring-1 ring-zinc-200 dark:ring-white/8">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{s.label}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-200">{s.value}</div>
                </div>
              ))}
            </div>

            {professor.rmpUrl && (
              <div className="mt-5">
                <a href={professor.rmpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 transition hover:bg-zinc-50 dark:hover:bg-white/10 hover:border-zinc-300 dark:hover:border-white/20">
                  View on RateMyProfessors →
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Course rankings */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40 dark:shadow-xl">
          <div className="border-b border-zinc-100 dark:border-white/8 px-5 py-5 sm:px-6">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">Course Rankings</h2>
            <p className="mt-1 text-sm text-zinc-500">How this professor ranks among peers in each course they teach</p>
          </div>
          {courseRanks.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-400 dark:text-zinc-600">No course data found for this professor.</div>
          ) : (
            <>
              <div className="grid grid-cols-12 bg-zinc-50 dark:bg-zinc-950/50 px-5 sm:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
                <div className="col-span-3">Course</div>
                <div className="col-span-6">Title</div>
                <div className="col-span-3 text-right">Rank</div>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
                {courseRanks.map((r) => (
                  <li key={r.courseLabel} className="grid grid-cols-12 items-center px-5 sm:px-6 py-4 text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                    <div className="col-span-3 font-bold text-zinc-900 dark:text-zinc-100">{r.courseLabel}</div>
                    <div className="col-span-6 text-zinc-400 dark:text-zinc-500 text-xs pr-4">{r.courseTitle || "Untitled"}</div>
                    <div className="col-span-3 flex justify-end">
                      {r.profRank ? (
                        <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${rankBadgeClass(r.profRank, r.totalInCourse)}`}>
                          #{r.profRank} of {r.totalInCourse}
                        </span>
                      ) : <span className="text-xs text-zinc-300 dark:text-zinc-700">No data</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="mt-12 border-t border-zinc-100 dark:border-white/8 pt-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
          <p>Contact: <a href="mailto:uicratings@gmail.com" className="hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors">uicratings@gmail.com</a></p>
          <p className="mt-1">Not affiliated with UIC or RMP.</p>
        </footer>
      </div>
    </main>
  );
}