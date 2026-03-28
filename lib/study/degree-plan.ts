import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import { fetchCoursesByCodesRanked, fetchGenEdCourses } from "@/lib/chat/data";

export type DegreePlannerRequest = {
  major: string;
  majorSlug?: string;
  currentSemesterNumber?: number;
  planLength?: "one_semester" | "one_year" | "two_years" | "three_years" | "remaining" | "full";
  completedCourses?: string[];
  currentCourses?: string[];
  honorsStudent?: boolean;
};

export type DegreePlannerOption = {
  code: string;
  title: string;
  totalRegsAllTime: number;
};

export type DegreePlannerCourse = {
  slotId: string;
  code: string;
  title: string;
  credits: number | null;
  bucket: string;
  bucketLabel: string;
  kind: "required" | "elective";
  popularityReason: string | null;
  totalRegsAllTime: number | null;
  alternatives: DegreePlannerOption[];
  status: "completed" | "in_progress" | "planned";
};

export type DegreePlannerSemester = {
  id: string;
  label: string;
  year: string;
  semester: string;
  totalHours: number | null;
  courses: DegreePlannerCourse[];
};

export type DegreePlannerResult = {
  majorName: string;
  catalogUrl: string | null;
  planLengthLabel: string;
  inferredCompletedCourses: string[];
  completedCourses: string[];
  currentCourses: string[];
  semesters: DegreePlannerSemester[];
};

const ELECTIVE_LABELS: Record<string, string> = {
  science_elective: "Science elective",
  required_math: "Required math",
  gen_ed_any: "Gen Ed",
  gen_ed_individual_society: "Gen Ed: Individual and Society",
  gen_ed_past: "Gen Ed: Understanding the Past",
  gen_ed_world_cultures: "Gen Ed: World Cultures",
  technical_elective: "Technical elective",
  free_elective: "Free elective",
  humanities_elective: "Humanities / Social Science elective",
  elective_general: "Major elective",
  major_elective: "Major elective",
  global_biz: "Global business perspectives",
  math_elective: "Math elective",
};

type MajorIndexEntry = {
  name: string;
  file: string;
  slug: string;
  url?: string;
  hasSchedule?: boolean;
};

type RankedCourse = {
  subject: string;
  number: string;
  title: string;
  totalRegsAllTime?: number | null;
};

function isHonorsCourse(course: RankedCourse) {
  const subject = (course.subject ?? "").toUpperCase();
  const title = (course.title ?? "").toLowerCase();
  return subject === "HON" || title.includes("honors");
}

type MajorData = {
  name: string;
  url?: string;
  totalHours?: number;
  sampleSchedule?: Array<{
    year?: string;
    semester?: string;
    label?: string;
    total_hours?: number;
    courses?: Array<{
      code?: string | null;
      title?: string | null;
      hours?: number | null;
      isElective?: boolean;
      electiveType?: string | null;
    }>;
  }>;
  scienceElectives?: { options?: Array<{ code: string; title?: string }>; totalHours?: number };
  requiredMath?: { options?: Array<{ code: string; title?: string }>; totalHours?: number };
  technicalElectives?: { options?: Array<{ code: string; title?: string }>; totalHours?: number };
  requiredEngineering?: { courses?: Array<{ code: string; title?: string; hours?: number | null }> };
};

function loadMajorIndex(): MajorIndexEntry[] {
  const indexPath = join(process.cwd(), "public/data/uic-knowledge/majors/_index.json");
  const raw = JSON.parse(readFileSync(indexPath, "utf8"));
  return Array.isArray(raw.majors) ? raw.majors : [];
}

function loadMajorData(file: string): MajorData {
  return JSON.parse(readFileSync(join(process.cwd(), "public/data/uic-knowledge", file), "utf8"));
}

