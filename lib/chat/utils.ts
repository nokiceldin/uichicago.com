import fs from "fs";
import path from "path";
import { PROFESSOR_COURSE_MAP_FILE } from "@/lib/professors/course-map-config";

// ─── Professor course map ─────────────────────────────────────────────────────

export type ProfCoursesMap = Record<string, string[]>;
const globalForMap = globalThis as unknown as { __profCourseMap?: ProfCoursesMap };

export function getProfCourseMap(): ProfCoursesMap {
  if (globalForMap.__profCourseMap) return globalForMap.__profCourseMap;
  const raw = fs.readFileSync(
    path.join(process.cwd(), PROFESSOR_COURSE_MAP_FILE),
    "utf8"
  );
  return (globalForMap.__profCourseMap = JSON.parse(raw));
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

export function normName(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function mapKeyToDbName(key: string) {
  const s = (key || "").trim();
  if (s.includes(",")) {
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2)
      return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
  }
  return s;
}

// ─── Course label helpers ─────────────────────────────────────────────────────

export function courseLabel(item: string) {
  const t = (item || "").trim().toUpperCase();
  const m = t.match(/^([A-Z&]+)\s*\|?\s*(\d+[A-Z]?)\b/);
  if (m) return `${m[1]} ${m[2]}`;
  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) {
    const mm = `${pipe[0]} ${pipe[1]}`.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/);
    if (mm) return `${mm[1]} ${mm[2]}`;
  }
  return t;
}

export function courseTitle(item: string) {
  const pipe = (item || "").trim().split("|").map((x) => x.trim());
  return pipe.length >= 2 ? pipe.slice(1).join(" | ") : "";
}

// ─── GPA / difficulty helpers ─────────────────────────────────────────────────

export function calcGpa(a: number, b: number, c: number, d: number, f: number): number | null {
  const graded = a + b + c + d + f;
  if (!graded) return null;
  return +((a * 4 + b * 3 + c * 2 + d * 1) / graded).toFixed(2);
}

export function diffLabel(score: number | null | undefined): string {
  if (score == null || isNaN(score)) return "No data";
  if (score >= 4.5) return "Very Easy";
  if (score >= 3.5) return "Easy";
  if (score >= 2.5) return "Medium";
  if (score >= 1.5) return "Hard";
  return "Very Hard";
}
