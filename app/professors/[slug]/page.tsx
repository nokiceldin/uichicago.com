import { notFound } from "next/navigation";
import Link from "next/link";
import SiteFooter from "@/app/components/SiteFooter";
import {
  getProfessorDirectory,
  getProfessorDirectoryBySlug,
} from "@/lib/professors/directory";

type CourseRankRow = {
  courseLabel: string;
  courseTitle: string;
  profRank: number | null;
  totalInCourse: number;
};

function courseLabelFromItem(item: string) {
  const value = (item || "").trim().toUpperCase();
  const match = value.match(/^([A-Z&]+)\s*\|?\s*(\d+[A-Z]?)\b/);
  if (match) return `${match[1]} ${match[2]}`;
  const pipeParts = value.split("|").map((part) => part.trim());
  if (pipeParts.length >= 2) {
    const fallback = `${pipeParts[0]} ${pipeParts[1]}`.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/);
    if (fallback) return `${fallback[1]} ${fallback[2]}`;
  }
  return value;
}

function courseTitleFromItem(item: string) {
  const pipe = (item || "").trim().split("|").map((part) => part.trim());
  return pipe.length >= 2 ? pipe.slice(1).join(" | ") : "";
}

function ratingBg(value: number, isRated: boolean) {
  if (!isRated) return "bg-zinc-500";
  if (value >= 4.5) return "bg-emerald-500";
  if (value >= 4.0) return "bg-green-500";
  if (value >= 3.0) return "bg-amber-500";
  return "bg-red-500";
}

function rankBadgeClass(rank: number, total: number) {
  if (rank === 1) return "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:ring-emerald-500/25";
  const pct = rank / total;
  if (pct <= 0.25) return "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:ring-emerald-500/25";
  if (pct <= 0.5) return "text-green-700 bg-green-50 ring-green-200 dark:text-green-400 dark:bg-green-500/15 dark:ring-green-500/25";
  if (pct <= 0.75) return "text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-400 dark:bg-amber-500/15 dark:ring-amber-500/25";
  return "text-zinc-600 bg-zinc-100 ring-zinc-200 dark:text-zinc-400 dark:bg-white/5 dark:ring-white/10";
}

