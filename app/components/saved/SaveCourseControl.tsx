"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import SaveCourseButton from "@/app/components/saved/SaveCourseButton";
import { useSavedItems } from "@/app/hooks/useSavedItems";

type SaveCourseControlProps = {
  course: {
    id: string;
    subject?: string;
    number?: string;
    title?: string;
  };
  compact?: boolean;
};

export default function SaveCourseControl({ course, compact = false }: SaveCourseControlProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const callbackUrl = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const { isAuthenticated, savedCourseIds, saveCourse, unsaveCourse } = useSavedItems();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const isSaved = savedCourseIds.has(course.id);

  async function handleToggle(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      await signIn("google", { callbackUrl });
      return;
    }

    setPending(true);
    setError("");
    try {
      if (isSaved) {
        await unsaveCourse(course.id);
      } else {
        await saveCourse(course.id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save course.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <SaveCourseButton
        isSaved={isSaved}
        pending={pending}
        error={error}
        onToggle={handleToggle}
        compact={compact}
      />
      {isSaved && course.subject && course.number ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            Saved in My School
          </span>
          <Link
            href={`/professors?q=${encodeURIComponent(`${course.subject} ${course.number}`)}`}
            className="font-semibold text-zinc-700 transition hover:text-emerald-600 dark:text-zinc-200 dark:hover:text-emerald-300"
          >
            Find professors →
          </Link>
          <Link
            href="/study"
            className="font-semibold text-zinc-700 transition hover:text-emerald-600 dark:text-zinc-200 dark:hover:text-emerald-300"
          >
            Open My School →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
