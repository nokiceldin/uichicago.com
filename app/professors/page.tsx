"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfCoursesMap } from "@/app/hooks/useProfCoursesMap";
import { ClassesCell } from "@/app/components/ClassesCell";
import Link from "next/link";
import MissingProfessorButton from "@/app/components/MissingProfessorButton";

type Prof = {
  name: string;
  department: string;
  school: string;
  quality: number;
  ratingsCount: number;
  wouldTakeAgain: number | null;
  difficulty: number;
  url: string;
  slug: string;
};

export default function Page() {
  const courseMap = useProfCoursesMap();

  const [sort, setSort] = useState<"best" | "worst" | "most">("best");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Prof[]>([]);
  const [total, setTotal] = useState(0);

  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("");
  const [dept, setDept] = useState("All");

function getPageButtons(current: number, total: number) {
  const maxButtons = 3;

  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;

  if (end > total) {
    end = total;
    start = end - maxButtons + 1;
  }

  return Array.from({ length: maxButtons }, (_, i) => start + i);
}



  // course autocomplete
function formatCourseLabel(s: string) {
  const t = (s || "").trim();

  const m = t.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;

  const pipeParts = t.split("|").map((x) => x.trim());
  if (pipeParts.length >= 2) return `${pipeParts[0]} ${pipeParts[1]}`;

  return t;
}

const allCourseLabels = useMemo(() => {
  if (!courseMap) return [];

  const set = new Set<string>();
  for (const arr of Object.values(courseMap)) {
    for (const raw of arr || []) {
      const label = formatCourseLabel(raw);
      const key = label.toUpperCase().replace(/\s+/g, " ").trim();
      if (key) set.add(key);
    }
  }

  return Array.from(set).sort();
}, [courseMap]);

const [courseOpen, setCourseOpen] = useState(false);
const [courseActive, setCourseActive] = useState(0);

const courseSuggestions = useMemo(() => {
  const typed = course.toUpperCase().trim();
  if (!typed) return [];

  // allow "CS301" to match "CS 301"
  const typedLoose = typed.replace(/\s+/g, "");
  const typedTight = typed.replace(/[^A-Z0-9&]/g, ""); // removes spaces + weird chars

  const out: string[] = [];
  for (const label of allCourseLabels) {
    const labelLoose = label.replace(/\s+/g, "");
    const labelTight = label.replace(/[^A-Z0-9&]/g, "");

    if (
      label.includes(typed) ||
      labelLoose.includes(typedLoose) ||
      labelTight.includes(typedTight)
    ) {
      out.push(label);
    }

    if (out.length >= 12) break;
  }

  return out;
}, [course, allCourseLabels]);


useEffect(() => {
  if (!courseSuggestions.length) setCourseOpen(false);
  setCourseActive(0);
}, [courseSuggestions.length]);

useEffect(() => {
  function onDocDown(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    if (el.closest("[data-course-autocomplete-root]")) return;
    setCourseOpen(false);
  }
  document.addEventListener("mousedown", onDocDown);
  return () => document.removeEventListener("mousedown", onDocDown);
}, []);


  const [departments, setDepartments] = useState<string[]>([]);

  const [minRatings, setMinRatings] = useState(0);
  const [minStars, setMinStars] = useState(0);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
const pageButtons = useMemo(() => getPageButtons(page, totalPages), [page, totalPages]);

const baseBtn =
  "h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:hover:bg-zinc-900/40";

function pageBtnClass(active: boolean) {
  return (
  baseBtn +
  " min-w-10 px-3 tabular-nums flex items-center justify-center " +
  (active
    ? " pointer-events-none disabled:opacity-100 opacity-100 border-white/25 bg-white/10 text-white dark:border-white/25 dark:bg-white/10 dark:text-white"
    : "")
);
}



const middle = pageButtons.filter((n) => n !== 1 && n !== totalPages);


  const start = (page - 1) * pageSize;

const inputBase =
  "h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 " +
  "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-white/10";

const selectBase =
  "h-12 w-full cursor-pointer rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 " +
  "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:focus:ring-white/10";

const panel =
  "mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg " +
  "dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl dark:backdrop-blur";


  const chip =
    "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/40 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-white/60 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10";

  const btn =
  "h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10";

  useEffect(() => {
    fetch("/api/departments")
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text);
        return JSON.parse(text);
      })
      .then((d) => setDepartments(Array.isArray(d) ? d : []))
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("dept", dept);
    params.set("minRatings", String(minRatings));
    params.set("minStars", String(minStars));
    params.set("sort", sort);

    const qTrim = query.trim();
    if (qTrim) params.set("q", qTrim);

    const cTrim = course.trim();
    if (cTrim) params.set("course", cTrim);

    fetch(`/api/professors?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text);
        return JSON.parse(text);
      })
      .then((res) => {
        setData(res.items || []);
        setTotal(res.total || 0);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") console.error(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query, dept, minRatings, minStars, page, sort, course]);

  const hasAnyFilters =
    query.trim() ||
    course.trim() ||
    dept !== "All" ||
    minRatings !== 0 ||
    minStars !== 0 ||
    sort !== "best";

  function clearAll() {
    setQuery("");
    setCourse("");
    setDept("All");
    setMinRatings(0);
    setMinStars(0);
    setSort("best");
    setPage(1);
  }

  return (
<main className="relative min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"> <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-white/60 to-transparent dark:from-white/5" />     <div className="mx-auto max-w-6xl px-5 py-10">
<div className="rounded-3xl border border-zinc-200 bg-white/70 p-6 shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-xl">  <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
    
    <div className="flex items-start gap-4">
  <img
    src="/logo.png"
    alt="UIC Professors Logo"
    className="h-10 w-10 object-contain"
  />

  <div>
    <h1 className="text-4xl font-semibold tracking-[-0.01em]">
      UIC Professors
    </h1>

    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
      Explore professors by class, department, and ratings to plan your schedule confidently
    </p>
  </div>
</div>

    
  </div>
</div>

        <div className={panel}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Search
                </div>
                <input
                  className={inputBase}
                  placeholder="Search professor name or department..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Department
                </div>
                <select
                  className={selectBase}
                  value={dept}
                  onChange={(e) => {
                    setDept(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="All">All departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Class
                </div>
                <div data-course-autocomplete-root className="relative">
  <input
    className={inputBase}
    placeholder="Filter by class (ex: CS 301)"
    value={course}
    onFocus={() => {
      if (courseSuggestions.length) setCourseOpen(true);
    }}
    onChange={(e) => {
      const v = e.target.value.toUpperCase().replace(/\s+/g, " ");
      setCourse(v);
      setPage(1);
      if (v.trim()) setCourseOpen(true);
    }}
    onKeyDown={(e) => {
      if (!courseOpen && courseSuggestions.length) {
        if (e.key === "ArrowDown") setCourseOpen(true);
      }

      if (!courseOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCourseActive((i) => Math.min(i + 1, courseSuggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCourseActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const pick = courseSuggestions[courseActive];
        if (pick) {
          e.preventDefault();
          setCourse(pick);
          setPage(1);
          setCourseOpen(false);
        }
      } else if (e.key === "Escape") {
        setCourseOpen(false);
      }
    }}
  />

  {courseOpen && courseSuggestions.length > 0 && (
    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-white/10 bg-white/90 shadow-xl backdrop-blur dark:bg-zinc-950/80">
      <div className="max-h-64 overflow-auto p-1">
        {courseSuggestions.map((label, i) => (
          <button
            key={label}
            type="button"
            onMouseEnter={() => setCourseActive(i)}
            onClick={() => {
              setCourse(label);
              setPage(1);
              setCourseOpen(false);
            }}
            className={[
              "w-full rounded-xl px-3 py-2 text-left text-sm",
              i === courseActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                : "text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )}
</div>

                
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  <span>Minimum reviews</span>
                  <span className="tabular-nums">{minRatings}</span>
                </div>

<div className="flex h-12 items-center rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950/40">
  <div className="px-4 w-full">
    <input
      type="range"
      min={0}
      max={200}
      step={5}
      value={minRatings}
      onChange={(e) => setMinRatings(Number(e.target.value))}
      className="w-full"
    />
  </div>
</div>


                <div className="mt-1 flex justify-between px-4 text-[11px] text-zinc-500 dark:text-zinc-400">

  <span>0</span>
  <span>50</span>
  <span>100</span>
  <span>150</span>
  <span>200+</span>
</div>


              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Min rating
              </div>
              <select
                className={selectBase}
                value={minStars}
                onChange={(e) => {
                  setMinStars(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={0}>Any</option>
                <option value={3}>3.0+</option>
                <option value={3.5}>3.5+</option>
                <option value={4}>4.0+</option>
                <option value={4.5}>4.5+</option>
                <option value={4.8}>4.8+</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Sort by rating
              </div>
              <select
                className={selectBase}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as any);
                  setPage(1);
                }}
              >
                <option value="best">High to low</option>
                <option value="worst">Low to high</option>
                <option value="most">Most ratings</option>
              </select>
            </div>

            <div className="flex items-end">
              <button className={btn + " w-full"} onClick={clearAll} disabled={!hasAnyFilters}>
                Clear filters
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {course.trim() ? (
              <button className={chip} onClick={() => (setCourse(""), setPage(1))}>
                Class: <span className="font-bold">{course.trim()}</span> <span className="opacity-70">x</span>
              </button>
            ) : null}

            {dept !== "All" ? (
              <button className={chip} onClick={() => (setDept("All"), setPage(1))}>
                Dept: <span className="font-bold">{dept}</span> <span className="opacity-70">x</span>
              </button>
            ) : null}

            {minStars !== 0 ? (
              <button className={chip} onClick={() => (setMinStars(0), setPage(1))}>
                Min rating: <span className="font-bold">{minStars.toFixed(1)}+</span>{" "}
                <span className="opacity-70">x</span>
              </button>
            ) : null}

            {minRatings !== 0 ? (
              <button className={chip} onClick={() => (setMinRatings(0), setPage(1))}>
                Min reviews: <span className="font-bold">{minRatings}+</span> <span className="opacity-70">x</span>
              </button>
            ) : null}

            {query.trim() ? (
              <button className={chip} onClick={() => (setQuery(""), setPage(1))}>
                Search: <span className="font-bold">"{query.trim()}"</span> <span className="opacity-70">x</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
          <div className="text-zinc-600 tabular-nums dark:text-zinc-300">
            Showing {start + 1} to {Math.min(start + pageSize, total)} of {total}
            {loading ? <span className="ml-2 opacity-70">Loading...</span> : null}
          </div>

          <div className="flex items-center gap-2">
  <button
    className={baseBtn}
    onClick={() => setPage((p) => Math.max(1, p - 1))}
    disabled={page === 1 || loading}
  >
    Prev
  </button>

<button
  className={pageBtnClass(page === 1)}
  onClick={() => setPage(1)}
  disabled={loading}
  aria-current={page === 1 ? "page" : undefined}
>
  1
</button>


  {middle.length > 0 && middle[0] > 2 ? (
    <span className="px-1 text-zinc-500 dark:text-zinc-400">...</span>
  ) : null}

  {middle.map((n) => (
  <button
  key={n}
  className={pageBtnClass(page === n)}
  onClick={() => setPage(n)}
  disabled={loading}
  aria-current={page === n ? "page" : undefined}
>
  {n}
</button>

  ))}

  {totalPages > 1 ? (
    <>
      {middle.length > 0 && middle[middle.length - 1] < totalPages - 1 ? (
        <span className="px-1 text-zinc-500 dark:text-zinc-400">...</span>
      ) : null}

      <button
        className={pageBtnClass(page === totalPages)}
        onClick={() => setPage(totalPages)}
        disabled={loading || page === totalPages}
      >
        {totalPages}
      </button>
    </>
  ) : null}

  <button
    className={baseBtn}
    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
    disabled={page === totalPages || loading}
  >
    Next
  </button>
</div>
</div>



<div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl dark:backdrop-blur">
          <div className="max-h-[70vh] overflow-auto">
<div className="sticky top-0 z-10 grid grid-cols-12 border-b border-zinc-200 bg-white px-5 py-3 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300 dark:backdrop-blur">
              <div className="col-span-4">Professor</div>
              <div className="col-span-3">Department</div>
              <div className="col-span-3">Classes</div>
              <div className="col-span-1 text-right">Rating</div>
              <div className="col-span-1 text-right">Link</div>
            </div>

            <ul>
              {data.map((p, idx) => (
                <li
                  key={p.slug}
className="grid grid-cols-12 items-center border-b border-zinc-100 px-5 py-4 text-sm transition hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="col-span-4">
                    <div className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {start + idx + 1}.{" "}
<Link
  href={`/professor/${p.slug}`}
  className="hover:underline"
>
  {p.name}
</Link>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{p.school}</div>
                  </div>

                  <div className="col-span-3">
                    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11.5px] font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
  {p.department}
</span>

                  </div>

                  <div className="col-span-3">
                    <ClassesCell
                      profName={p.name}
                      map={courseMap}
                      onPickCourse={(label) => {
                        setCourse(label);
                        setPage(1);
                      }}
                    />
                  </div>

                  <div className="col-span-1 text-right">
                    <span
                      className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
                        p.quality >= 4.5
                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-300/25"
                          : p.quality >= 4.0
                          ? "bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-400/15 dark:text-green-200 dark:ring-green-300/25"
                          : p.quality >= 3.0
                          ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-400/15 dark:text-yellow-200 dark:ring-yellow-300/25"
                          : "bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-400/15 dark:text-red-200 dark:ring-red-300/25"
                      }`}
                    >
                      <span className="tabular-nums">{(Number(p.quality) || 0).toFixed(1)}</span>
                      <span className="text-xs font-semibold opacity-80 tabular-nums">
                        ({Number(p.ratingsCount) || 0})
                      </span>
                    </span>
                  </div>

                  <div className="col-span-1 text-right">
                    <a
  className="inline-flex items-center justify-center rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/90 dark:text-zinc-900 dark:hover:bg-white"
  href={p.url}
  target="_blank"
  rel="noreferrer"
>
  View
</a>

                  </div>
                </li>
              ))}

              {!loading && data.length === 0 ? (
  <li className="px-5 py-10">
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-200">
      <div>
        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
          No results found
        </div>
        <div className="mt-1 text-zinc-600 dark:text-zinc-300">
          Try clearing filters, lowering minimum reviews, or adjusting the class filter.
        </div>
      </div>

      <MissingProfessorButton
        page="professors"
        searchQuery={query.trim()}
        show
      />
    </div>
  </li>
) : null}
            </ul>
          </div>
        </div>
      </div>
      <footer className="mt-12 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
  <p>
    Independent student-built project. Not affiliated with, endorsed by, or
    sponsored by the University of Illinois Chicago or RateMyProfessor.
  </p>
</footer>

    </main>
  );
  
}
