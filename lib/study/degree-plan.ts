import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import { fetchCoursesByCodesRanked, fetchGenEdCourses } from "@/lib/chat/data";

export type DegreePlannerRequest = {
  major: string;
  majorSlug?: string;
  currentSemesterNumber?: number;
  planLength?: "one_semester" | "one_year" | "two_years" | "three_years" | "remaining" | "full";
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
  deptName?: string | null;
  isGenEd?: boolean | null;
  genEdCategory?: string | null;
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
      note?: string | null;
      isElective?: boolean;
      electiveType?: string | null;
    }>;
  }>;
  scienceElectives?: { options?: Array<{ code: string; title?: string }>; totalHours?: number };
  requiredMath?: { options?: Array<{ code: string; title?: string }>; totalHours?: number };
  technicalElectives?: { options?: Array<{ code: string; title?: string }>; totalHours?: number };
  requiredEngineering?: { courses?: Array<{ code: string; title?: string; hours?: number | null; note?: string | null }> };
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

function extractCourseCodes(text: string) {
  const matches = text.match(/\b[A-Z]{2,5}\s*\d{2,3}[A-Z]?\b/gi) ?? [];
  return normalizeCourseCodeList(matches);
}

function noteImpliesAlternatives(note: string) {
  const normalized = note.toLowerCase();
  return /\bor\b/.test(normalized) || /\beither\b/.test(normalized) || /\bone of\b/.test(normalized) || /\bat least one\b/.test(normalized);
}

function buildMajorCourseCatalog(major: MajorData) {
  const catalog = new Map<string, { title: string | null; hours: number | null }>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" && record.code.trim()) {
      const code = normalizeCourseCode(record.code);
      const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : null;
      const hours = typeof record.hours === "number" ? record.hours : null;
      const existing = catalog.get(code);
      if (!existing || (!existing.title && title) || (existing.hours == null && hours != null)) {
        catalog.set(code, {
          title: title ?? existing?.title ?? null,
          hours: hours ?? existing?.hours ?? null,
        });
      }
    }

    for (const child of Object.values(record)) visit(child);
  };

  visit(major);
  return catalog;
}

function buildRequirementAlternatives(major: MajorData) {
  const alternatives = new Map<string, Set<string>>();

  const addAlternatives = (baseCode: string, codes: string[]) => {
    const normalizedBase = normalizeCourseCode(baseCode);
    const normalizedCodes = normalizeCourseCodeList([normalizedBase, ...codes]);
    if (normalizedCodes.length < 2) return;

    const existing = alternatives.get(normalizedBase) ?? new Set<string>();
    for (const code of normalizedCodes) existing.add(code);
    alternatives.set(normalizedBase, existing);
  };

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" && record.code.trim() && typeof record.note === "string" && record.note.trim()) {
      const note = record.note.trim();
      const mentionedCodes = extractCourseCodes(note);
      if (noteImpliesAlternatives(note) && mentionedCodes.length) {
        addAlternatives(record.code, mentionedCodes);
      }
    }

    for (const child of Object.values(record)) visit(child);
  };

  visit(major);
  return alternatives;
}

