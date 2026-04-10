"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProfessorResult = {
  id: string;
  slug: string;
  name: string;
  department: string;
  school: string;
  quality: number;
  ratingsCount: number;
  isRated?: boolean;
  url: string;
};

type CourseResult = {
  id: string;
  subject: string;
  number: string;
  title: string;
  avgGpa: number | null;
  difficultyScore: number | null;
  totalRegsAllTime: number;
  href: string;
};

export default function HeroSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [professors, setProfessors] = useState<ProfessorResult[]>([]);
  const [courses, setCourses] = useState<CourseResult[]>([]);

  const trimmed = query.trim();

  const topResult = useMemo(() => {
    if (courses.length > 0) return courses[0];
    if (professors.length > 0) return professors[0];
    return null;
  }, [courses, professors]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!trimmed) {
      setProfessors([]);
      setCourses([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);

        const [profRes, courseRes] = await Promise.all([
          fetch(
            `/api/professors?q=${encodeURIComponent(trimmed)}&page=1&pageSize=3&sort=best&dept=All&minRatings=0&minStars=0`,
            { signal: controller.signal }
          ),
          fetch(
            `/api/courses?q=${encodeURIComponent(trimmed)}&page=1&pageSize=3`,
            { signal: controller.signal }
          ),
        ]);

        const [profJson, courseJson] = await Promise.all([
          profRes.json(),
          courseRes.json(),
        ]);

        setProfessors(Array.isArray(profJson.items) ? profJson.items : []);
        setCourses(Array.isArray(courseJson.items) ? courseJson.items : []);
        setOpen(true);
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.error(err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed]);

  function goTo(path: string) {
    setOpen(false);
    router.push(path);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    if (topResult) {
      if ("href" in topResult) {
        goTo(topResult.href);
        return;
      }
      goTo(`/professors/${topResult.slug}`);
      return;
    }
    router.push(`/courses?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={compact ? "h-4 w-4" : "h-5 w-5"}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <circle cx="11" cy="11" r="6.5" />
            </svg>
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (trimmed) setOpen(true); }}
            placeholder={compact ? "Search professors or courses…" : "Search by professor, course code, or title"}
            className={`w-full rounded-xl border border-zinc-200 bg-white/95 pl-9 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-emerald-400 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${
              compact
                ? "h-9 pr-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-md focus:ring-2 focus:ring-emerald-100 dark:border-white/12 dark:bg-white/4.5 dark:hover:border-white/16 dark:focus:ring-emerald-400/10"
                : "h-14 pr-28 text-[15px] shadow-lg focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-400/10"
            }`}
          />

          {!compact && (
            <button
              type="submit"
              className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Search
            </button>
          )}
        </div>
      </form>

      {!compact && (
        <div className="mt-2 px-1 text-left text-xs text-zinc-500 dark:text-zinc-400">
          Try: CS 211, Calculus, or Shavila Devi
        </div>
      )}

      {open && trimmed ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          {loading ? (
            <div className="px-4 py-4 text-sm text-zinc-500 dark:text-zinc-400">
              Searching...
            </div>
          ) : professors.length === 0 && courses.length === 0 ? (
            <div className="px-4 py-4 text-sm text-zinc-500 dark:text-zinc-400">
              No matches found
            </div>
          ) : (
            <div className="max-h-[380px] overflow-auto py-2">
              {courses.length > 0 && (
                <div>
                  <div className="px-4 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Courses
                  </div>
                  {courses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => goTo(course.href)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {course.subject} {course.number}
                        </div>
                        <div className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                          {course.title}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                        Course
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {professors.length > 0 && (
                <div className={courses.length > 0 ? "border-t border-zinc-200 pt-2 dark:border-white/10" : ""}>
                  <div className="px-4 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Professors
                  </div>
                  {professors.map((prof) => (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => goTo(`/professors/${prof.slug}`)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {prof.name}
                        </div>
                        <div className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                          {prof.department}
                          {prof.ratingsCount ? ` • ${prof.ratingsCount} reviews` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                          prof.isRated || prof.ratingsCount > 0
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20"
                            : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10"
                        }`}>
                          {prof.isRated || prof.ratingsCount > 0
                            ? (Number(prof.quality) || 0).toFixed(1)
                            : "NR"}
                        </div>
                        <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                          Professor
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
