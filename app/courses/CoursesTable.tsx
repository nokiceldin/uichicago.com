"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function easinessPillClass(v: number) {
  if (v >= 4.5)
    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-300/25";
  if (v >= 4.0)
    return "bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-400/15 dark:text-green-200 dark:ring-green-300/25";
  if (v >= 3.0)
    return "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-400/15 dark:text-yellow-200 dark:ring-yellow-300/25";
  return "bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-400/15 dark:text-red-200 dark:ring-red-300/25";
}

type CourseRow = {
  id: string;
  subject: string;
  number: string;
  title: string | null;
  difficultyScore: number | null;
  avgGpa: number | null;
  totalRegsAllTime: number | null;
  isGenEd: boolean;
  genEdCategory: string | null;
};

function getPageButtons(current: number, total: number) {
  const maxButtons = 3;
  if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1);

  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;

  if (end > total) {
    end = total;
    start = end - maxButtons + 1;
  }
  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

export default function CoursesTable({
  courses,
  total,
  page,
  pageSize,
  sort,
  dept,
  q,
  subjects,
  gened,
  genedCategory,
}: {
  courses: CourseRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: "difficultyDesc" | "difficultyAsc";
  dept: string;
  q: string;
  subjects: string[];
  gened: boolean;
  genedCategory: string;
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
      if (val == null || val === "") params.delete(key);
      else params.set(key, val);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPage(nextPage: number) {
    pushWith({ page: String(nextPage) });
  }

  function setSort(nextSort: "difficultyDesc" | "difficultyAsc") {
    pushWith({ sort: nextSort, page: "1" });
  }

  function setDept(nextDept: string) {
    pushWith({ dept: nextDept || null, page: "1" });
  }

  function setGenEd(nextGenEd: boolean) {
    pushWith({
      gened: nextGenEd ? "1" : null,
      genedCategory: nextGenEd ? genedCategory || null : null,
      page: "1",
    });
  }

  function setGenEdCategory(nextCategory: string) {
    pushWith({
      gened: "1",
      genedCategory: nextCategory || null,
      page: "1",
    });
  }

  function applySearch() {
    const trimmed = qDraft.trim();
    pushWith({ q: trimmed ? trimmed : null, page: "1" });
  }

  function clearAll() {
    router.push(`${pathname}?sort=difficultyDesc&page=1`);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const genEdCategories = [
    "Analyzing the Natural World",
    "Understanding the Individual and Society",
    "Understanding the Past",
    "Understanding the Creative Arts",
    "Exploring World Cultures",
    "Understanding U.S. Society",
  ];
  const start = (page - 1) * pageSize;
  const pageButtons = useMemo(() => getPageButtons(page, totalPages), [page, totalPages]);
  const middle = pageButtons.filter((n) => n !== 1 && n !== totalPages);

  const baseBtn =
    "h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 " +
    "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:hover:bg-zinc-900/40";

  const primaryPill =
    "h-10 rounded-2xl border border-zinc-300 bg-zinc-100 px-4 text-sm font-semibold text-zinc-900 " +
    "ring-2 ring-zinc-200 shadow-sm " +
    "dark:border-white/20 dark:bg-white/10 dark:text-zinc-100 dark:ring-white/15";

  const pill =
    "h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 " +
    "dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10";

  function pageBtnClass(active: boolean) {
    return (
      baseBtn +
      " min-w-10 px-3 tabular-nums flex items-center justify-center " +
      (active
        ? " pointer-events-none opacity-100 border-white/25 bg-white/10 text-white dark:border-white/25 dark:bg-white/10 dark:text-white"
        : "")
    );
  }

  const inputBase =
    "h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-900 outline-none " +
    "placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 " +
    "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-white/10";

  const selectBase =
    "h-12 w-full cursor-pointer rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-900 outline-none " +
    "focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 " +
    "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:focus:ring-white/10";

  const panel =
    "mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg " +
    "dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl dark:backdrop-blur";

  const chip =
    "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/40 px-3 py-1 text-xs font-semibold " +
    "text-zinc-700 hover:bg-white/60 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10";

  const pillValue =
    "inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11.5px] font-semibold text-zinc-800 " +
    "dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 tabular-nums";

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 dark:bg-gradient-to-b dark:from-white/5 dark:to-transparent" />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-3xl border border-zinc-200 bg-white/70 p-6 shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <img src="/logo.png" alt="UICProf Logo" className="h-10 w-10 object-contain" />
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.01em]">UIC Courses</h1>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Browse course difficulty and GPA using real enrollment weighted data
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={panel}>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-full flex-col gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Search
                </div>

                <div className="flex gap-2">
                  <input
                    className={inputBase}
                    placeholder="Search course title or code like CS 211"
                    value={qDraft}
                    onChange={(e) => setQDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applySearch();
                    }}
                  />

                  <button
                    type="button"
                    className={pill + " h-10 px-5"}
                    onClick={applySearch}
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Department
                </div>

                <select
                  className={selectBase}
                  value={dept || ""}
                  onChange={(e) => setDept(e.target.value)}
                >
                  <option value="">All departments</option>

                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-auto">
                <button
                  type="button"
                  className={pill + " w-full"}
                  onClick={clearAll}
                >
                  Clear filters
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Gen Ed
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className={gened ? primaryPill : pill}
                    onClick={() => setGenEd(true)}
                  >
                    Gen Ed only
                  </button>

                  <button
                    type="button"
                    className={!gened ? primaryPill : pill}
                    onClick={() => setGenEd(false)}
                  >
                    All courses
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Gen Ed Category
                </div>

                <select
                  className={
                    selectBase + (!gened ? " opacity-50 cursor-not-allowed" : "")
                  }
                  value={genedCategory || ""}
                  onChange={(e) => setGenEdCategory(e.target.value)}
                  disabled={!gened}
                >
                  <option value="">All Gen Ed categories</option>

                  {genEdCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Sort
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className={sort === "difficultyDesc" ? primaryPill : pill}
                    onClick={() => setSort("difficultyDesc")}
                  >
                    Easiest first
                  </button>

                  <button
                    type="button"
                    className={sort === "difficultyAsc" ? primaryPill : pill}
                    onClick={() => setSort("difficultyAsc")}
                  >
                    Hardest first
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {dept ? (
              <button type="button" className={chip} onClick={() => setDept("")}>
                Dept: <span className="font-bold">{dept}</span> <span className="opacity-70">x</span>
              </button>
            ) : null}

            {q.trim() ? (
              <button
                type="button"
                className={chip}
                onClick={() => {
                  setQDraft("");
                  pushWith({ q: null, page: "1" });
                }}
              >
                Search: <span className="font-bold">"{q.trim()}"</span> <span className="opacity-70">x</span>
              </button>
            ) : null}

            {sort !== "difficultyDesc" ? (
              <button type="button" className={chip} onClick={() => setSort("difficultyDesc")}>
                Sort: <span className="font-bold">Hardest</span> <span className="opacity-70">x</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="tabular-nums text-zinc-600 dark:text-zinc-300">
            Showing {nf.format(start + 1)} to {nf.format(Math.min(start + pageSize, total))} of {nf.format(total)}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={baseBtn}
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Prev
            </button>

            <button type="button" className={pageBtnClass(page === 1)} onClick={() => setPage(1)}>
              1
            </button>

            {middle.length > 0 && middle[0] > 2 ? (
              <span className="px-1 text-zinc-500 dark:text-zinc-400">...</span>
            ) : null}

            {middle.map((n) => (
              <button key={n} type="button" className={pageBtnClass(page === n)} onClick={() => setPage(n)}>
                {n}
              </button>
            ))}

            {totalPages > 1 ? (
              <>
                {middle.length > 0 && middle[middle.length - 1] < totalPages - 1 ? (
                  <span className="px-1 text-zinc-500 dark:text-zinc-400">...</span>
                ) : null}

                <button
                  type="button"
                  className={pageBtnClass(page === totalPages)}
                  onClick={() => setPage(totalPages)}
                >
                  {totalPages}
                </button>
              </>
            ) : null}

            <button
              type="button"
              className={baseBtn}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-xl dark:backdrop-blur">
          <div className="max-h-[70vh] overflow-auto">
            <div className="sticky top-0 z-10 grid grid-cols-12 border-b border-zinc-200 bg-white px-5 py-3 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300 dark:backdrop-blur">
              <div className="col-span-5">Course</div>
              <div className="col-span-3">Easiness</div>
              <div className="col-span-2 text-right">Avg GPA</div>
              <div className="col-span-2 text-right">Total regs</div>
            </div>

            <ul>
              {courses.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-12 items-center border-b border-zinc-100 px-5 py-4 text-sm transition hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="col-span-5">
                    <Link
                      href={`/courses/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.number)}`}
                      className="group block"
                    >
                      <div className="text-base font-semibold tracking-tight text-zinc-900 group-hover:underline dark:text-zinc-100">
                        {c.subject} {c.number}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        {c.title || "Untitled"}
                      </div>
                    </Link>
                  </div>

                  <div className="col-span-3">
                    {typeof c.difficultyScore === "number" ? (
                      <span
                        className={[
                          "inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                          easinessPillClass(c.difficultyScore),
                        ].join(" ")}
                      >
                        {c.difficultyScore.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">No data</span>
                    )}
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <span className={pillValue}>{c.avgGpa == null ? "No data" : c.avgGpa.toFixed(2)}</span>
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <span className={pillValue}>
                      {c.totalRegsAllTime == null ? "0" : nf.format(c.totalRegsAllTime)}
                    </span>
                  </div>
                </li>
              ))}

              {courses.length === 0 ? (
                <li className="px-5 py-10 text-sm text-zinc-600 dark:text-zinc-400">
                  No results. Try clearing filters.
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <footer className="mt-12 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          <p>Independent student built project. Not affiliated with UIC.</p>
        </footer>
      </div>
    </main>
  );
}