export default async function ProfessorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) notFound();

  const [professor, directory] = await Promise.all([
    getProfessorDirectoryBySlug(slug),
    getProfessorDirectory(),
  ]);

  if (!professor) notFound();

  const overallRanked = directory.filter((entry) => entry.isRated);
  const departmentRanked = overallRanked.filter((entry) => entry.department === professor.department);

  const overallRank = professor.isRated
    ? overallRanked.findIndex((entry) => entry.slug === professor.slug) + 1
    : null;
  const departmentRank = professor.isRated
    ? departmentRanked.findIndex((entry) => entry.slug === professor.slug) + 1
    : null;

  const profCourses = professor.courseItems
    .map((item) => ({
      courseLabel: courseLabelFromItem(item),
      courseTitle: courseTitleFromItem(item),
    }))
    .filter((course) => course.courseLabel);

  const courseRanks: CourseRankRow[] = profCourses.map((course) => {
    const peers = directory
      .filter((entry) => entry.courseLabels.includes(course.courseLabel))
      .sort((a, b) => {
        if (a.isRated !== b.isRated) return a.isRated ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
        return a.name.localeCompare(b.name);
      });

    const profRank = professor.isRated
      ? peers.findIndex((entry) => entry.slug === professor.slug) + 1
      : null;

    return {
      courseLabel: course.courseLabel,
      courseTitle: course.courseTitle,
      profRank: typeof profRank === "number" && profRank > 0 ? profRank : null,
      totalInCourse: peers.length,
    };
  });

  const bg = ratingBg(professor.quality, professor.isRated);

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-linear-to-b from-sky-50/60 to-transparent dark:from-sky-950/30 dark:to-transparent" />

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-16">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/50 dark:shadow-black/40">
          <div className={`h-1 w-full ${bg}`} />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className={`flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg sm:h-24 sm:w-24 sm:text-3xl ${bg}`}>
                {professor.isRated ? Number(professor.quality || 0).toFixed(1) : "NR"}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl lg:text-4xl">
                  {professor.name}
                </h1>
                <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">{professor.school}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {professor.isRated ? (
                    <>
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-white/10">
                        #{overallRank} overall
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-white/10">
                        #{departmentRank} in {professor.department}
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-white/10">
                        {professor.ratingsCount} reviews
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-white/10">
                        Active at UIC
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-white/10">
                        No RMP profile yet
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {professor.aiSummary ? (
              <div className="mt-6 rounded-xl border border-zinc-100 dark:border-white/8 bg-zinc-50 dark:bg-white/3 p-5 text-sm leading-relaxed">
                {professor.aiSummary.split("\n\n").map((block, i) => {
                  if (block.trim().startsWith("•")) {
                    const items = block
                      .split("\n")
                      .map((line) => line.replace(/^•\s*/, "").trim())
                      .filter(Boolean);
                    return (
                      <ul key={i} className="mt-3 space-y-1.5 pl-4">
                        {items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-zinc-500 dark:text-zinc-400">
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  return (
                    <p key={i} className={i === 0 ? "font-bold text-zinc-900 dark:text-white" : "mt-3 text-zinc-500 dark:text-zinc-400"}>
                      {block}
                    </p>
                  );
                })}
              </div>
            ) : !professor.isRated ? (
              <div className="mt-6 rounded-xl border border-zinc-100 dark:border-white/8 bg-zinc-50 dark:bg-white/3 p-5 text-sm text-zinc-500 dark:text-zinc-400">
                This instructor is active in current UIC teaching data, but there is no matched RateMyProfessors profile yet.
              </div>
            ) : null}

            <div className={`mt-6 grid gap-3 ${professor.salary ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
              {[{ label: "Department", value: professor.department }, { label: "School", value: professor.school }].map((section) => (
                <div key={section.label} className="rounded-xl bg-zinc-50 dark:bg-white/3 px-4 py-3 ring-1 ring-zinc-200 dark:ring-white/8">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                    {section.label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-200">
                    {section.value}
                  </div>
                </div>
              ))}
              {professor.salary ? (
                <div className="col-span-2 sm:col-span-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/7 px-4 py-3 ring-1 ring-emerald-200 dark:ring-emerald-500/20">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-500">
                    Annual Salary
                  </div>
                  <div className="mt-1 text-sm font-bold text-sky-700 dark:text-sky-400">
                    ${Number(professor.salary).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                  {professor.salaryTitle ? (
                    <div className="mt-0.5 truncate text-[11px] capitalize text-sky-600/70 dark:text-sky-500/60">
                      {professor.salaryTitle.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {professor.url ? (
              <div className="mt-5">
                <a
                  href={professor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-300 dark:border-sky-500/15 dark:bg-sky-500/5 dark:text-zinc-200 dark:hover:bg-sky-500/10 dark:hover:border-sky-500/25"
                >
                  View on RateMyProfessors →
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40 dark:shadow-xl">
          <div className="border-b border-zinc-100 dark:border-white/8 px-5 py-5 sm:px-6">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">Course Rankings</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {professor.isRated
                ? "How this professor ranks among peers in each course they teach"
                : "Courses currently tied to this instructor in UIC teaching data"}
            </p>
          </div>
          {courseRanks.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-400 dark:text-zinc-600">
              No course data found for this professor.
            </div>
          ) : (
            <>
              <div className="space-y-3 px-4 py-4 sm:hidden">
                {courseRanks.map((row) => (
                  <div key={row.courseLabel} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-white/3 dark:ring-white/8">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/courses/${row.courseLabel.split(" ")[0].toLowerCase()}/${row.courseLabel.split(" ")[1]?.toLowerCase()}`}
                          className="text-base font-bold text-zinc-900 transition-colors hover:text-sky-600 hover:underline dark:text-zinc-100 dark:hover:text-sky-400"
                        >
                          {row.courseLabel}
                        </Link>
                        <div className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                          {row.courseTitle || "Untitled"}
                        </div>
                      </div>
                      {row.profRank ? (
                        <span className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${rankBadgeClass(row.profRank, row.totalInCourse)}`}>
                          #{row.profRank}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300 dark:text-zinc-700">
                          {professor.isRated ? "No data" : "Active"}
                        </span>
                      )}
                    </div>
                    {row.profRank ? (
                      <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Ranked #{row.profRank} of {row.totalInCourse} professors in this course.
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="hidden sm:block">
                <div className="grid grid-cols-12 bg-zinc-50 dark:bg-zinc-950/50 px-5 sm:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
                  <div className="col-span-3">Course</div>
                  <div className="col-span-6">Title</div>
                  <div className="col-span-3 text-right">Rank</div>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-white/4">
                  {courseRanks.map((row) => (
                    <li key={row.courseLabel} className="grid grid-cols-12 items-center px-5 sm:px-6 py-4 text-sm hover:bg-zinc-50 dark:hover:bg-white/3 transition-colors">
                      <div className="col-span-3 font-bold text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`/courses/${row.courseLabel.split(" ")[0].toLowerCase()}/${row.courseLabel.split(" ")[1]?.toLowerCase()}`}
                          className="transition-colors hover:text-sky-600 hover:underline dark:hover:text-sky-400"
                        >
                          {row.courseLabel}
                        </Link>
                      </div>
                      <div className="col-span-6 pr-4 text-xs text-zinc-400 dark:text-zinc-500">
                        {row.courseTitle || "Untitled"}
                      </div>
                      <div className="col-span-3 flex justify-end">
                        {row.profRank ? (
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${rankBadgeClass(row.profRank, row.totalInCourse)}`}>
                            #{row.profRank} of {row.totalInCourse}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-300 dark:text-zinc-700">
                            {professor.isRated ? "No data" : "Active"}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <SiteFooter className="mt-12" />
    </main>
  );
}