function pickSatisfiedCode(
  primaryCode: string,
  alternatives: Map<string, Set<string>>,
  availableTakenCodes: Set<string>,
  consumedTakenCodes: Set<string>,
) {
  const codesToTry = Array.from(alternatives.get(primaryCode) ?? [primaryCode]);

  if (availableTakenCodes.has(primaryCode) && !consumedTakenCodes.has(primaryCode)) {
    consumedTakenCodes.add(primaryCode);
    return primaryCode;
  }

  for (const code of codesToTry) {
    if (availableTakenCodes.has(code) && !consumedTakenCodes.has(code)) {
      consumedTakenCodes.add(code);
      return code;
    }
  }

  return primaryCode;
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

function buildAlternatives(
  pool: RankedCourse[] | undefined,
  usedCodes: Set<string>,
  blockedCodes: Set<string>,
  currentCode?: string,
  honorsStudent = false,
) {
  return (pool ?? [])
    .filter((course) => honorsStudent || !isHonorsCourse(course))
    .filter((course) => {
      const code = normalizeCourseCode(`${course.subject} ${course.number}`);
      return code === currentCode || (!usedCodes.has(code) && !blockedCodes.has(code));
    })
    .slice(0, 6)
    .map((course) => ({
      code: normalizeCourseCode(`${course.subject} ${course.number}`),
      title: course.title,
      totalRegsAllTime: course.totalRegsAllTime ?? 0,
    }));
}

function chooseTakenCourse(
  pool: RankedCourse[] | undefined,
  usedCodes: Set<string>,
  takenCodes: Set<string>,
  consumedTakenCodes: Set<string>,
) {
  for (const course of pool ?? []) {
    const code = normalizeCourseCode(`${course.subject} ${course.number}`);
    if (takenCodes.has(code) && !consumedTakenCodes.has(code) && !usedCodes.has(code)) {
      consumedTakenCodes.add(code);
      return {
        code,
        title: course.title,
        totalRegsAllTime: course.totalRegsAllTime ?? 0,
      };
    }
  }
  return null;
}

function chooseCourse(
  pool: RankedCourse[] | undefined,
  usedCodes: Set<string>,
  blockedCodes: Set<string>,
  honorsStudent = false,
) {
  for (const course of pool ?? []) {
    if (!honorsStudent && isHonorsCourse(course)) continue;
    const code = normalizeCourseCode(`${course.subject} ${course.number}`);
    if (!usedCodes.has(code) && !blockedCodes.has(code)) {
      return {
        code,
        title: course.title,
        totalRegsAllTime: course.totalRegsAllTime ?? 0,
      };
    }
  }
  return null;
}

type TakenCourseDetails = {
  code: string;
  title: string;
  subject: string;
  number: string;
  isGenEd: boolean;
  genEdCategory: string | null;
};

function normalizeCategory(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

function buildTakenCourseDetailsMap(courses: RankedCourse[], explicitSavedCourses: string[]) {
  const details = new Map<string, TakenCourseDetails>();

  for (const course of courses) {
    const code = normalizeCourseCode(`${course.subject} ${course.number}`);
    details.set(code, {
      code,
      title: course.title,
      subject: course.subject,
      number: course.number,
      isGenEd: Boolean(course.isGenEd),
      genEdCategory: course.genEdCategory ?? null,
    });
  }

  for (const code of explicitSavedCourses) {
    if (details.has(code)) continue;
    const match = code.match(/^([A-Z&]+)\s+(\d+[A-Z]?)$/);
    details.set(code, {
      code,
      title: code,
      subject: match?.[1] ?? "",
      number: match?.[2] ?? "",
      isGenEd: false,
      genEdCategory: null,
    });
  }

  return details;
}

function likelyCountsAsHumanitiesOrGenEd(details: TakenCourseDetails) {
  if (details.isGenEd) return true;
  return new Set(["AH", "CL", "COMM", "ENGL", "HIST", "HN", "MUS", "THTR", "SOC", "PSCH", "ANTH", "POLS", "CLJ"]).has(details.subject);
}

function fitsElectiveBucket(details: TakenCourseDetails, bucket: string) {
  const category = normalizeCategory(details.genEdCategory);

  switch (bucket) {
    case "gen_ed_any":
      return likelyCountsAsHumanitiesOrGenEd(details);
    case "gen_ed_individual_society":
      return category.includes("individual") || category.includes("society") || new Set(["SOC", "PSCH", "ANTH", "CLJ", "POLS", "ECON"]).has(details.subject);
    case "gen_ed_past":
      return category.includes("past") || new Set(["HIST", "AH", "CL"]).has(details.subject);
    case "gen_ed_world_cultures":
    case "global_biz":
      return category.includes("world") || category.includes("culture") || new Set(["SPAN", "FREN", "GER", "ITAL", "CL", "HIST"]).has(details.subject);
    case "humanities_elective":
      return likelyCountsAsHumanitiesOrGenEd(details);
    case "free_elective":
      return true;
    default:
      return false;
  }
}

function placeRemainingTakenCourses(
  schedule: DegreePlannerSemester[],
  currentSemesterNumber: number,
  remainingTakenCodes: string[],
  takenCourseDetails: Map<string, TakenCourseDetails>,
) {
  if (!remainingTakenCodes.length) return schedule;

  const next = schedule.map((semester) => ({
    ...semester,
    courses: semester.courses.map((course) => ({ ...course })),
  }));

  const preferredSlots: Array<{ semesterIndex: number; courseIndex: number; course: DegreePlannerCourse }> = [];
  const fallbackSlots: Array<{ semesterIndex: number; courseIndex: number; course: DegreePlannerCourse }> = [];

  for (let semesterIndex = 0; semesterIndex < next.length; semesterIndex += 1) {
    const semester = next[semesterIndex];
    for (let courseIndex = 0; courseIndex < semester.courses.length; courseIndex += 1) {
      const course = semester.courses[courseIndex];
      if (course.kind !== "elective" || course.status !== "planned") continue;

      const slot = { semesterIndex, courseIndex, course };
      if (semesterIndex < currentSemesterNumber) {
        preferredSlots.push(slot);
      } else {
        fallbackSlots.push(slot);
      }
    }
  }

  const slotOrder = [...preferredSlots, ...fallbackSlots];

  for (const code of remainingTakenCodes) {
    const details = takenCourseDetails.get(code);
    if (!details) continue;

    const exactIndex = slotOrder.findIndex(({ course }) => fitsElectiveBucket(details, course.bucket));
    if (exactIndex < 0) continue;

    const [{ semesterIndex, courseIndex, course }] = slotOrder.splice(exactIndex, 1);
    const title =
      course.bucket === "free_elective" && !fitsElectiveBucket(details, "gen_ed_any")
        ? `${details.title} / Free elective`
        : details.title;

    next[semesterIndex].courses[courseIndex] = {
      ...course,
      code: details.code,
      title,
      status: "in_progress",
      popularityReason:
        course.bucket === "free_elective" && !fitsElectiveBucket(details, "gen_ed_any")
          ? "Placed from your completed/current course list as a likely free elective. Verify with your advisor or degree audit."
          : course.popularityReason,
      alternatives: course.alternatives.some((option) => option.code === details.code)
        ? course.alternatives
        : [{ code: details.code, title: details.title, totalRegsAllTime: 0 }, ...course.alternatives].slice(0, 6),
    };
  }

  return next;
}

function swapCourseIntoSlot(course: DegreePlannerCourse, slotId: string): DegreePlannerCourse {
  return {
    ...course,
    slotId,
  };
}

function pickReplacementAlternative(
  course: DegreePlannerCourse,
  takenCodes: Set<string>,
  usedCodes: Set<string>,
) {
  return course.alternatives.find((option) => option.code !== course.code && !takenCodes.has(option.code) && !usedCodes.has(option.code)) ?? null;
}

function chooseOverflowSemesterIndex(schedule: DegreePlannerSemester[], currentSemesterNumber: number) {
  if (currentSemesterNumber <= 0) return -1;

  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let semesterIndex = 0; semesterIndex < Math.min(currentSemesterNumber, schedule.length); semesterIndex += 1) {
    const semester = schedule[semesterIndex];
    const creditScore = semester.courses.reduce((sum, course) => sum + (course.credits ?? 0), 0);
    const countScore = semester.courses.length;
    const combinedScore = creditScore * 10 + countScore;
    if (combinedScore < bestScore) {
      bestScore = combinedScore;
      bestIndex = semesterIndex;
    }
  }

  return bestIndex;
}

function buildTakenPlannerCourse(
  details: TakenCourseDetails,
  template: DegreePlannerCourse,
  slotId: string,
): DegreePlannerCourse {
  const isFreeElectiveFallback = template.bucket === "free_elective" && !fitsElectiveBucket(details, "gen_ed_any");

  return {
    ...template,
    slotId,
    code: details.code,
    title: isFreeElectiveFallback ? `${details.title} / Free elective` : details.title,
    status: "in_progress",
    popularityReason: isFreeElectiveFallback
      ? "Placed from your completed/current course list as a likely free elective. Verify with your advisor or degree audit."
      : template.popularityReason,
    alternatives: template.alternatives.some((option) => option.code === details.code)
      ? template.alternatives
      : [{ code: details.code, title: details.title, totalRegsAllTime: 0 }, ...template.alternatives].slice(0, 6),
  };
}

function reconcileMissingTakenCourses(
  schedule: DegreePlannerSemester[],
  currentSemesterNumber: number,
  takenCodes: string[],
  takenCourseDetails: Map<string, TakenCourseDetails>,
) {
  const next = schedule.map((semester) => ({
    ...semester,
    courses: semester.courses.map((course) => ({ ...course })),
  }));

  const visibleCodes = new Set(next.flatMap((semester) => semester.courses.map((course) => course.code)));
  const missingCodes = takenCodes.filter((code) => !visibleCodes.has(code));
  if (!missingCodes.length) return next;

  for (const code of missingCodes) {
    const details = takenCourseDetails.get(code);
    if (!details) continue;

    let matchedTemplate:
      | { semesterIndex: number; courseIndex: number; course: DegreePlannerCourse }
      | null = null;

    for (let semesterIndex = next.length - 1; semesterIndex >= 0 && !matchedTemplate; semesterIndex -= 1) {
      for (let courseIndex = next[semesterIndex].courses.length - 1; courseIndex >= 0; courseIndex -= 1) {
        const course = next[semesterIndex].courses[courseIndex];
        if (course.kind !== "elective" || course.status !== "planned") continue;
        if (fitsElectiveBucket(details, course.bucket)) {
          matchedTemplate = { semesterIndex, courseIndex, course };
          break;
        }
      }
    }

    const overflowSemesterIndex = chooseOverflowSemesterIndex(next, currentSemesterNumber);
    if (overflowSemesterIndex < 0) continue;

    const template = matchedTemplate?.course ?? {
      slotId: `${next[overflowSemesterIndex].id}-free-elective-template`,
      code: "FREE ELECTIVE",
      title: "Free elective",
      credits: null,
      bucket: "free_elective",
      bucketLabel: "Free elective",
      kind: "elective" as const,
      popularityReason: null,
      totalRegsAllTime: null,
      alternatives: [],
      status: "planned" as const,
    };

    const insertedCourse = buildTakenPlannerCourse(
      details,
      template,
      `${next[overflowSemesterIndex].id}-taken-${next[overflowSemesterIndex].courses.length + 1}`,
    );
    next[overflowSemesterIndex].courses.push(insertedCourse);

    if (matchedTemplate) {
      next[matchedTemplate.semesterIndex].courses.splice(matchedTemplate.courseIndex, 1);
    }
  }

  return next;
}

function rebalanceScheduleAroundCurrentSemester(
  schedule: DegreePlannerSemester[],
  currentSemesterNumber: number,
  takenCodes: Set<string>,
) {
  if (currentSemesterNumber <= 0) return schedule;

  const rebalanced = schedule.map((semester) => ({
    ...semester,
    courses: semester.courses.map((course) => ({ ...course })),
  }));

  const earlierPlannedSlots: Array<{ semesterIndex: number; courseIndex: number; course: DegreePlannerCourse }> = [];
  const futureTakenSlots: Array<{ semesterIndex: number; courseIndex: number; course: DegreePlannerCourse }> = [];
  const usedCodes = new Set(rebalanced.flatMap((semester) => semester.courses.map((course) => course.code)));

  for (let semesterIndex = 0; semesterIndex < rebalanced.length; semesterIndex += 1) {
    const semester = rebalanced[semesterIndex];
    for (let courseIndex = 0; courseIndex < semester.courses.length; courseIndex += 1) {
      const course = semester.courses[courseIndex];
      if (semesterIndex < currentSemesterNumber && course.status === "planned") {
        earlierPlannedSlots.push({ semesterIndex, courseIndex, course });
      } else if (semesterIndex >= currentSemesterNumber && course.status !== "planned") {
        futureTakenSlots.push({ semesterIndex, courseIndex, course });
      }
    }
  }

  const compatibleTargetIndex = (source: DegreePlannerCourse) => {
    const exactIndex = earlierPlannedSlots.findIndex(({ course }) => {
      if (source.kind === "required") {
        return course.kind === "required";
      }
      return course.kind === "elective" && course.bucket === source.bucket;
    });

    if (exactIndex >= 0) return exactIndex;

    const sameKindIndex = earlierPlannedSlots.findIndex(({ course }) => course.kind === source.kind);
    if (sameKindIndex >= 0) return sameKindIndex;

    return earlierPlannedSlots.findIndex(() => true);
  };

  for (const source of futureTakenSlots) {
    const targetIndex = compatibleTargetIndex(source.course);
    const sourceCourse = rebalanced[source.semesterIndex].courses[source.courseIndex];

    if (targetIndex >= 0) {
      const [target] = earlierPlannedSlots.splice(targetIndex, 1);
      const targetCourse = rebalanced[target.semesterIndex].courses[target.courseIndex];
      rebalanced[target.semesterIndex].courses[target.courseIndex] = swapCourseIntoSlot(sourceCourse, targetCourse.slotId);
      rebalanced[source.semesterIndex].courses[source.courseIndex] = swapCourseIntoSlot(targetCourse, sourceCourse.slotId);
      continue;
    }

    if (sourceCourse.kind !== "elective") continue;

    const overflowSemesterIndex = chooseOverflowSemesterIndex(rebalanced, currentSemesterNumber);
    if (overflowSemesterIndex < 0) continue;

    rebalanced[overflowSemesterIndex].courses.push({
      ...sourceCourse,
      slotId: `${rebalanced[overflowSemesterIndex].id}-overflow-${rebalanced[overflowSemesterIndex].courses.length + 1}`,
    });

    const replacement = pickReplacementAlternative(sourceCourse, takenCodes, usedCodes);
    if (!replacement) continue;

    usedCodes.add(replacement.code);
    rebalanced[source.semesterIndex].courses[source.courseIndex] = {
      ...sourceCourse,
      code: replacement.code,
      title: replacement.title,
      totalRegsAllTime: replacement.totalRegsAllTime,
      popularityReason: buildPopularityReason(sourceCourse.bucketLabel, replacement.totalRegsAllTime ?? null),
      status: "planned",
      alternatives: sourceCourse.alternatives,
    };
  }

  return rebalanced;
}

export async function generateDegreePlan(request: DegreePlannerRequest): Promise<DegreePlannerResult> {
  const matchedMajor = findMajorBySlug(request.majorSlug) ?? findMajor(request.major);
  if (!matchedMajor) {
    throw new Error("We could not match that major to the current UIC degree-plan dataset.");
  }

  const major = loadMajorData(matchedMajor.file);
  const majorCourseCatalog = buildMajorCourseCatalog(major);
  const requirementAlternatives = buildRequirementAlternatives(major);
  const sampleSchedule = Array.isArray(major.sampleSchedule) ? major.sampleSchedule : [];
  if (!sampleSchedule.length) {
    throw new Error("This major does not have a semester-by-semester sample schedule in the current dataset yet.");
  }

  const pools = await buildElectivePools(major);
  const usedCodes = new Set<string>();
  const explicitSavedCourses = normalizeCourseCodeList(request.currentCourses);
  const explicitSavedCourseMetadata = await fetchCoursesByCodesRanked(explicitSavedCourses, true).catch(() => []);
  const takenCourseDetails = buildTakenCourseDetailsMap(explicitSavedCourseMetadata, explicitSavedCourses);
  const availableTakenCodes = new Set(explicitSavedCourses);
  const consumedTakenCodes = new Set<string>();
  const fullSchedule: DegreePlannerSemester[] = sampleSchedule.map((semester, semesterIndex) => {
    const courses = (semester.courses ?? []).map((course, courseIndex) => {
      const slotId = `${semesterIndex}-${courseIndex}`;
      if (!course.isElective && course.code) {
        const normalizedCode = normalizeCourseCode(course.code);
        const satisfiedCode = pickSatisfiedCode(normalizedCode, requirementAlternatives, availableTakenCodes, consumedTakenCodes);
        const satisfiedCourse = majorCourseCatalog.get(satisfiedCode);
        usedCodes.add(satisfiedCode);
        return {
          slotId,
          code: satisfiedCode,
          title: satisfiedCourse?.title ?? course.title ?? satisfiedCode,
          credits: satisfiedCourse?.hours ?? course.hours ?? null,
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
      const picked =
        chooseTakenCourse(
          pools[bucket],
          usedCodes,
          availableTakenCodes,
          consumedTakenCodes,
        ) ??
        chooseCourse(
          pools[bucket],
          usedCodes,
          availableTakenCodes,
          Boolean(request.honorsStudent),
        );
      const code = picked?.code ?? normalizeCourseCode(`${bucketLabel} ${semesterIndex + 1}${courseIndex + 1}`);
      if (picked) usedCodes.add(code);
      const alternatives = buildAlternatives(
        pools[bucket],
        usedCodes,
        availableTakenCodes,
        code,
        Boolean(request.honorsStudent),
      );

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
  const unmatchedTakenCodes = explicitSavedCourses.filter((code) => !consumedTakenCodes.has(code) && !usedCodes.has(code));
  const scheduleWithRemainingTakenCourses = placeRemainingTakenCourses(
    fullSchedule,
    currentSemesterNumber,
    unmatchedTakenCodes,
    takenCourseDetails,
  );
  const inferredCompletedCourses =
    explicitSavedCourses.length === 0 && currentSemesterNumber > 1
      ? scheduleWithRemainingTakenCourses
          .slice(0, currentSemesterNumber - 1)
          .flatMap((semester) => semester.courses.map((course) => course.code))
      : [];
  const currentCourses = Array.from(new Set([...explicitSavedCourses, ...inferredCompletedCourses]));

  const statusForCode = (code: string): DegreePlannerCourse["status"] => {
    if (currentCourses.includes(code)) return "in_progress";
    return "planned";
  };

  const markedSchedule = scheduleWithRemainingTakenCourses.map((semester) => ({
    ...semester,
    courses: semester.courses.map((course) => ({
      ...course,
      status: statusForCode(course.code),
    })),
  }));
  const balancedSchedule = rebalanceScheduleAroundCurrentSemester(markedSchedule, currentSemesterNumber, new Set(currentCourses));
  const reconciledSchedule = reconcileMissingTakenCourses(
    balancedSchedule,
    currentSemesterNumber,
    currentCourses,
    takenCourseDetails,
  );

  const startIndex = request.planLength === "full" ? 0 : currentSemesterNumber;
  const semesterCount = planLengthToSemesterCount(request.planLength ?? "remaining", reconciledSchedule.length, startIndex);
  const semesters = reconciledSchedule.slice(startIndex, startIndex + semesterCount);

  return {
    majorName: major.name,
    catalogUrl: major.url ?? matchedMajor.url ?? null,
    planLengthLabel: planLengthLabel(request.planLength ?? "remaining", semesters.length),
    inferredCompletedCourses,
    currentCourses,
    semesters,
  };
}
