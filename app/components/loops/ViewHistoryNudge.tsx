"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";

type ViewHistoryItem = {
  key: string;
  title: string;
  href: string;
  group?: string;
};

type ViewHistoryNudgeProps = {
  kind: "course" | "professor";
  item: ViewHistoryItem;
  comparePrompt: string;
};

const STORAGE_KEYS = {
  course: "uichicago-viewed-courses-v1",
  professor: "uichicago-viewed-professors-v1",
} as const;

function readHistory(kind: "course" | "professor") {
  if (typeof window === "undefined") return [] as ViewHistoryItem[];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[kind]);
    const parsed = raw ? (JSON.parse(raw) as ViewHistoryItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(kind: "course" | "professor", items: ViewHistoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(items));
}

function recordAndReadHistory(kind: "course" | "professor", item: ViewHistoryItem) {
  const current = readHistory(kind);
  const next = [item, ...current.filter((entry) => entry.key !== item.key)].slice(0, 8);
  writeHistory(kind, next);
  return next;
}

export default function ViewHistoryNudge({ kind, item, comparePrompt }: ViewHistoryNudgeProps) {
  const [history] = useState<ViewHistoryItem[]>(() => recordAndReadHistory(kind, item));

  const comparableItems = useMemo(() => {
    if (kind === "course") {
      return history.slice(0, 3);
    }
    return history.filter((entry) => entry.group && entry.group === item.group).slice(0, 3);
  }, [history, item.group, kind]);

  if ((kind === "course" && comparableItems.length < 3) || (kind === "professor" && comparableItems.length < 2)) {
    return null;
  }

  return (
    <section className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50/85 p-4 shadow-sm dark:border-white/8 dark:bg-white/[0.035] sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-300">
              {kind === "course" ? "Shortlist" : "Compare"}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
              {kind === "course"
                ? "These courses are worth comparing."
                : `${item.group || "These"} professors are worth deciding between.`}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/study"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/6 dark:text-zinc-100 dark:hover:bg-white/10"
            >
              Open My School
            </Link>
            <Link
              href={`/chat?q=${encodeURIComponent(comparePrompt)}`}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-500/14 dark:text-indigo-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask Sparky
            </Link>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {comparableItems.map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              className="group rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/70 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/9"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white">{entry.key}</div>
                  <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{entry.title}</div>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
