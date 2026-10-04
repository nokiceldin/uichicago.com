export type PrerequisiteCourseRule = {
  kind: "course";
  code: string;
  minimumGrade: string | null;
  concurrentAllowed: boolean;
};

export type PrerequisiteRule =
  | PrerequisiteCourseRule
  | { kind: "all" | "any"; rules: PrerequisiteRule[] };

export type ParsedPrerequisites = {
  sourceText: string | null;
  rule: PrerequisiteRule | null;
  confidence: "none" | "exact" | "partial" | "unparsed";
  unresolvedConditions: string[];
};

export type EligibilityRecord = {
  completed: Array<{ code: string; grade?: string | null }>;
  inProgress?: string[];
  assumedCompleted?: string[];
};

export type CourseEligibility = {
  status: "eligible" | "blocked" | "review";
  satisfied: string[];
  missing: string[];
  unresolved: string[];
  sourceText: string | null;
};

const COURSE_CODE = /\b([A-Z&]{2,5})\s*(\d{3}[A-Z]?)\b/g;
const SECTION_END = /\s+(?:(?:Recommended background|Class Schedule(?: Information)?|Course Schedule Information|Schedule Information):)/i;

function normalizeCode(subject: string, number: string) {
  return `${subject.toUpperCase()} ${number.toUpperCase()}`;
}

export function extractPrerequisiteText(description: string | null | undefined) {
  if (!description) return null;
  const match = /Prerequisite\s*\(s\):\s*/i.exec(description);
  if (!match) return null;
  const tail = description.slice(match.index + match[0].length);
  const end = SECTION_END.exec(tail);
  const section = (end ? tail.slice(0, end.index) : tail)
    // Explanatory prose after the prerequisite sentence often repeats course
    // codes while describing exceptions. It is evidence for an advisor review,
    // not another prerequisite clause.
    .replace(/\.\s+(?:The|This)\b[\s\S]*$/i, ". Unsupported prerequisite qualifier.")
    .trim();
  return section || null;
}

function minimumGradeNear(text: string, codeIndex: number) {
  const prefix = text.slice(Math.max(0, codeIndex - 70), codeIndex);
  const matches = [...prefix.matchAll(/grade of\s+([A-DF][+-]?)\s+or better(?:\s+in)?/gi)];
  return matches.at(-1)?.[1]?.toUpperCase() ?? null;
}

function concurrentNear(text: string, codeIndex: number) {
  const prefix = text.slice(Math.max(0, codeIndex - 60), codeIndex).toLowerCase();
  return /concurrent registration|credit or concurrent|completion or concurrent|simultaneous enrollment/.test(prefix);
}

function uniqueRules(rules: PrerequisiteCourseRule[]) {
  const byKey = new Map<string, PrerequisiteCourseRule>();
  for (const rule of rules) {
    const key = `${rule.code}:${rule.minimumGrade ?? ""}:${rule.concurrentAllowed}`;
    byKey.set(key, rule);
  }
  return [...byKey.values()];
}

function connectorBetween(text: string, leftEnd: number, rightStart: number) {
  const between = text.slice(leftEnd, rightStart).toLowerCase()
    .replace(/or better/g, "")
    .replace(/(credit|completion) or concurrent/g, "$1 concurrent");
  if (/\band\b|;/.test(between)) return "and" as const;
  if (/\bor\b/.test(between)) return "or" as const;
  // Catalog lists sometimes omit a conjunction after punctuation. Requiring
  // every listed course is safer than treating an unexplained list as choices.
  return "and" as const;
}

