"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";

type SaveCourseButtonProps = {
  isSaved: boolean;
  pending?: boolean;
  error?: string;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  compact?: boolean;
};

export default function SaveCourseButton({ isSaved, pending = false, error, onToggle, compact = false }: SaveCourseButtonProps) {
  const baseClass = compact
    ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition"
    : "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition";
  const toneClass = isSaved
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={`${baseClass} ${toneClass} disabled:cursor-not-allowed disabled:opacity-70`}
      aria-label={isSaved ? "Saved course" : "Save course"}
      title={error || (isSaved ? "Saved course" : "Save course")}
    >
      {pending ? <Bookmark className="h-4 w-4 animate-pulse" /> : isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </button>
  );
}
