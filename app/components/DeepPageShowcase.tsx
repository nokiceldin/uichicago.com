"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const coursePreviews = [
  {
    code: "CS 211",
    slug: "/courses/CS/211",
    title: "Programming Practicum",
    department: "Computer Science",
    avgGpa: "2.59",
    passRate: "86.6%",
    easiness: "1.70 easiness",
    graded: "2,935 graded",
    accent: "emerald",
    ring: "bg-[conic-gradient(#5bc98c_0_33%,#67c86d_33%_60%,#f0c646_60%_79%,#ef8d3d_79%_86%,#eb5d5d_86%_93%,#a4aec1_93%_100%)]",
  },
  {
    code: "BIOS 110",
    slug: "/courses/BIOS/110",
    title: "Biology of Cells and Organisms",
    department: "Biological Sciences",
    avgGpa: "2.88",
    passRate: "89.4%",
    easiness: "2.05 easiness",
    graded: "4,102 graded",
    accent: "sky",
    ring: "bg-[conic-gradient(#5bc98c_0_28%,#67c86d_28%_58%,#f0c646_58%_80%,#ef8d3d_80%_89%,#eb5d5d_89%_95%,#a4aec1_95%_100%)]",
  },
  {
    code: "ACTG 210",
    slug: "/courses/ACTG/210",
    title: "Introduction to Financial Accounting",
    department: "Accounting",
    avgGpa: "3.12",
    passRate: "92.1%",
    easiness: "2.84 easiness",
    graded: "1,764 graded",
    accent: "amber",
    ring: "bg-[conic-gradient(#5bc98c_0_37%,#67c86d_37%_66%,#f0c646_66%_84%,#ef8d3d_84%_91%,#eb5d5d_91%_96%,#a4aec1_96%_100%)]",
  },
  {
    code: "PSCH 100",
    slug: "/courses/PSCH/100",
    title: "Introduction to Psychology",
    department: "Psychology",
    avgGpa: "3.29",
    passRate: "94.8%",
    easiness: "3.46 easiness",
    graded: "5,418 graded",
    accent: "pink",
    ring: "bg-[conic-gradient(#5bc98c_0_42%,#67c86d_42%_73%,#f0c646_73%_87%,#ef8d3d_87%_93%,#eb5d5d_93%_97%,#a4aec1_97%_100%)]",
  },
];

const professorPreviews = [
  {
    name: "Shavila Devi",
    slug: "/professors/shavila-devi-mathematics",
    department: "Mathematics",
    rating: "4.8",
    meta: ["140 reviews", "MATH 125 + MATH 160", "#6 overall"],
  },
  {
    name: "Andriy Bodnaruk",
    slug: "/professors/andriy-bodnaruk-finance",
    department: "Finance",
    rating: "5.0",
    meta: ["32 reviews", "FIN 396 + FIN 419", "#15 overall"],
  },
  {
    name: "Eric Leshikar",
    slug: "/professors/eric-leshikar-psychology",
    department: "Psychology",
    rating: "4.8",
    meta: ["68 reviews", "PSCH 396 + PSCH 397", "#14 overall"],
  },
  {
    name: "Andrea Bassett",
    slug: "/professors/andrea-bassett-biological-sciences",
    department: "Biological Sciences",
    rating: "4.7",
    meta: ["108 reviews", "BIOS 325 + BIOS 326", "#24 overall"],
  },
  {
    name: "Neel Patel",
    slug: "/professors/neel-patel-accounting",
    department: "Accounting",
    rating: "4.8",
    meta: ["48 reviews", "ACTG 211 + ACTG 396", "#35 overall"],
  },
];