function buildCourseRule(text: string) {
  const matches = [...text.matchAll(COURSE_CODE)];
  const courseRules = uniqueRules(matches.map(match => ({
    kind: "course" as const,
    code: normalizeCode(match[1], match[2]),
    minimumGrade: minimumGradeNear(text, match.index ?? 0),
    concurrentAllowed: concurrentNear(text, match.index ?? 0),
  })));
  if (!courseRules.length) return null;
  if (courseRules.length === 1) return courseRules[0];

  const connectors = matches.slice(1).map((match, index) => {
    const previous = matches[index];
    return connectorBetween(text, (previous.index ?? 0) + previous[0].length, match.index ?? 0);
  });
  const onlyOr = connectors.every(connector => connector === "or");
  const onlyAnd = connectors.every(connector => connector === "and");
  if (onlyOr || onlyAnd) {
    return { kind: onlyOr ? "any" as const : "all" as const, rules: courseRules };
  }

  // Mixed AND/OR expressions require grouping. UIC separates required groups
  // with "; and" (or an explicit "and" before the next grade/credit clause),
  // while alternatives inside each group use "or".
  const segments = text.split(
    /\s*;\s*and\s+|\s+and\s+(?=(?:(?:grade of\s+[A-DF][+-]?\s+or better\s+in)|(?:credit or concurrent registration in)|(?:completion or concurrent registration in)|[A-Z&]{2,5}\s*\d{3}))/i,
  );
  const segmentRules = segments.map<PrerequisiteRule | null>(segment => {
    const found = [...segment.matchAll(COURSE_CODE)];
    if (!found.length) return null;
    const rules = uniqueRules(found.map(match => ({
      kind: "course" as const,
      code: normalizeCode(match[1], match[2]),
      minimumGrade: minimumGradeNear(segment, match.index ?? 0),
      concurrentAllowed: concurrentNear(segment, match.index ?? 0),
    })));
    if (rules.length === 1) return rules[0];
    const hasOr = /\bor\b/i.test(segment.replace(/or better/gi, ""));
    return { kind: hasOr ? "any" as const : "all" as const, rules };
  }).filter((rule): rule is PrerequisiteRule => rule !== null);

  return segmentRules.length === 1 ? segmentRules[0] : { kind: "all" as const, rules: segmentRules };
}

function unresolvedConditions(text: string) {
  const conditions: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/appropriate (?:score|placement)|placement (?:test|score)/i, "Placement requirement"],
    [/consent of (?:the )?(?:instructor|department|college|school|program|director)/i, "Consent or approval requirement"],
    [/(?:freshman|sophomore|junior|senior|graduate) standing/i, "Class-standing requirement"],
    [/(?:restricted to|open only to|must be enrolled in|students enrolled in)/i, "Program or enrollment restriction"],
    [/(?:\d+|six|twelve|[a-z]+)\s+(?:semester )?hours of/i, "Credit-hour requirement"],
    [/completion of all other|completion of the .* core/i, "Program-progress requirement"],
    [/average grade of\s+[A-DF][+-]?\s+or higher/i, "Combined minimum-grade requirement"],
    [/faculty sponsor|departmental approval|approval of/i, "Approval requirement"],
    [/unsupported prerequisite qualifier/i, "Unsupported prerequisite qualifier"],
  ];
  for (const [pattern, label] of checks) if (pattern.test(text)) conditions.push(label);
  const unconsumed = text
    .replace(COURSE_CODE, " ")
    .replace(/grade of\s+[A-DF][+-]?\s+or better(?:\s+in)?/gi, " ")
    .replace(/(?:credit|completion) or concurrent registration in/gi, " ")
    .replace(/simultaneous enrollment in/gi, " ")
    .replace(/\b(?:and|or|in)\b/gi, " ")
    .replace(/[.;,:()\[\]{}\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/[A-Za-z0-9]/.test(unconsumed)) conditions.push("Unsupported prerequisite qualifier");
  return [...new Set(conditions)];
}

export function parseCatalogPrerequisites(description: string | null | undefined): ParsedPrerequisites {
  const sourceText = extractPrerequisiteText(description);
  if (!sourceText || /^(?:none|no prerequisites?\.?|there are no course prerequisites?\.?)$/i.test(sourceText)) {
    return { sourceText, rule: null, confidence: "none", unresolvedConditions: [] };
  }

  const rule = buildCourseRule(sourceText);
  const unresolved = unresolvedConditions(sourceText);
  if (!rule) {
    return { sourceText, rule: null, confidence: "unparsed", unresolvedConditions: unresolved.length ? unresolved : ["Unparsed prerequisite language"] };
  }

  const logicalText = sourceText
    .replace(/or better/gi, "")
    .replace(/(credit|completion) or concurrent/gi, "$1 concurrent");
  const hasMixedCourseLogic = /\band\b/i.test(logicalText) && /\bor\b/i.test(logicalText);
  const hasExplicitMixedGrouping = /;\s*and\b/i.test(logicalText);
  return {
    sourceText,
    rule,
    confidence: unresolved.length || (hasMixedCourseLogic && !hasExplicitMixedGrouping) ? "partial" : "exact",
    unresolvedConditions: unresolved,
  };
}

