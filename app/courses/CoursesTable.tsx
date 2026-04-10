"use client";

import { majorRequirements } from "@/lib/majorRequirements";
import { useCallback, useEffect, useMemo, useState } from "react";
import MissingCourseButton from "@/app/components/MissingCourseButton";
import FeatureTour from "@/app/components/onboarding/FeatureTour";
import SiteFooter from "@/app/components/SiteFooter";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import SaveCourseButton from "@/app/components/saved/SaveCourseButton";
import { UNAUTHORIZED_ERROR, useSavedItems } from "@/app/hooks/useSavedItems";

function easinessConfig(v: number) {
  if (v >= 4.5) return { label: "Very Easy", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/15", ring: "ring-emerald-200 dark:ring-emerald-500/25" };
  if (v >= 4.0) return { label: "Easy", dot: "bg-green-500", text: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/15", ring: "ring-green-200 dark:ring-green-500/25" };
  if (v >= 3.0) return { label: "Medium", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/15", ring: "ring-amber-200 dark:ring-amber-500/25" };
  return { label: "Hard", dot: "bg-red-500", text: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/15", ring: "ring-red-200 dark:ring-red-500/25" };
}

type CourseRow = {
  id: string; subject: string; number: string; title: string | null;
  difficultyScore: number | null; avgGpa: number | null; totalRegsAllTime: number | null;
  isGenEd: boolean; genEdCategory: string | null;
};

export default function CoursesTable({ courses, total, page, pageSize, sort, dept, q, subjects, gened, genedCategory, major, majorCategory, savedOnly }: {
  courses: CourseRow[]; total: number; page: number; pageSize: number;
  sort: "difficultyDesc" | "difficultyAsc"; dept: string; q: string; subjects: string[];
  gened: boolean; genedCategory: string; major: string; majorCategory: string; savedOnly: boolean;
}) {
  const nf = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const { loading, saved, savedCourseIds, saveCourse, sessionStatus, unsaveCourse } = useSavedItems();
  const [qDraft, setQDraft] = useState(q);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  const pushWith = useCallback((next: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const key of Object.keys(next)) {
      const val = next[key];
      if (val == null || val === "") params.delete(key); else params.set(key, val);
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, sp]);

  useEffect(() => {
    const trimmed = qDraft.trim();
    const current = (q || "").trim();
    const timeout = setTimeout(() => {
      if (trimmed === current) return;
      pushWith({ q: trimmed ? trimmed : null, page: "1" });
    }, 300);
    return () => clearTimeout(timeout);
  }, [pushWith, qDraft, q]);

  function setPage(n: number) { pushWith({ page: String(n) }); }
  function setSort(s: "difficultyDesc" | "difficultyAsc") { pushWith({ sort: s, page: "1" }); }
  function setMajor(m: string) { pushWith({ major: m || null, majorCategory: null, page: "1" }); }
  function setMajorCategory(c: string) { pushWith({ major: major || null, majorCategory: c || null, page: "1" }); }
  function setDept(d: string) { pushWith({ dept: d || null, page: "1" }); }
  function setSavedOnly(v: boolean) { pushWith({ saved: v ? "1" : null, page: "1" }); }
  function setGenEd(v: boolean) { pushWith({ gened: v ? "1" : null, genedCategory: v ? genedCategory || null : null, page: "1" }); }
  function setGenEdCategory(c: string) {
    if (!c) { pushWith({ gened: null, genedCategory: null, page: "1" }); return; }
    if (c === "__ALL_GENEDS__") { pushWith({ gened: "1", genedCategory: null, page: "1" }); return; }
    pushWith({ gened: "1", genedCategory: c, page: "1" });
  }
  function clearAll() { setQDraft(""); router.push(`${pathname}?sort=difficultyDesc&page=1`); }

  const genEdCategories = ["Analyzing the Natural World","Understanding the Individual and Society","Understanding the Past","Understanding the Creative Arts","Exploring World Cultures","Understanding U.S. Society"];
  const visibleCourses = savedOnly && !loading ? courses.filter((course) => savedCourseIds.has(course.id)) : courses;
  const effectiveTotal = savedOnly && !loading ? saved.courses.length : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const start = (page - 1) * pageSize;
  const selectedMajor = majorRequirements.find((m) => m.key === major);
  const majorCategories = selectedMajor?.categories ?? [];
  const hasAnyFilters = !!q.trim() || !!dept || gened || !!genedCategory || !!major || !!majorCategory || savedOnly || sort !== "difficultyDesc";

  const selectBase = "h-9 w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-900/30 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-red-500/50 dark:focus:ring-red-500/10";
  const inputBase = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-900/30 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:border-red-500/50 dark:focus:ring-red-500/10";
  const chipBase = "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10";
  const navBtn = "h-9 px-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10";

  async function handleCourseSaveToggle(event: React.MouseEvent<HTMLButtonElement>, courseId: string) {
    event.preventDefault();
    event.stopPropagation();
    setSaveError("");

    if (sessionStatus === "loading") {
      return;
    }

    setPendingCourseId(courseId);
    try {
      if (savedCourseIds.has(courseId)) {
        await unsaveCourse(courseId);
      } else {
        await saveCourse(courseId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === UNAUTHORIZED_ERROR) {
        await signIn("google", { callbackUrl: `${pathname}${sp.toString() ? `?${sp.toString()}` : ""}` });
        return;
      }
      setSaveError(error instanceof Error ? error.message : "Could not save course.");
    } finally {
      setPendingCourseId(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-linear-to-b from-red-950/20 to-transparent dark:from-red-950/20 dark:to-transparent" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.02] dark:opacity-[0.015]" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:border-white/12 dark:bg-white/6 dark:text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
                {nf.format(total)} courses
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl">UIC Courses</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500 sm:text-base">Find the easiest classes and best professors using real grade distributions and enrollment data.</p>
          </div>
          <div className="sm:pt-1">
            <FeatureTour
              storageKey="uichicago-tour-courses-list-v1"
              buttonLabel="Take the 20-second tour"
              steps={[
                {
                  targetId: "courses-filters",
                  title: "Start with search and filters",
                  description: "Search by course code or title, then narrow the list by department, major, Gen Ed, or requirement type.",
                },
                {
                  targetId: "courses-sort",
                  title: "Swap the ranking direction",
                  description: "Use this toggle when you want to compare easiest-first versus hardest-first results.",
                },
                {
                  targetId: "courses-results",
                  title: "Open any course row",
                  description: "Each result takes you to a deeper course page with grade distributions, quick stats, and professor breakdowns.",
                },
              ]}
            />
          </div>
        </div>

        {/* Filters */}
        <div data-tour="courses-filters" className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-900/60 sm:p-6">
          <div className="relative mb-4">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input className={inputBase + " pl-10"} placeholder="Search by course title, code, or topic — try calculus or hash tables" value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Department</div>
              <select className={selectBase} value={dept || ""} onChange={(e) => setDept(e.target.value)}>
                <option value="">All departments</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Major</div>
              <select className={selectBase} value={major || ""} onChange={(e) => setMajor(e.target.value)}>
                <option value="">All majors</option>
                {[...majorRequirements].sort((a, b) => a.label.localeCompare(b.label)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Gen Ed</div>
              <select className={selectBase} value={gened ? genedCategory || "__ALL_GENEDS__" : ""} onChange={(e) => setGenEdCategory(e.target.value)}>
                <option value="">All courses</option>
                <option value="__ALL_GENEDS__">All Gen Eds</option>
                {genEdCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Library</div>
              <select className={selectBase} value={savedOnly ? "saved" : "all"} onChange={(e) => setSavedOnly(e.target.value === "saved")}>
                <option value="all">All courses</option>
                <option value="saved">Saved only</option>
              </select>
            </div>
            <div>
              <div className={"mb-1 text-[10px] font-bold uppercase tracking-widest " + (major ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-300 dark:text-zinc-700")}>Requirement Type</div>
              <select className={selectBase + (!major ? " opacity-40 cursor-not-allowed" : "")} value={majorCategory || ""} onChange={(e) => setMajorCategory(e.target.value)} disabled={!major}>
                <option value="">{major ? "All requirement types" : "Choose a major first"}</option>
                {majorCategories.map((cat) => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
              </select>
            </div>
          </div>

          {hasAnyFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 dark:border-white/5 pt-4">
              <span className="text-xs text-zinc-400 mr-1">Active:</span>
              {dept && <button className={chipBase} onClick={() => setDept("")}>Dept: <strong>{dept}</strong> <span className="text-zinc-400">×</span></button>}
              {q.trim() && <button className={chipBase} onClick={() => { setQDraft(""); pushWith({ q: null, page: "1" }); }}>Search: <strong>&quot;{q.trim()}&quot;</strong> <span className="text-zinc-400">×</span></button>}
              {major && <button className={chipBase} onClick={() => setMajor("")}>Major: <strong>{selectedMajor?.label}</strong> <span className="text-zinc-400">×</span></button>}
              {major && majorCategory && <button className={chipBase} onClick={() => setMajorCategory("")}>Req: <strong>{majorCategories.find((c) => c.key === majorCategory)?.label}</strong> <span className="text-zinc-400">×</span></button>}
              {savedOnly && <button className={chipBase} onClick={() => setSavedOnly(false)}>Saved only <span className="text-zinc-400">×</span></button>}
              {gened && <button className={chipBase} onClick={() => setGenEd(false)}>Gen Ed <span className="text-zinc-400">×</span></button>}
              {gened && genedCategory && <button className={chipBase} onClick={() => setGenEdCategory("")}>{genedCategory} <span className="text-zinc-400">×</span></button>}
              {sort !== "difficultyDesc" && <button className={chipBase} onClick={() => setSort("difficultyDesc")}>Sort: Hardest first <span className="text-zinc-400">×</span></button>}
              <button onClick={clearAll} className="ml-auto text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Clear all</button>
            </div>
          )}
          {saveError ? <div className="mt-4 text-sm text-red-500">{saveError}</div> : null}
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500 tabular-nums">
            Showing <span className="text-zinc-700 dark:text-zinc-300 font-medium">{effectiveTotal === 0 ? 0 : nf.format(start + 1)}–{nf.format(Math.min(start + pageSize, effectiveTotal))}</span> of <span className="text-zinc-700 dark:text-zinc-300 font-medium">{nf.format(effectiveTotal)}</span> courses
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button data-tour="courses-sort" onClick={() => setSort(sort === "difficultyDesc" ? "difficultyAsc" : "difficultyDesc")} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10">
              {sort === "difficultyDesc" ? <><span className="text-emerald-500">↓</span> Easiest first</> : <><span className="text-red-500">↑</span> Hardest first</>}
            </button>
            <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:overflow-visible">
              <button className={navBtn} onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>← Prev</button>
              <div className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
                Page {page} of {totalPages}
              </div>
              <button className={navBtn} onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          </div>
        </div>

        <div data-tour="courses-results" className="space-y-3 sm:hidden">
          {visibleCourses.map((c) => {
            const href = `/courses/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.number)}`;
            const ec = c.difficultyScore != null ? easinessConfig(c.difficultyScore) : null;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-red-900/20 dark:border-white/8 dark:bg-zinc-900/40 dark:hover:bg-white/4 dark:focus:ring-red-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      {c.subject} {c.number}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      {c.title || "Untitled"}
                    </div>
                  </div>
                  {c.isGenEd ? (
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                      Gen Ed
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Easiness</div>
                    <div className={`mt-1 text-sm font-bold ${ec ? ec.text : "text-zinc-400 dark:text-zinc-500"}`}>
                      {c.difficultyScore == null ? "No data" : c.difficultyScore.toFixed(2)}
                    </div>
                    {ec ? <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{ec.label}</div> : null}
                  </div>
                  <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Avg GPA</div>
                    <div className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {c.avgGpa == null ? "No data" : c.avgGpa.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{c.totalRegsAllTime == null ? "No enrollments" : `${nf.format(c.totalRegsAllTime)} enrollments`}</span>
                  {c.genEdCategory ? <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-white/10 dark:bg-white/4">{c.genEdCategory}</span> : null}
                  <SaveCourseButton
                    isSaved={savedCourseIds.has(c.id)}
                    pending={pendingCourseId === c.id}
                    error={pendingCourseId === c.id ? saveError : ""}
                    onToggle={(event) => handleCourseSaveToggle(event, c.id)}
                    compact
                  />
                </div>
              </div>
            );
          })}
          {visibleCourses.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm dark:border-white/8 dark:bg-zinc-900/40">
              <p className="text-zinc-400 text-sm">No courses found.</p>
              <button onClick={clearAll} className="mt-3 text-sm text-red-500 hover:text-red-400 dark:text-red-500 dark:hover:text-red-400 transition-colors font-medium">Clear all filters →</button>
            </div>
          )}
        </div>

        <div data-tour="courses-results" className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40 dark:shadow-black/40 sm:block">
          <div className="grid grid-cols-12 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:border-white/8 dark:bg-zinc-950/60 dark:text-zinc-600 sm:px-6">
            <div className="col-span-4">Course</div>
            <div className="col-span-3">Easiness</div>
            <div className="col-span-2 text-right">Avg GPA</div>
            <div className="col-span-2 text-right">Enrollments</div>
            <div className="col-span-1 text-right">Save</div>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-white/4">
            {visibleCourses.map((c) => {
              const href = `/courses/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.number)}`;
              const ec = c.difficultyScore != null ? easinessConfig(c.difficultyScore) : null;
              return (
                <li key={c.id} role="link" tabIndex={0} onClick={() => router.push(href)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(href); } }}
                  className="group grid cursor-pointer grid-cols-12 items-center px-4 py-4 transition-colors hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 dark:hover:bg-white/4 dark:focus:bg-white/4 sm:px-6">
                  <div className="col-span-4 min-w-0 pr-4">
                    <div className="text-sm font-bold text-zinc-900 group-hover:text-zinc-700 transition-colors sm:text-base dark:text-zinc-100 dark:group-hover:text-white">
                      {c.subject} {c.number}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-500">{c.title || "Untitled"}</div>
                  </div>
                  <div className="col-span-3">
                    {ec ? (
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ring-1 ${ec.bg} ${ec.text} ${ec.ring}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${ec.dot}`} />
                          {c.difficultyScore!.toFixed(2)}
                        </span>
                        <span className="hidden text-[10px] text-zinc-400 dark:text-zinc-600 sm:block">{ec.label}</span>
                      </div>
                    ) : <span className="text-xs text-zinc-300 dark:text-zinc-700">—</span>}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className="tabular-nums text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {c.avgGpa == null ? <span className="text-zinc-300 dark:text-zinc-700">—</span> : c.avgGpa.toFixed(2)}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className="tabular-nums text-sm text-zinc-500 dark:text-zinc-400">
                      {c.totalRegsAllTime == null ? <span className="text-zinc-300 dark:text-zinc-700">—</span> : nf.format(c.totalRegsAllTime)}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <SaveCourseButton
                      isSaved={savedCourseIds.has(c.id)}
                      pending={pendingCourseId === c.id}
                      error={pendingCourseId === c.id ? saveError : ""}
                      onToggle={(event) => handleCourseSaveToggle(event, c.id)}
                      compact
                    />
                  </div>
                </li>
              );
            })}
            {visibleCourses.length === 0 && (
              <li className="px-6 py-16 text-center">
                <p className="text-zinc-400 text-sm">No courses found.</p>
                <button onClick={clearAll} className="mt-3 text-sm text-red-500 hover:text-red-400 dark:text-red-500 dark:hover:text-red-400 transition-colors font-medium">Clear all filters →</button>
              </li>
            )}
          </ul>
        </div>

        <div className="mt-6 flex justify-center">
          <MissingCourseButton searchQuery={q.trim()} show />
        </div>

      </div>

      <SiteFooter className="mt-12" />
    </main>
  );
}
