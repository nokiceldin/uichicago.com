"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SavedItemsPayload } from "@/lib/saved-items";
import { captureProductEvent } from "@/app/lib/product-analytics";
import { PRODUCT_EVENT_NAMES } from "@/lib/analytics/product-events";

const EMPTY_SAVED: SavedItemsPayload = {
  professors: [],
  courses: [],
};

const UNAUTHORIZED_ERROR = "UNAUTHORIZED";
const LOCAL_SAVED_ITEMS_KEY = "uic-atlas-saved-items-v1";

function readLocalSaved(): SavedItemsPayload {
  if (typeof window === "undefined") return EMPTY_SAVED;
  try {
    const value = JSON.parse(window.localStorage.getItem(LOCAL_SAVED_ITEMS_KEY) ?? "null");
    return { professors: Array.isArray(value?.professors) ? value.professors : [], courses: Array.isArray(value?.courses) ? value.courses : [] };
  } catch { return EMPTY_SAVED; }
}

function writeLocalSaved(saved: SavedItemsPayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_SAVED_ITEMS_KEY, JSON.stringify(saved));
}

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
      const local = readLocalSaved();
      setSaved(local);
      setLoading(false);
      return local;
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
    if (status !== "authenticated") {
      const current = readLocalSaved();
      const entry = { id: `local-professor:${input.professorSlug}`, slug: input.professorSlug, name: input.professorName, department: input.department ?? "", school: input.school ?? "", note: input.note ?? null, href: `/professors/${encodeURIComponent(input.professorSlug)}`, createdAt: new Date().toISOString() };
      const next = { ...current, professors: [entry, ...current.professors.filter(item => item.slug !== input.professorSlug)] };
      writeLocalSaved(next);
      setSaved(next);
      captureProductEvent(PRODUCT_EVENT_NAMES.favoriteProfessor, {
        professor_slug: input.professorSlug,
        department: input.department || null,
        is_authenticated: false,
      });
      return next;
    }
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
    captureProductEvent(PRODUCT_EVENT_NAMES.favoriteProfessor, {
      professor_slug: input.professorSlug,
      department: input.department || null,
      is_authenticated: true,
    });
    return nextSaved;
  }, [status]);

  const unsaveProfessor = useCallback(async (professorSlug: string) => {
    if (status !== "authenticated") {
      const current = readLocalSaved(); const next = { ...current, professors: current.professors.filter(item => item.slug !== professorSlug) };
      writeLocalSaved(next); setSaved(next); return next;
    }
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
  }, [status]);

  const saveCourse = useCallback(async (courseId: string) => {
    if (status !== "authenticated") {
      const current = readLocalSaved();
      // The list card may not have course metadata; keep the stable course ID so
      // its saved state persists locally. Signed-in saves enrich it on sync.
      const entry = { id: `local-course:${courseId}`, courseId, subject: "", number: "", title: "Saved course", href: "/courses", createdAt: new Date().toISOString() };
      const next = { ...current, courses: [entry, ...current.courses.filter(item => item.courseId !== courseId)] };
      writeLocalSaved(next); setSaved(next); return next;
    }
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
  }, [status]);

  const unsaveCourse = useCallback(async (courseId: string) => {
    if (status !== "authenticated") {
      const current = readLocalSaved(); const next = { ...current, courses: current.courses.filter(item => item.courseId !== courseId) };
      writeLocalSaved(next); setSaved(next); return next;
    }
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
  }, [status]);

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
