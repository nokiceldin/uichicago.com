import { auditRequirements, normalizeAcademicRecord, type Requirement, type Rule } from "./audit.ts";
import { auditCs2024, supportsCs2024 } from "./cs-2024.ts";
import type { SavedAuditImport } from "./audit-import-review.ts";

const source = "https://catalog.uic.edu/ucat/colleges-depts/engineering/cs/bs-cs/";
const course = (code: string): Rule => ({ kind: "course", code });
const any = (...codes: string[]): Rule => ({ kind: "any", rules: codes.map(course) });
const requirement = (id: string, label: string, rule: Rule): Requirement => ({ id, label, source, rule });

/** Narrow, reviewed subset of the live 2026–2027 catalog, checked 2026-09-20.
 * Deliberately does not infer elective allocation, grades, or graduation eligibility.
 */
export const csRequirements: Requirement[] = [
  requirement("cs.intro", "Introductory programming: one alternative", any("CS 111", "CS 112", "CS 113")),
  ...["ENGL 160", "ENGL 161", "MATH 180", "MATH 181", "MATH 210", "CS 141", "CS 151", "CS 211", "CS 251", "CS 261", "CS 277", "CS 301", "CS 341", "CS 342", "CS 361", "CS 362", "CS 377", "CS 401", "CS 499"]
    .map(code => requirement(`cs.course.${code.replace(" ", "-")}`, code, course(code))),
  requirement("cs.statistics", "Statistics component of required mathematics", any("IE 342", "STAT 381")),
  ...[
    ["seminar", "Engineering seminar", "Entry route is needed to choose ENGR 100 or ENGR 101; its credit does not count toward graduation."],
    ["math", "Required mathematics: 9 credits", "Credit amounts, approved choices, IE 342 credit exclusions, and MCS 471 allocation still require verification."],
    ["technical", "Technical electives: six courses / 18 credits", "Approved choices, outside-CS limit, and overlap with mathematics are not yet evaluated."],
    ["science", "Science electives", "Two approved science choices are required; chemistry lecture/lab combinations must be evaluated together. Allocation is not yet implemented."],
    ["gened", "General education and humanities/social sciences/art", "Approved categories, department-approved electives, and overlap policies are not yet evaluated."],
    ["free", "Free electives", "Accepted credits and allocation toward the nine-credit requirement are not yet evaluated."],
    ["graduation", "University and college graduation requirements", "Total accepted credits, grades, GPA, residency, exceptions, and other university/college policies are not yet evaluated."],
  ].map(([id, label, reason]) => requirement(`cs.${id}`, label, { kind: "unknown", reason })),
];

export function buildCsAudit(major: string, completed: unknown, current: unknown, importedCatalogCode?: string | null, snapshot?: SavedAuditImport) {
  // Exact aliases only: CS + Design / Linguistics / concentrations need distinct rules.
  if (!["cs", "computer science", "computer-science", "computer-science-bs", "computer science - bs", "computer science, bs", "computer science, b.s."].includes(major.trim().toLowerCase())) return null;
  const record = normalizeAcademicRecord(completed, current);
  const catalogCode = importedCatalogCode || snapshot?.metadata.catalogCode;
  if (catalogCode) {
    return catalogCode === "202408" && supportsCs2024(snapshot) && snapshot
      ? auditCs2024(record, snapshot) : null;
  }
  return {
    program: "Computer Science BS", catalogYear: "2026-2027", reviewedOn: "2026-09-20", source,
    scope: "partial" as const,
    notice: "Partial comparison with the 2026–2027 CS catalog. Your applicable catalog year, grades, accepted credits, prerequisites, and remaining policy rules have not been verified. This is not graduation clearance or a validated schedule.",
    record,
    requirements: auditRequirements(csRequirements, record),
  };
}

export type CsAudit = NonNullable<ReturnType<typeof buildCsAudit>>;

export function formatCsAuditForChat(audit: CsAudit) {
  return [
    "SHARED RULE AUDIT — authoritative only for the limited checks listed here.",
    audit.notice,
    ...audit.requirements.map(r => `${r.id}: ${r.status}; ${r.label}; completed=${r.completed.join(",") || "none"}; in progress=${r.inProgress.join(",") || "none"}; options=${r.options.join(",") || "none"}. ${r.explanation}`),
    "Do not infer completion from standing. Do not claim options are eligible to enroll or that this audit validates the schedule. Ask for the applicable catalog year when unknown.",
  ].join("\n");
}
