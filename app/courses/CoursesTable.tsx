"use client";

import Link from "next/link";
import { majorRequirements } from "@/lib/majorRequirements";
import { useEffect, useMemo, useState } from "react";
import MissingCourseButton from "@/app/components/MissingCourseButton";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

function getPageButtons(current: number, total: number) {
  const maxButtons = 3;
  if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;
  if (end > total) { end = total; start = end - maxButtons + 1; }
  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

export default function CoursesTable({ courses, total, page, pageSize, sort, dept, q, subjects, gened, genedCategory, major, majorCategory }: {
  courses: CourseRow[]; total: number; page: number; pageSize: number;
  sort: "difficultyDesc" | "difficultyAsc"; dept: string; q: string; subjects: string[];
  gened: boolean; genedCategory: string; major: string; majorCategory: string;
}) {
  const nf = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [qDraft, setQDraft] = useState(q);

  function pushWith(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const key of Object.keys(next)) {
      const val = next[key];
      if (val == null || val === "") params.delete(key); else params.set(key, val);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const trimmed = qDraft.trim();
    const current = (q || "").trim();
    const timeout = setTimeout(() => {
      if (trimmed === current) return;
      pushWith({ q: trimmed ? trimmed : null, page: "1" });
    }, 300);
    return () => clearTimeout(timeout);
  }, [qDraft, q]);

  function setPage(n: number) { pushWith({ page: String(n) }); }
  function setSort(s: "difficultyDesc" | "difficultyAsc") { pushWith({ sort: s, page: "1" }); }
  function setMajor(m: string) { pushWith({ major: m || null, majorCategory: null, page: "1" }); }
  function setMajorCategory(c: string) { pushWith({ major: major || null, majorCategory: c || null, page: "1" }); }
  function setDept(d: string) { pushWith({ dept: d || null, page: "1" }); }
  function setGenEd(v: boolean) { pushWith({ gened: v ? "1" : null, genedCategory: v ? genedCategory || null : null, page: "1" }); }
  function setGenEdCategory(c: string) {
    if (!c) { pushWith({ gened: null, genedCategory: null, page: "1" }); return; }
    if (c === "__ALL_GENEDS__") { pushWith({ gened: "1", genedCategory: null, page: "1" }); return; }
    pushWith({ gened: "1", genedCategory: c, page: "1" });
  }
  function clearAll() { setQDraft(""); router.push(`${pathname}?sort=difficultyDesc&page=1`); }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const genEdCategories = ["Analyzing the Natural World","Understanding the Individual and Society","Understanding the Past","Understanding the Creative Arts","Exploring World Cultures","Understanding U.S. Society"];
  const start = (page - 1) * pageSize;
  const pageButtons = useMemo(() => getPageButtons(page, totalPages), [page, totalPages]);
  const middle = pageButtons.filter((n) => n !== 1 && n !== totalPages);
  const selectedMajor = majorRequirements.find((m) => m.key === major);
  const majorCategories = selectedMajor?.categories ?? [];
  const hasAnyFilters = !!q.trim() || !!dept || gened || !!genedCategory || !!major || !!majorCategory || sort !== "difficultyDesc";

  const selectBase = "h-9 w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-900/30 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-red-500/50 dark:focus:ring-red-500/10";
  const inputBase = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-900/30 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:border-red-500/50 dark:focus:ring-red-500/10";
  const chipBase = "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10";
  const navBtn = "h-9 px-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10";
  const pageBtn = (active: boolean) => "h-9 min-w-9 px-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center tabular-nums " + (active ? "border-zinc-300 bg-zinc-100 text-zinc-900 pointer-events-none dark:border-white/12 dark:bg-white/10 dark:text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10");

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-red-950/20 to-transparent dark:from-red-950/20 dark:to-transparent" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.02] dark:opacity-[0.015]" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
              {nf.format(total)} courses
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl">UIC Courses</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500 sm:text-base">Find the easiest classes and best professors using real grade distributions and enrollment data.</p>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-900/60 sm:p-6">
          <div className="relative mb-4">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input className={inputBase + " pl-10"} placeholder="Search by course title or code — try CS 211" value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              {gened && <button className={chipBase} onClick={() => setGenEd(false)}>Gen Ed <span className="text-zinc-400">×</span></button>}
              {gened && genedCategory && <button className={chipBase} onClick={() => setGenEdCategory("")}>{genedCategory} <span className="text-zinc-400">×</span></button>}
              {sort !== "difficultyDesc" && <button className={chipBase} onClick={() => setSort("difficultyDesc")}>Sort: Hardest first <span className="text-zinc-400">×</span></button>}
              <button onClick={clearAll} className="ml-auto text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Clear all</button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500 tabular-nums">
            Showing <span className="text-zinc-700 dark:text-zinc-300 font-medium">{nf.format(start + 1)}–{nf.format(Math.min(start + pageSize, total))}</span> of <span className="text-zinc-700 dark:text-zinc-300 font-medium">{nf.format(total)}</span> courses
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setSort(sort === "difficultyDesc" ? "difficultyAsc" : "difficultyDesc")} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10">
              {sort === "difficultyDesc" ? <><span className="text-emerald-500">↓</span> Easiest first</> : <><span className="text-red-500">↑</span> Hardest first</>}
            </button>
            <button className={navBtn} onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>← Prev</button>
            <button className={pageBtn(page === 1)} onClick={() => setPage(1)}>1</button>
            {middle.length > 0 && middle[0] > 2 && <span className="text-zinc-400 text-sm">…</span>}
            {middle.map((n) => <button key={n} className={pageBtn(page === n)} onClick={() => setPage(n)}>{n}</button>)}
            {totalPages > 1 && (
              <>
                {middle.length > 0 && middle[middle.length - 1] < totalPages - 1 && <span className="text-zinc-400 text-sm">…</span>}
                <button className={pageBtn(page === totalPages)} onClick={() => setPage(totalPages)}>{totalPages}</button>
              </>
            )}
            <button className={navBtn} onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next →</button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40 dark:shadow-black/40">
          <div className="grid grid-cols-12 border-b border-zinc-100 bg-zinc-50 px-4 sm:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:border-white/8 dark:bg-zinc-950/60 dark:text-zinc-600">
            <div className="col-span-5">Course</div>
            <div className="col-span-3">Easiness</div>
            <div className="col-span-2 text-right">Avg GPA</div>
            <div className="col-span-2 text-right">Enrollments</div>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
            {courses.map((c) => {
              const href = `/courses/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.number)}`;
              const ec = c.difficultyScore != null ? easinessConfig(c.difficultyScore) : null;
              return (
                <li key={c.id} role="link" tabIndex={0} onClick={() => router.push(href)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(href); } }}
                  className="group grid cursor-pointer grid-cols-12 items-center px-4 sm:px-6 py-4 transition-colors hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 dark:hover:bg-white/[0.04] dark:focus:bg-white/[0.04]">
                  <div className="col-span-5 min-w-0 pr-4">
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
                </li>
              );
            })}
            {courses.length === 0 && (
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

        <footer className="mt-12 border-t border-zinc-100 dark:border-white/8 pt-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
          <p>Contact: <a href="mailto:uicratings@gmail.com" className="hover:text-red-400 dark:hover:text-red-400 transition-colors">uicratings@gmail.com</a></p>
          <p className="mt-1">Not affiliated with UIC or RMP.</p>
        </footer>
      </div>
    </main>
  );
}