export default function DeepPageShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeCourseIndex = activeIndex % coursePreviews.length;
  const activeProfessorIndex = activeIndex % professorPreviews.length;
  const activeCourse = coursePreviews[activeCourseIndex];
  const activeProfessor = professorPreviews[activeProfessorIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % Math.max(coursePreviews.length, professorPreviews.length));
    }, 3400);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Link
        href={activeCourse.slug}
        className="premium-card premium-fade-up group relative overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-5 transition duration-300 hover:border-emerald-400/35 hover:shadow-xl dark:border-white/10 dark:bg-zinc-950"
      >
        <div className={`absolute inset-x-0 top-0 h-24 ${
          activeCourse.accent === "emerald"
            ? "bg-gradient-to-b from-emerald-500/18 via-emerald-500/7 to-transparent"
            : activeCourse.accent === "sky"
            ? "bg-gradient-to-b from-sky-500/18 via-sky-500/7 to-transparent"
            : activeCourse.accent === "amber"
            ? "bg-gradient-to-b from-amber-500/18 via-amber-500/7 to-transparent"
            : "bg-gradient-to-b from-pink-500/18 via-pink-500/7 to-transparent"
        }`} />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Course Page</div>
            <div className="flex gap-1.5">
              {coursePreviews.map((preview, index) => (
                <span
                  key={preview.code}
                  className={`h-1.5 w-1.5 rounded-full transition-all ${
                    index === activeCourseIndex
                      ? activeCourse.accent === "emerald"
                        ? "bg-emerald-400"
                        : activeCourse.accent === "sky"
                        ? "bg-sky-400"
                        : activeCourse.accent === "amber"
                        ? "bg-amber-400"
                        : "bg-pink-400"
                      : "bg-zinc-400/35"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-bold tracking-[-0.03em] text-zinc-950 dark:text-white">{activeCourse.code}</div>
              <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{activeCourse.title}</div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
                {activeCourse.department}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white/85 px-3 py-2 dark:border-white/8 dark:bg-white/[0.04]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Avg GPA</div>
              <div className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">{activeCourse.avgGpa}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-5">
            <div className="relative h-32 w-32 shrink-0 rounded-full border border-zinc-200 bg-white/80 dark:border-white/8 dark:bg-white/[0.03]">
              <div className={`absolute inset-3 rounded-full ${activeCourse.ring}`} />
              <div className="absolute inset-[1.95rem] flex items-center justify-center rounded-full bg-zinc-50 text-center dark:bg-zinc-950">
                <div className="px-1">
                  <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-500">Pass rate</div>
                  <div className="mt-1 text-[0.9rem] font-bold leading-none text-zinc-950 dark:text-white">{activeCourse.passRate}</div>
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white/85 px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Snapshot</div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Grade distribution</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white/85 px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">By instructor</div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Professor outcomes</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-200">
                  {activeCourse.easiness}
                </span>
                <span className="rounded-full border border-zinc-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-200">
                  {activeCourse.graded}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-950 transition group-hover:gap-3 dark:text-white">
                Open course page
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </Link>

      <Link
        href={activeProfessor.slug}
        className="premium-card premium-fade-up group relative overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-5 transition duration-300 hover:border-sky-400/35 hover:shadow-xl dark:border-white/10 dark:bg-zinc-950"
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-500/18 via-sky-500/7 to-transparent" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Professor Page</div>
            <div className="flex gap-1.5">
              {professorPreviews.map((preview, index) => (
                <span
                  key={preview.name}
                  className={`h-1.5 w-1.5 rounded-full transition-all ${index === activeProfessorIndex ? "bg-sky-400" : "bg-zinc-400/35"}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[1.4rem] border border-zinc-200 bg-white/85 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.05)] transition duration-300 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-none">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400 text-2xl font-bold text-emerald-950">
                {activeProfessor.rating}
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold tracking-[-0.03em] text-zinc-950 transition-all dark:text-white">
                  {activeProfessor.name}
                </div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{activeProfessor.department}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeProfessor.meta.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-white/8 dark:text-zinc-300"
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-[1rem] border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700 dark:border-white/8 dark:bg-black/20 dark:text-zinc-200">
                Rating
              </div>
              <div className="rounded-[1rem] border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700 dark:border-white/8 dark:bg-black/20 dark:text-zinc-200">
                Classes taught
              </div>
              <div className="rounded-[1rem] border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700 dark:border-white/8 dark:bg-black/20 dark:text-zinc-200">
                Review context
              </div>
            </div>
          </div>

          <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-950 transition group-hover:gap-3 dark:text-white">
            Open professor page
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </div>
      </Link>
    </div>
  );
}
