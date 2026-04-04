"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SavedItemsPayload } from "@/lib/saved-items";

const EMPTY_SAVED: SavedItemsPayload = {
  professors: [],
  courses: [],
};

const UNAUTHORIZED_ERROR = "UNAUTHORIZED";

async function requestWithAuthRetry(input: RequestInfo | URL, init?: RequestInit) {
  const first = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });

  if (first.status !== 401) {
    return first;
  }

  const sessionResponse = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const sessionPayload = await sessionResponse.json().catch(() => null);
  const hasSession = Boolean(sessionPayload?.user);

  if (!hasSession) {
    return first;
  }

  return fetch(input, {
    credentials: "same-origin",
    ...init,
  });
}

type SaveProfessorInput = {
  professorSlug: string;
  professorName: string;
  department?: string;
  school?: string;
  note?: string;
};

export function useSavedItems() {
  const { status } = useSession();
  const [saved, setSaved] = useState<SavedItemsPayload>(EMPTY_SAVED);
  const [loading, setLoading] = useState(status === "authenticated");

  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setSaved(EMPTY_SAVED);
      setLoading(false);
      return EMPTY_SAVED;
    }

    setLoading(true);
    try {
      const response = await requestWithAuthRetry("/api/saved-items", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) {
        setSaved(EMPTY_SAVED);
        return EMPTY_SAVED;
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load saved items.");
      }
      const nextSaved = payload?.saved ?? EMPTY_SAVED;
      setSaved(nextSaved);
      return nextSaved;
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveProfessor = useCallback(async (input: SaveProfessorInput) => {
    const response = await requestWithAuthRetry("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "professor",
        ...input,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      throw new Error(UNAUTHORIZED_ERROR);
    }
    if (!response.ok) {
      throw new Error(payload?.error || "Could not save professor.");
    }
    const nextSaved = payload?.saved ?? EMPTY_SAVED;
    setSaved(nextSaved);
    return nextSaved;
  }, []);

  const unsaveProfessor = useCallback(async (professorSlug: string) => {
    const response = await requestWithAuthRetry("/api/saved-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "professor",
        professorSlug,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      throw new Error(UNAUTHORIZED_ERROR);
    }
    if (!response.ok) {
      throw new Error(payload?.error || "Could not remove professor.");
    }
    const nextSaved = payload?.saved ?? EMPTY_SAVED;
    setSaved(nextSaved);
    return nextSaved;
  }, []);

  const saveCourse = useCallback(async (courseId: string) => {
    const response = await requestWithAuthRetry("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "course",
        courseId,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      throw new Error(UNAUTHORIZED_ERROR);
    }
    if (!response.ok) {
      throw new Error(payload?.error || "Could not save course.");
    }
    const nextSaved = payload?.saved ?? EMPTY_SAVED;
    setSaved(nextSaved);
    return nextSaved;
  }, []);

  const unsaveCourse = useCallback(async (courseId: string) => {
    const response = await requestWithAuthRetry("/api/saved-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "course",
        courseId,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      throw new Error(UNAUTHORIZED_ERROR);
    }
    if (!response.ok) {
      throw new Error(payload?.error || "Could not remove course.");
    }
    const nextSaved = payload?.saved ?? EMPTY_SAVED;
    setSaved(nextSaved);
    return nextSaved;
  }, []);

  const savedProfessorSlugs = useMemo(
    () => new Set(saved.professors.map((entry) => entry.slug)),
    [saved.professors],
  );
  const savedProfessorNotes = useMemo(
    () => new Map(saved.professors.map((entry) => [entry.slug, entry.note])),
    [saved.professors],
  );
  const savedCourseIds = useMemo(
    () => new Set(saved.courses.map((entry) => entry.courseId)),
    [saved.courses],
  );

  return {
    saved,
    loading,
    sessionStatus: status,
    refresh,
    saveProfessor,
    unsaveProfessor,
    saveCourse,
    unsaveCourse,
    savedProfessorSlugs,
    savedProfessorNotes,
    savedCourseIds,
    isAuthenticated: status === "authenticated",
  };
}

export { UNAUTHORIZED_ERROR };