function normalizeCourseCode(code: string) {
  return code.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeCourseCodeList(codes?: string[]) {
  return Array.from(new Set((codes ?? []).map(normalizeCourseCode).filter(Boolean)));
}

function normalizeMajorText(value: string) {
  return value
    .toLowerCase()
    .replace(/[•/(),]/g, " ")
    .replace(/\bwith a major\b/g, "")
    .replace(/\bjoint bs\/ms\b/g, "")
    .replace(/\bjoint degrees with ba\b/g, "")
    .replace(/\bbs\/ms\b/g, "")
    .replace(/\bbs\b/g, "")
    .replace(/\bba\b/g, "")
    .replace(/\bbfa\b/g, "")
    .replace(/\bbmus\b/g, "")
    .replace(/\bms\b/g, "")
    .replace(/\bmajor\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function majorAliases(value: string) {
  const normalized = normalizeMajorText(value);
  const aliases = new Set<string>([normalized]);

  if (normalized === "cs" || normalized === "computer science") {
    aliases.add("computer science");
    aliases.add("cs");
  }

  if (normalized === "ece" || normalized === "electrical engineering" || normalized === "electrical and computer engineering") {
    aliases.add("ece");
    aliases.add("electrical engineering");
    aliases.add("electrical and computer engineering");
  }

  if (normalized === "ids" || normalized === "information and decision sciences") {
    aliases.add("ids");
    aliases.add("information and decision sciences");
  }

  return Array.from(aliases).filter(Boolean);
}

function isStandardUndergradMajor(entry: MajorIndexEntry) {
  return /-\s*(bs|ba|bfa|bmus)$/i.test(entry.name);
}

function scoreMajorMatch(input: string, entry: MajorIndexEntry) {
  const aliases = majorAliases(input);
  const normalizedName = normalizeMajorText(entry.name);
  const normalizedSlug = normalizeMajorText(entry.slug.replace(/-/g, " "));
  const haystacks = [normalizedName, normalizedSlug];

  for (const alias of aliases) {
    if (haystacks.some((haystack) => haystack === alias)) {
      return 400;
    }
  }

  for (const alias of aliases) {
    if (alias.length <= 3) {
      const aliasRegex = new RegExp(`(^|\\s)${alias}(\\s|$)`, "i");
      if (haystacks.some((haystack) => aliasRegex.test(haystack))) {
        return 320;
      }
      continue;
    }

    if (haystacks.some((haystack) => haystack.startsWith(alias))) {
      return 280;
    }

    if (haystacks.some((haystack) => haystack.includes(alias))) {
      return 240;
    }
  }

  const aliasWords = aliases.flatMap((alias) => alias.split(/\s+/).filter((word) => word.length > 2));
  if (aliasWords.length && haystacks.some((haystack) => aliasWords.every((word) => haystack.includes(word)))) {
    return 180;
  }

  return 0;
}

function findMajor(input: string) {
  const entries = loadMajorIndex();
  const best = entries
    .map((entry) => ({
      entry,
      score: scoreMajorMatch(input, entry),
      standardBonus: isStandardUndergradMajor(entry) ? 1 : 0,
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.standardBonus - a.standardBonus ||
      Number(Boolean(b.entry.hasSchedule)) - Number(Boolean(a.entry.hasSchedule)),
    )[0];

  if (!best || best.score === 0) return null;
  return best.entry;
}

function findMajorBySlug(slug?: string | null) {
  if (!slug) return null;
  return loadMajorIndex().find((entry) => entry.slug === slug) ?? null;
}

function planLengthToSemesterCount(planLength: DegreePlannerRequest["planLength"], totalSemesters: number, startIndex: number) {
  switch (planLength) {
    case "one_semester":
      return 1;
    case "one_year":
      return 2;
    case "two_years":
      return 4;
    case "three_years":
      return 6;
    case "full":
      return totalSemesters;
    case "remaining":
    default:
      return Math.max(totalSemesters - startIndex, 0);
  }
}

function planLengthLabel(planLength: DegreePlannerRequest["planLength"], count: number) {
  switch (planLength) {
    case "one_semester":
      return "Next semester";
    case "one_year":
      return "Next year";
    case "two_years":
      return "Next two years";
    case "three_years":
      return "Next three years";
    case "full":
      return "Full plan";
    case "remaining":
    default:
      return count === 1 ? "Remaining semester" : "Remaining plan";
  }
}

function buildPopularityReason(bucketLabel: string, totalRegsAllTime: number | null) {
  if (!totalRegsAllTime) {
    return `Picked as a common ${bucketLabel.toLowerCase()} option from the current catalog data.`;
  }
  return `Picked as the most common ${bucketLabel.toLowerCase()} option in our data (${totalRegsAllTime.toLocaleString()} registrations).`;
}

async function rankCoursesByPopularity(courseCodes: string[]) {
  const ranked = await fetchCoursesByCodesRanked(courseCodes, true).catch(() => []);
  return ranked
    .slice()
    .sort((a, b) => (b.totalRegsAllTime ?? 0) - (a.totalRegsAllTime ?? 0));
}

async function buildElectivePools(major: MajorData): Promise<Record<string, RankedCourse[]>> {
  const scienceCodes = (major.scienceElectives?.options ?? []).map((option) => option.code).filter(Boolean);
  const mathCodes = (major.requiredMath?.options ?? []).map((option) => option.code).filter(Boolean);
  const technicalCodes = (major.technicalElectives?.options ?? []).map((option) => option.code).filter(Boolean);
  const majorElectiveCodes = (major.requiredEngineering?.courses ?? [])
    .filter((course) => course.hours == null)
    .map((course) => course.code ?? "")
    .filter(Boolean);

  const [science, math, technical, genEd, genEdSociety, genEdPast, genEdWorldCultures, majorElectives] = await Promise.all([
    scienceCodes.length ? rankCoursesByPopularity(scienceCodes) : Promise.resolve([]),
    mathCodes.length ? rankCoursesByPopularity(mathCodes) : Promise.resolve([]),
    technicalCodes.length ? rankCoursesByPopularity(technicalCodes) : Promise.resolve([]),
    fetchGenEdCourses(null, 60).then((courses) => courses.slice().sort((a, b) => (b.totalRegsAllTime ?? 0) - (a.totalRegsAllTime ?? 0))).catch(() => []),
    fetchGenEdCourses("individual and society", 30).then((courses) => courses.slice().sort((a, b) => (b.totalRegsAllTime ?? 0) - (a.totalRegsAllTime ?? 0))).catch(() => []),
    fetchGenEdCourses("past", 30).then((courses) => courses.slice().sort((a, b) => (b.totalRegsAllTime ?? 0) - (a.totalRegsAllTime ?? 0))).catch(() => []),
    fetchGenEdCourses("world cultures", 30).then((courses) => courses.slice().sort((a, b) => (b.totalRegsAllTime ?? 0) - (a.totalRegsAllTime ?? 0))).catch(() => []),
    majorElectiveCodes.length ? rankCoursesByPopularity(majorElectiveCodes) : Promise.resolve([]),
  ]);

  return {
    science_elective: science,
    required_math: math,
    technical_elective: technical.length ? technical : majorElectives,
    gen_ed_any: genEd,
    gen_ed_individual_society: genEdSociety.length ? genEdSociety : genEd,
    gen_ed_past: genEdPast.length ? genEdPast : genEd,
    gen_ed_world_cultures: genEdWorldCultures.length ? genEdWorldCultures : genEd,
    humanities_elective: genEd,
    free_elective: genEd,
    elective_general: majorElectives,
    major_elective: majorElectives,
    math_elective: majorElectives,
    global_biz: genEdWorldCultures.length ? genEdWorldCultures : genEd,
  };
}

function buildAlternatives(pool: RankedCourse[] | undefined, usedCodes: Set<string>, currentCode?: string, honorsStudent = false) {
  return (pool ?? [])
    .filter((course) => honorsStudent || !isHonorsCourse(course))
    .filter((course) => {
      const code = normalizeCourseCode(`${course.subject} ${course.number}`);
      return code === currentCode || !usedCodes.has(code);
    })
    .slice(0, 6)
    .map((course) => ({
      code: normalizeCourseCode(`${course.subject} ${course.number}`),
      title: course.title,
      totalRegsAllTime: course.totalRegsAllTime ?? 0,
    }));
}

function chooseCourse(pool: RankedCourse[] | undefined, usedCodes: Set<string>, honorsStudent = false) {
  for (const course of pool ?? []) {
    if (!honorsStudent && isHonorsCourse(course)) continue;
    const code = normalizeCourseCode(`${course.subject} ${course.number}`);
    if (!usedCodes.has(code)) {
      return {
        code,
        title: course.title,
        totalRegsAllTime: course.totalRegsAllTime ?? 0,
      };
    }
  }
  return null;
}

export async function generateDegreePlan(request: DegreePlannerRequest): Promise<DegreePlannerResult> {
  const matchedMajor = findMajorBySlug(request.majorSlug) ?? findMajor(request.major);
  if (!matchedMajor) {
    throw new Error("We could not match that major to the current UIC degree-plan dataset.");
  }

  const major = loadMajorData(matchedMajor.file);
  const sampleSchedule = Array.isArray(major.sampleSchedule) ? major.sampleSchedule : [];
  if (!sampleSchedule.length) {
    throw new Error("This major does not have a semester-by-semester sample schedule in the current dataset yet.");
  }

  const pools = await buildElectivePools(major);
  const usedCodes = new Set<string>();
  const fullSchedule: DegreePlannerSemester[] = sampleSchedule.map((semester, semesterIndex) => {
    const courses = (semester.courses ?? []).map((course, courseIndex) => {
      const slotId = `${semesterIndex}-${courseIndex}`;
      if (!course.isElective && course.code) {
        const normalizedCode = normalizeCourseCode(course.code);
        usedCodes.add(normalizedCode);
        return {
          slotId,
          code: normalizedCode,
          title: course.title ?? normalizedCode,
          credits: course.hours ?? null,
          bucket: "required",
          bucketLabel: "Required course",
          kind: "required" as const,
          popularityReason: null,
          totalRegsAllTime: null,
          alternatives: [],
          status: "planned" as const,
        };
      }

      const bucket = course.electiveType ?? "gen_ed_any";
      const bucketLabel = ELECTIVE_LABELS[bucket] ?? "Elective";
      const picked = chooseCourse(pools[bucket], usedCodes, Boolean(request.honorsStudent));
      const code = picked?.code ?? normalizeCourseCode(`${bucketLabel} ${semesterIndex + 1}${courseIndex + 1}`);
      if (picked) usedCodes.add(code);
      const alternatives = buildAlternatives(pools[bucket], usedCodes, code, Boolean(request.honorsStudent));

      return {
        slotId,
        code,
        title: picked?.title ?? course.title ?? bucketLabel,
        credits: course.hours ?? null,
        bucket,
        bucketLabel,
        kind: "elective" as const,
        popularityReason: buildPopularityReason(bucketLabel, picked?.totalRegsAllTime ?? null),
        totalRegsAllTime: picked?.totalRegsAllTime ?? null,
        alternatives,
        status: "planned" as const,
      };
    });

    return {
      id: `semester-${semesterIndex + 1}`,
      label: semester.label ?? `${semester.year ?? "Year"} - ${semester.semester ?? "Semester"}`,
      year: semester.year ?? "",
      semester: semester.semester ?? "",
      totalHours: semester.total_hours ?? null,
      courses,
    };
  });

  const currentSemesterNumber = Math.max(0, Math.min(request.currentSemesterNumber ?? 0, fullSchedule.length));
  const explicitCompleted = normalizeCourseCodeList(request.completedCourses);
  const inferredCompletedCourses =
    explicitCompleted.length === 0 && currentSemesterNumber > 1
      ? fullSchedule
          .slice(0, currentSemesterNumber - 1)
          .flatMap((semester) => semester.courses.map((course) => course.code))
      : [];
  const completedCourses = Array.from(new Set([...explicitCompleted, ...inferredCompletedCourses]));
  const currentCourses = normalizeCourseCodeList(request.currentCourses);

  const statusForCode = (code: string): DegreePlannerCourse["status"] => {
    if (completedCourses.includes(code)) return "completed";
    if (currentCourses.includes(code)) return "in_progress";
    return "planned";
  };

  const markedSchedule = fullSchedule.map((semester) => ({
    ...semester,
    courses: semester.courses.map((course) => ({
      ...course,
      status: statusForCode(course.code),
    })),
  }));

  const startIndex = request.planLength === "full" ? 0 : currentSemesterNumber;
  const semesterCount = planLengthToSemesterCount(request.planLength ?? "remaining", markedSchedule.length, startIndex);
  const semesters = markedSchedule.slice(startIndex, startIndex + semesterCount);

  return {
    majorName: major.name,
    catalogUrl: major.url ?? matchedMajor.url ?? null,
    planLengthLabel: planLengthLabel(request.planLength ?? "remaining", semesters.length),
    inferredCompletedCourses,
    completedCourses,
    currentCourses,
    semesters,
  };
}
