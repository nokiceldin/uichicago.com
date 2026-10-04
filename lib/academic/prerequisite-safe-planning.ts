import {
  evaluateCourseEligibility,
  parseCatalogPrerequisites,
  type CourseEligibility,
  type EligibilityRecord,
  type PrerequisiteRule,
} from "./course-eligibility.ts";

export type PlanningCourse = {
  code?: string | null;
  title?: string | null;
  hours?: number | null;
  isElective?: boolean;
  electiveType?: string | null;
};

export type PlanningSemester = {
  label?: string | null;
  year?: string | null;
  semester?: string | null;
  courses?: PlanningCourse[];
};

export type EvaluatedPlanningCourse = {
  code: string;
  title: string;
  hours: number | null;
  eligibility: CourseEligibility;
};

export type PrerequisiteSafeNextTermPlan = {
  semesterLabel: string;
  eligible: EvaluatedPlanningCourse[];
  review: EvaluatedPlanningCourse[];
  blocked: EvaluatedPlanningCourse[];
  otherRequirements: string[];
  clarification: string | null;
};

const COURSE_CODE = /^[A-Z&]{2,5} \d{3}[A-Z]?$/;

function normalizeCode(code: string) {
  return code.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeRecord(record: EligibilityRecord): EligibilityRecord {
  return {
    completed: record.completed.map((course) => ({
      ...course,
      code: normalizeCode(course.code),
    })),
    inProgress: (record.inProgress ?? []).map(normalizeCode),
  };
}

function semesterLabel(semester: PlanningSemester, index: number) {
  return semester.label?.trim()
    || [semester.year, semester.semester].filter(Boolean).join(" — ")
    || `Semester ${index + 1}`;
}

export type PrerequisiteSafeRouteDecision =
  | "safe_planner"
  | "missing_history_clarification"
  | "continue";

export function shouldScheduleMajorPlanRetrieval(input: {
  majorPlanConfidence: number;
  answerMode: string;
  prerequisiteSafeRouteDecision: PrerequisiteSafeRouteDecision;
}) {
  return input.prerequisiteSafeRouteDecision === "safe_planner"
    || input.majorPlanConfidence > 0.5
    || input.answerMode === "planning";
}

type PlanningMessage = { role: string; content: string };

function isPlanningWindowRequest(rawQuery: string) {
  return /\b(?:(?:next|coming)\s+(?:semester|term|year)|have left|remaining|graduate quickly)\b/i.test(rawQuery);
}

export function hasPriorPersonalizedPlanningContext(messages: PlanningMessage[]) {
  return messages.some((message) =>
    message.role === "user" &&
    isPlanningWindowRequest(message.content) &&
    /\b(?:schedule|plan|what should i take|which\s+(?:cs\s+)?courses?\s+can i take|courses?\s+can i take|classes?\s+(?:do )?i have left)\b/i.test(message.content),
  );
}

export function decidePrerequisiteSafeNextTermRoute(input: {
  isPersonalScheduleRequest: boolean;
  hasVerifiedMajor: boolean;
  hasVerifiedCourseHistory: boolean;
  hasPriorPlanningContext: boolean;
  rawQuery: string;
}): PrerequisiteSafeRouteDecision {
  const hasPlanningWindow = isPlanningWindowRequest(input.rawQuery);
  const isTerminalCourseCorrection =
    /\b(?:failed|did not pass|didn't pass|dropped|withdrew from)\b[^.!?]{0,80}\b[A-Z]{2,5}\s*\d{3}/i.test(input.rawQuery);
  const isStrongCourseCorrection =
    /\b(?:correction|correct that|have not taken|haven't taken|failed|did not pass|didn't pass|dropped|withdrew from)\b[^.!?]{0,120}\b[A-Z]{2,5}\s*\d{3}/i.test(input.rawQuery);
  const requestsPlanningRevision =
    /\b(?:revise|update|redo|rework)\b[^.!?]{0,80}\b(?:schedule|plan|recommendations?)\b/i.test(input.rawQuery);
  if (input.hasPriorPlanningContext && isStrongCourseCorrection && requestsPlanningRevision) {
    return "safe_planner";
  }
  if (
    input.isPersonalScheduleRequest &&
    hasPlanningWindow &&
    (input.hasVerifiedCourseHistory || (input.hasVerifiedMajor && isTerminalCourseCorrection))
  ) {
    return "safe_planner";
  }
  if (
    input.isPersonalScheduleRequest &&
    hasPlanningWindow &&
    input.hasVerifiedMajor &&
    !input.hasVerifiedCourseHistory
  ) {
    return "missing_history_clarification";
  }
  return "continue";
}

function concurrentCourseCodes(rule: PrerequisiteRule | null): string[] {
  if (!rule) return [];
  if (rule.kind === "course") return rule.concurrentAllowed ? [rule.code] : [];
  return [...new Set(rule.rules.flatMap(concurrentCourseCodes))];
}

export function buildPrerequisiteSafeNextTermPlan(input: {
  semesters: PlanningSemester[];
  record: EligibilityRecord;
  catalogDescriptions: ReadonlyMap<string, string | null>;
}): PrerequisiteSafeNextTermPlan | null {
  const clarificationPlan = (message: string): PrerequisiteSafeNextTermPlan => ({
    semesterLabel: "Next-term verification needed",
    eligible: [],
    review: [],
    blocked: [],
    otherRequirements: [],
    clarification: message,
  });
  if (!input.semesters.length) {
    return clarificationPlan("I could not find a sample schedule to match against your verified course record.");
  }

  const record = normalizeRecord(input.record);
  const recordedCodes = new Set([
    ...record.completed.map((course) => course.code),
    ...(record.inProgress ?? []),
  ]);
  let latestRecordedSemester = -1;
  input.semesters.forEach((semester, index) => {
    if ((semester.courses ?? []).some((course) => course.code && recordedCodes.has(normalizeCode(course.code)))) {
      latestRecordedSemester = index;
    }
  });

  if (latestRecordedSemester < 0) {
    return clarificationPlan(
      "I could not match the courses you reported to this major's sample schedule, so I cannot safely choose a next term from that schedule. Please confirm your exact major and catalog year, or share your reviewed degree audit.",
    );
  }
  const targetIndex = Math.min(latestRecordedSemester + 1, input.semesters.length - 1);
  const target = input.semesters[targetIndex];
  const targetCourses = target.courses ?? [];
  const candidates: Array<Omit<EvaluatedPlanningCourse, "eligibility">> = [];
  const otherRequirements: string[] = [];

  for (const course of targetCourses) {
    const code = course.code ? normalizeCode(course.code) : "";
    if (!COURSE_CODE.test(code) || course.isElective) {
      const label = course.title?.trim() || course.code?.trim();
      if (label) otherRequirements.push(label);
      continue;
    }
    if (recordedCodes.has(code)) continue;

    candidates.push({
      code,
      title: course.title?.trim() || code,
      hours: course.hours ?? null,
    });
  }

  const evaluateCandidate = (course: Omit<EvaluatedPlanningCourse, "eligibility">, eligibleProviders: Set<string>) => {
    const description = input.catalogDescriptions.get(course.code);
    const hasUsableCatalogDescription = typeof description === "string" && description.trim().length > 0;
    return hasUsableCatalogDescription
      ? evaluateCourseEligibility(parseCatalogPrerequisites(description), {
          ...record,
          // Only a candidate already proven eligible may provide an explicit
          // concurrent prerequisite. Blocked/review candidates and cycles do
          // not unlock another course.
          inProgress: [...(record.inProgress ?? []), ...eligibleProviders],
        })
      : {
          status: "review" as const,
          satisfied: [],
          missing: [],
          unresolved: ["Catalog prerequisite data unavailable"],
          sourceText: null,
        };
  };

  const eligibleProviders = new Set<string>();
  const resolvedEligibility = new Map<string, CourseEligibility>();
  const parsedByCode = new Map(candidates.map((course) => {
    const description = input.catalogDescriptions.get(course.code);
    return [
      course.code,
      typeof description === "string" && description.trim().length > 0
        ? parseCatalogPrerequisites(description)
        : null,
    ] as const;
  }));
  let changed = true;
  while (changed) {
    changed = false;
    for (const course of candidates) {
      if (eligibleProviders.has(course.code)) continue;
      const eligibility = evaluateCandidate(course, eligibleProviders);
      if (eligibility.status === "eligible") {
        eligibleProviders.add(course.code);
        resolvedEligibility.set(course.code, eligibility);
        changed = true;
      }
    }
  }

  let evaluated = candidates.map((course) => ({
    ...course,
    eligibility: resolvedEligibility.get(course.code) ?? evaluateCandidate(course, eligibleProviders),
  }));

  // Courses in a same-term concurrent cycle, or depending on a provider whose
  // own eligibility needs review, remain verification items. They never become
  // eligible through the cycle or uncertain provider.
  const candidateCodes = new Set(candidates.map((course) => course.code));
  const concurrentEdges = new Map(candidates.map((course) => [
    course.code,
    concurrentCourseCodes(parsedByCode.get(course.code)?.rule ?? null)
      .filter((code) => candidateCodes.has(code)),
  ]));
  const cycleCodes = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (code: string) => {
    if (visiting.has(code)) {
      const cycleStart = stack.indexOf(code);
      for (const cycleCode of stack.slice(cycleStart)) cycleCodes.add(cycleCode);
      return;
    }
    if (visited.has(code)) return;
    visiting.add(code);
    stack.push(code);
    for (const dependency of concurrentEdges.get(code) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(code);
    visited.add(code);
  };
  for (const code of candidateCodes) visit(code);

  const reviewCodes = new Set(evaluated
    .filter((course) => course.eligibility.status === "review")
    .map((course) => course.code));
  for (const code of cycleCodes) reviewCodes.add(code);
  let reviewChanged = true;
  while (reviewChanged) {
    reviewChanged = false;
    for (const course of evaluated) {
      if (course.eligibility.status === "eligible" || reviewCodes.has(course.code)) continue;
      if ((concurrentEdges.get(course.code) ?? []).some((code) => reviewCodes.has(code))) {
        reviewCodes.add(course.code);
        reviewChanged = true;
      }
    }
  }
  evaluated = evaluated.map((course) => {
    if (!reviewCodes.has(course.code) || course.eligibility.status === "eligible") return course;
    const reason = cycleCodes.has(course.code)
      ? "Same-term concurrent prerequisite cycle requires verification"
      : "Same-term concurrent prerequisite provider requires verification";
    return {
      ...course,
      eligibility: {
        ...course.eligibility,
        status: "review" as const,
        unresolved: [...new Set([...course.eligibility.unresolved, reason])],
      },
    };
  });

  return {
    semesterLabel: semesterLabel(target, targetIndex),
    eligible: evaluated.filter((course) => course.eligibility.status === "eligible"),
    review: evaluated.filter((course) => course.eligibility.status === "review"),
    blocked: evaluated.filter((course) => course.eligibility.status === "blocked"),
    otherRequirements,
    clarification: null,
  };
}

function detail(course: EvaluatedPlanningCourse) {
  const hours = course.hours == null ? "" : ` (${course.hours} cr)`;
  return `**${course.code}** — ${course.title}${hours}`;
}

export function renderPrerequisiteSafeNextTermPlan(
  plan: PrerequisiteSafeNextTermPlan,
  majorName: string,
  catalogUrl?: string | null,
) {
  if (plan.clarification) {
    return [
      plan.clarification,
      "",
      "I will not infer completed prerequisites from class standing or substitute a generic plan.",
      `Confirm your record and prerequisites in the official UIC catalog: ${catalogUrl || "https://catalog.uic.edu/"}`,
    ].join("\n");
  }
  const lines = [
    `Here is the next sample-plan term for **${majorName}**, checked against the courses you reported:`,
    "",
    `### ${plan.semesterLabel}`,
  ];

  if (plan.eligible.length) {
    lines.push("", "**Eligible from the verified record**");
    for (const course of plan.eligible) lines.push(`- ${detail(course)}`);
  }
  if (plan.review.length) {
    lines.push("", "**Verify before registering**");
    for (const course of plan.review) {
      const reasons = [...course.eligibility.unresolved, ...course.eligibility.missing];
      lines.push(`- ${detail(course)} — ${reasons.join("; ") || "confirm the official prerequisite record"}.`);
    }
  }
  if (plan.blocked.length) {
    lines.push("", "**Not eligible yet from the record provided**");
    for (const course of plan.blocked) {
      lines.push(`- ${detail(course)} — missing ${course.eligibility.missing.join(" or ") || "a required prerequisite"}.`);
    }
  }
  if (plan.otherRequirements.length) {
    lines.push("", `Other sample-plan requirements: ${plan.otherRequirements.join(", ")}.`);
  }

  lines.push(
    "",
    "A course listed under verification is conditional, not confirmed eligibility. Current courses count only when the catalog explicitly allows concurrent registration; otherwise successful completion is required.",
    `Confirm prerequisites in the official UIC catalog: ${catalogUrl || "https://catalog.uic.edu/ucat/colleges-depts/engineering/cs/course-descriptions/"}`,
  );
  return lines.join("\n");
}
