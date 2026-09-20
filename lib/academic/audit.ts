/** Pure academic rule evaluator. Never infers coursework from year standing. */
export type AcademicRecord = {
  completedCourses: string[];
  currentCourses: string[];
};

export type Rule =
  | { kind: "course"; code: string }
  | { kind: "all" | "any"; rules: Rule[] }
  | { kind: "unknown"; reason: string };

export type Requirement = { id: string; label: string; source: string; rule: Rule };
export type RuleResult = {
  status: "reported_complete" | "in_progress" | "missing" | "unknown";
  completed: string[];
  inProgress: string[];
  options: string[];
  explanation: string;
};

export function normalizeCourses(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v): v is string => typeof v === "string")
    .map(v => v.trim().toUpperCase().replace(/^([A-Z&]{2,5})\s*(\d{3}[A-Z]?)$/, "$1 $2"))
    .filter(v => /^[A-Z&]{2,5} \d{3}[A-Z]?$/.test(v)))];
}

export function normalizeAcademicRecord(completed: unknown, current: unknown): AcademicRecord {
  const completedCourses = normalizeCourses(completed);
  return { completedCourses, currentCourses: normalizeCourses(current).filter(c => !completedCourses.includes(c)) };
}

export function evaluateRule(rule: Rule, record: AcademicRecord): RuleResult {
  if (rule.kind === "unknown") return { status: "unknown", completed: [], inProgress: [], options: [], explanation: rule.reason };
  if (rule.kind === "course") {
    const done = record.completedCourses.includes(rule.code);
    const current = record.currentCourses.includes(rule.code);
    return {
      status: done ? "reported_complete" : current ? "in_progress" : "missing",
      completed: done ? [rule.code] : [], inProgress: current ? [rule.code] : [],
      options: done || current ? [] : [rule.code],
      explanation: done ? "Reported completed; grade and credit acceptance are not verified."
        : current ? "Conditional on successful completion and accepted credit." : "Not recorded as completed or in progress.",
    };
  }
  if (!rule.rules.length) return { status: "unknown", completed: [], inProgress: [], options: [], explanation: "No rules have been supplied." };
  const children = rule.rules.map(r => evaluateRule(r, record));
  if (rule.kind === "any") {
    const chosen = children.find(r => r.status === "reported_complete") ?? children.find(r => r.status === "in_progress");
    if (chosen) return chosen;
  }
  const status = children.every(r => r.status === "reported_complete") ? "reported_complete"
    : children.some(r => r.status === "unknown") ? "unknown"
    : rule.kind === "all" && children.every(r => r.status === "reported_complete" || r.status === "in_progress") ? "in_progress" : "missing";
  return {
    status,
    completed: [...new Set(children.flatMap(r => r.completed))],
    inProgress: [...new Set(children.flatMap(r => r.inProgress))],
    options: [...new Set(children.flatMap(r => r.options))],
    explanation: rule.kind === "all" ? "Every component is required; completion is based on student reports."
      : "One alternative is required; options are not an enrollment eligibility check.",
  };
}

export function auditRequirements(requirements: Requirement[], record: AcademicRecord) {
  return requirements.map(requirement => ({ ...requirement, ...evaluateRule(requirement.rule, record) }));
}
