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

  const [departments, setDepartments] = useState<string[]>([]);
  const [minRatings, setMinRatings] = useState(0);
  const [minStars, setMinStars] = useState(0);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageButtons = useMemo(() => getPageButtons(page, totalPages), [page, totalPages]);

  const baseBtn =
    "h-10 rounded-xl border border-zinc-200 bg-white px-3 sm:px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:hover:bg-zinc-900/40";

  function pageBtnClass(active: boolean) {
    return (
      baseBtn +
      " min-w-9 sm:min-w-10 px-2.5 sm:px-3 tabular-nums flex items-center justify-center " +
      (active
        ? " pointer-events-none disabled:opacity-100 opacity-100 border-white/25 bg-white/10 text-white dark:border-white/25 dark:bg-white/10 dark:text-white"
        : "")
    );
  }

  const middle = pageButtons.filter((n) => n !== 1 && n !== totalPages);
  const start = (page - 1) * pageSize;

  const inputBase =
  "h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none " +
  "placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 " +
  "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-white/10";

  const selectBase =
  "h-9 w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none " +
  "focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 " +
  "dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:focus:ring-white/10";

  const panel =
  "mt-4 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 shadow-md " +
  "dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-lg dark:backdrop-blur";

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/40 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-white/60 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10";

  const btn =
    "h-11 sm:h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10";

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
  }, [query, dept, minRatings, minStars, page, sort]);

  const hasAnyFilters =
    query.trim() ||
    dept !== "All" ||
    minRatings !== 0 ||
    minStars !== 0 ||
    sort !== "best";

  function clearAll() {
    setQuery("");
    setDept("All");
    setMinRatings(0);
    setMinStars(0);
    setSort("best");
    setPage(1);
  }

  return (
    <main className="relative min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-white/60 to-transparent dark:from-white/5" />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 sm:p-5 shadow-md backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <img
                src="/logo.png"
                alt="UIC Professors Logo"
                className="h-8 w-8 object-contain sm:h-10 sm:w-10"
              />

              <div>
                <h1 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em] leading-tight">
                  UIC Professors
                </h1>

                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Find the best UIC professors by department, rating, and review count
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={panel}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            <div className="col-span-2">
              <div className="mb-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                Search
              </div>
              <input
                className={inputBase}
                placeholder="Search professor name..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div>
              <div className="mb-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
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

            <div>
              <div className="mb-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
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
              <div className="mb-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                Sort by rating
              </div>
              <select
                className={selectBase}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as "best" | "worst" | "most");
                  setPage(1);
                }}
              >
                <option value="best">High to low</option>
                <option value="worst">Low to high</option>
                <option value="most">Most ratings</option>
              </select>
            </div>

            <div className="col-span-1">
              <div className="mb-0.5 flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                <span>Minimum reviews</span>
                <span className="tabular-nums">{minRatings}</span>
              </div>

              <div className="flex h-9 items-center rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950/40">
                <div className="w-full px-3">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={minRatings}
                    onChange={(e) => {
                      setMinRatings(Number(e.target.value));
                      setPage(1);
                    }}
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

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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

            {hasAnyFilters ? (
  <button
    onClick={clearAll}
    className="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-zinc-100"
  >
    Clear all
  </button>
) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
          <div className="max-h-[80vh] overflow-auto">
            <div className="min-w-[640px]">
              <div className="sticky top-0 z-10 grid grid-cols-12 border-b border-zinc-200 bg-white px-3 py-3 text-[11px] font-semibold text-zinc-700 sm:px-5 sm:text-xs dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300 dark:backdrop-blur">
                <div className="col-span-5 sm:col-span-4">Professor</div>
                <div className="hidden sm:block sm:col-span-3">Department</div>
                <div className="col-span-4 sm:col-span-3">Classes</div>
                <div className="col-span-1 text-right sm:col-span-1">Rating</div>
                <div className="col-span-1 text-right sm:col-span-1">View</div>
              </div>

              <ul>
                {data.map((p, idx) => (
                  <li
                    key={p.slug}
                    className="grid grid-cols-12 items-center border-b border-zinc-100 px-3 py-4 text-sm transition hover:bg-zinc-50 sm:px-5 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <div className="col-span-5 sm:col-span-4">
                      <div className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {start + idx + 1}.{" "}
                        <Link href={`/professors/${p.slug}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">{p.school}</div>
                    </div>

                    <div className="hidden sm:block sm:col-span-3">
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
                        {p.department}
                      </span>
                    </div>

                    <div className="col-span-4 sm:col-span-3">
                      <ClassesCell profName={p.name} map={courseMap} />
                    </div>

                    <div className="col-span-1 text-right">
                      <span
                        className={`inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold sm:gap-2 sm:px-3 sm:text-sm ${
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
                        <span className="hidden tabular-nums text-[10px] font-semibold opacity-80 sm:inline sm:text-xs">
                          ({Number(p.ratingsCount) || 0})
                        </span>
                      </span>
                    </div>

                    <div className="col-span-1 text-right">
                      <a
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-300 bg-white px-2 py-2 text-[10px] font-semibold text-zinc-900 hover:bg-zinc-50 sm:px-3 sm:text-xs dark:border-white/10 dark:bg-white/90 dark:text-zinc-900 dark:hover:bg-white"
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
                          Try clearing filters, lowering minimum reviews, or adjusting your search.
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
      </div>

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        Contact: uicratings@gmail.com
          <br />
          Not affiliated with UIC or RMP.
      </footer>
    </main>
  );
}