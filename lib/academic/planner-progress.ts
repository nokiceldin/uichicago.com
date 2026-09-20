import type { AcademicRecord } from "./audit.ts";

type Course = { code: string; credits: number | null; status: "completed" | "in_progress" | "planned" };

/** Keep missing historical slots visible; never treat a display cutoff as completion. */
export function applyPlannerProgress<C extends Course, S extends { courses: C[]; totalHours: number | null }>(
  schedule: S[], record: AcademicRecord, startIndex: number, semesterCount: number, full: boolean,
) {
  const marked = schedule.map(semester => ({
    ...semester,
    courses: semester.courses.map(course => ({
      ...course,
      status: (record.completedCourses.includes(course.code) ? "completed"
        : record.currentCourses.includes(course.code) ? "in_progress" : "planned") as Course["status"],
    })),
  }));
  return {
    unscheduledRequirements: marked.slice(0, startIndex).flatMap(s => s.courses).filter(c => c.status === "planned"),
    semesters: marked.slice(startIndex, startIndex + semesterCount).map(semester => {
      const courses = full ? semester.courses : semester.courses.filter(c => c.status === "planned");
      return { ...semester, courses, totalHours: courses.every(c => c.credits !== null)
        ? courses.reduce((sum, c) => sum + (c.credits ?? 0), 0) : null };
    }),
  };
}