const GRADE_POINTS: Record<string, number> = {
  "A+": 13, A: 12, "A-": 11,
  "B+": 10, B: 9, "B-": 8,
  "C+": 7, C: 6, "C-": 5,
  "D+": 4, D: 3, "D-": 2, F: 0,
};

function gradeMeets(actual: string, minimum: string) {
  const actualPoints = GRADE_POINTS[actual.toUpperCase()];
  const minimumPoints = GRADE_POINTS[minimum.toUpperCase()];
  if (actualPoints == null || minimumPoints == null) return null;
  return actualPoints >= minimumPoints;
}

type Evaluation = { satisfied: string[]; missing: string[]; review: string[]; passed: boolean };

function evaluateRule(rule: PrerequisiteRule, completed: Map<string, string | null>, current: Set<string>, assumed: Set<string>): Evaluation {
  if (rule.kind === "course") {
    if (assumed.has(rule.code)) return { satisfied: [rule.code], missing: [], review: [], passed: true };
    if (completed.has(rule.code)) {
      const grade = completed.get(rule.code) ?? null;
      if (!rule.minimumGrade) return { satisfied: [rule.code], missing: [], review: [], passed: true };
      if (!grade) return { satisfied: [], missing: [], review: [`Confirm that ${rule.code} was completed with ${rule.minimumGrade} or better`], passed: false };
      const meets = gradeMeets(grade, rule.minimumGrade);
      if (meets === true) return { satisfied: [rule.code], missing: [], review: [], passed: true };
      if (meets === null) return { satisfied: [], missing: [], review: [`Confirm the reported grade for ${rule.code}`], passed: false };
      return { satisfied: [], missing: [`${rule.code} with ${rule.minimumGrade} or better`], review: [], passed: false };
    }
    if (current.has(rule.code) && rule.concurrentAllowed) return { satisfied: [rule.code], missing: [], review: [], passed: true };
    return { satisfied: [], missing: [rule.minimumGrade ? `${rule.code} with ${rule.minimumGrade} or better` : rule.code], review: [], passed: false };
  }

  const children = rule.rules.map(child => evaluateRule(child, completed, current, assumed));
  if (rule.kind === "any") {
    const passed = children.find(child => child.passed);
    if (passed) return passed;
    const review = children.flatMap(child => child.review);
    return { satisfied: [], missing: [...new Set(children.flatMap(child => child.missing))], review: [...new Set(review)], passed: false };
  }
  return {
    satisfied: [...new Set(children.flatMap(child => child.satisfied))],
    missing: [...new Set(children.flatMap(child => child.missing))],
    review: [...new Set(children.flatMap(child => child.review))],
    passed: children.every(child => child.passed),
  };
}

export function evaluateCourseEligibility(parsed: ParsedPrerequisites, record: EligibilityRecord): CourseEligibility {
  if (parsed.confidence === "none") {
    return { status: "eligible", satisfied: [], missing: [], unresolved: [], sourceText: parsed.sourceText };
  }
  if (!parsed.rule) {
    return { status: "review", satisfied: [], missing: [], unresolved: parsed.unresolvedConditions, sourceText: parsed.sourceText };
  }

  const completed = new Map(record.completed.map(item => [item.code.toUpperCase(), item.grade?.toUpperCase() ?? null]));
  const result = evaluateRule(
    parsed.rule,
    completed,
    new Set((record.inProgress ?? []).map(code => code.toUpperCase())),
    new Set((record.assumedCompleted ?? []).map(code => code.toUpperCase())),
  );
  const unresolved = [...new Set([...parsed.unresolvedConditions, ...result.review])];
  if (parsed.confidence !== "exact" || unresolved.length) {
    return { status: "review", satisfied: result.satisfied, missing: result.missing, unresolved, sourceText: parsed.sourceText };
  }
  return {
    status: result.passed ? "eligible" : "blocked",
    satisfied: result.satisfied,
    missing: result.missing,
    unresolved: [],
    sourceText: parsed.sourceText,
  };
}
