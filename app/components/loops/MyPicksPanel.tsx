"use client";

import Link from "next/link";
import { Bookmark, ChevronRight, GraduationCap, Sparkles, Users } from "lucide-react";
import { useSavedItems } from "@/app/hooks/useSavedItems";

type MyPicksPanelProps = {
  className?: string;
};

function buildComparisonPrompt(items: string[], kind: "courses" | "professors") {
  if (items.length < 2) return "";
  if (kind === "courses") {
    return `Compare ${items.slice(0, 3).join(", ")} for workload, GPA patterns, and which kind of UIC student each fits best.`;
  }
  return `Compare ${items.slice(0, 3).join(", ")} and tell me who seems best for learning, grading fairness, and overall fit.`;
}

export default function MyPicksPanel({ className = "" }: MyPicksPanelProps) {
  const { isAuthenticated, loading, saved } = useSavedItems();
  const totalSaved = saved.courses.length + saved.professors.length;

  if (!isAuthenticated || loading || totalSaved < 2) {
    return null;
  }

  const savedCourses = saved.courses.slice(0, 3);
  const savedProfessors = saved.professors.slice(0, 3);
  const courseComparePrompt = buildComparisonPrompt(
    savedCourses.map((course) => `${course.subject} ${course.number}`),
    "courses",
  );
  const professorComparePrompt = buildComparisonPrompt(
    savedProfessors.map((professor) => professor.name),
    "professors",
  );

  return (
    <section
      className={`rounded-[1.8rem] border border-indigo-400/20 bg-[linear-gradient(180deg,rgba(99,102,241,0.12),rgba(15,23,42,0.78))] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.24)] ${className}`.trim()}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200">My Picks unlocked</div>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-white">
            Your saved decisions are starting to connect.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100/80">
            Keep courses and professors together here, then use the quick actions below to compare, branch out, and keep the session going.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-200">
          <Bookmark className="h-3.5 w-3.5 text-indigo-200" />
          {saved.courses.length} saved course{saved.courses.length === 1 ? "" : "s"} • {saved.professors.length} saved professor{saved.professors.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1.15fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <GraduationCap className="h-3.5 w-3.5 text-indigo-300" />
            Saved courses
          </div>
          <div className="mt-4 space-y-3">
            {savedCourses.length ? (
              savedCourses.map((course) => {
                const code = `${course.subject} ${course.number}`;
                return (
                  <div key={course.id} className="rounded-xl border border-white/8 bg-white/4 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={course.href} className="text-sm font-semibold text-white transition hover:text-indigo-200">
                          {code}
                        </Link>
                        <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-400">{course.title}</div>
                      </div>
                      <Link
                        href={`/professors?q=${encodeURIComponent(code)}`}
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-200 transition hover:text-white"
                      >
                        Find professors
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3.5 py-4 text-sm text-slate-500">
                Save at least one course to start tying class choices into My School.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <Users className="h-3.5 w-3.5 text-indigo-300" />
            Saved professors
          </div>
          <div className="mt-4 space-y-3">
            {savedProfessors.length ? (
              savedProfessors.map((professor) => (
                <div key={professor.id} className="rounded-xl border border-white/8 bg-white/4 px-3.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={professor.href} className="text-sm font-semibold text-white transition hover:text-indigo-200">
                        {professor.name}
                      </Link>
                      <div className="mt-1 text-[12px] leading-5 text-slate-400">
                        {professor.department || professor.school || "UIC professor"}
                      </div>
                    </div>
                    <Link
                      href={professor.department ? `/professors?dept=${encodeURIComponent(professor.department)}` : professor.href}
                      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-200 transition hover:text-white"
                    >
                      {professor.department ? "More nearby" : "Open"}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3.5 py-4 text-sm text-slate-500">
                Save a few professors and My School will keep that shortlist together here.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
            Quick actions
          </div>
          <div className="mt-4 space-y-2.5">
            {courseComparePrompt ? (
              <Link
                href={`/chat?q=${encodeURIComponent(courseComparePrompt)}`}
                className="block rounded-xl border border-white/8 bg-white/4 px-3.5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
              >
                Compare saved courses with Sparky
                <div className="mt-1 text-[12px] font-normal leading-5 text-slate-400">
                  Turn your current shortlist into one recommendation.
                </div>
              </Link>
            ) : null}
            {professorComparePrompt ? (
              <Link
                href={`/chat?q=${encodeURIComponent(professorComparePrompt)}`}
                className="block rounded-xl border border-white/8 bg-white/4 px-3.5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
              >
                Compare saved professors with Sparky
                <div className="mt-1 text-[12px] font-normal leading-5 text-slate-400">
                  See who looks strongest for fit, fairness, and learning.
                </div>
              </Link>
            ) : null}
            <Link
              href="/study/planner"
              className="block rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3.5 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/14"
            >
              Open My School Planner
              <div className="mt-1 text-[12px] font-normal leading-5 text-indigo-100/70">
                Use your saved decisions as planning fuel instead of starting from scratch.
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
