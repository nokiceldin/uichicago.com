"use client";

import { useEffect, useState } from "react";
import { normalizeProfName } from "@/app/lib/name";
import { PROFESSOR_COURSE_MAP_PUBLIC_PATH } from "@/lib/professors/course-map-config";

type ProfToCourses = Record<string, string[]>;

export function useProfCoursesMap() {
  const [map, setMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(PROFESSOR_COURSE_MAP_PUBLIC_PATH);
      const data: ProfToCourses = await res.json();

      const normalized: Record<string, string[]> = {};
      for (const [key, courses] of Object.entries(data)) {
        normalized[normalizeProfName(key)] = courses;
      }

      if (!cancelled) setMap(normalized);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}
