"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import SaveCourseButton from "@/app/components/saved/SaveCourseButton";
import { useSavedItems } from "@/app/hooks/useSavedItems";

type SaveCourseControlProps = {
  course: {
    id: string;
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
    <SaveCourseButton
      isSaved={isSaved}
      pending={pending}
      error={error}
      onToggle={handleToggle}
      compact={compact}
    />
  );
}
