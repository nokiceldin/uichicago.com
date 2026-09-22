import { parseUachieveText, type AuditCourseAttempt } from "./uachieve-import.ts";

export type ImportChoice = "completed" | "in_progress" | "skip";
export type AuditPreview = ReturnType<typeof parseUachieveText>;

export function allowedChoice(attempt: AuditCourseAttempt): ImportChoice {
  if (attempt.grade === "IP") return "in_progress";
  // A passing transcript grade is reported completion, not proof of satisfying
  // the minimum grade or accepted-credit policy of an individual requirement.
  return /^(?:[ABCD][+\-]?|S\*?|P|CR)$/.test(attempt.grade) ? "completed" : "skip";
}

export function defaultImportChoices(audit: AuditPreview): ImportChoice[] {
  return audit.attempts.map(attempt => audit.attempts.filter(a => a.code === attempt.code).length > 1
    ? "skip" : allowedChoice(attempt));
}

export function reviewImport(audit: AuditPreview, choices: unknown) {
  if (!audit.attempts.length) throw new Error("No course history was found. Copy the audit with all sections expanded.");
  if (!audit.metadata.catalogCode || !audit.metadata.program) throw new Error("The audit must include its program and catalog code.");
  if (!Array.isArray(choices) || choices.length !== audit.attempts.length) throw new Error("Review every course row before importing.");
  const completedCourses: string[] = [];
  const currentCourses: string[] = [];
  const selected = new Set<string>();
  choices.forEach((choice, index) => {
    if (choice === "skip") return;
    const attempt = audit.attempts[index];
    if (choice !== allowedChoice(attempt) || choice === "skip") throw new Error(`Unsupported completion choice for ${attempt.code}.`);
    if (selected.has(attempt.code)) throw new Error(`Choose only one attempt for ${attempt.code}; repeated coursework needs review.`);
    selected.add(attempt.code);
    (choice === "completed" ? completedCourses : currentCourses).push(attempt.code);
  });
  if (!selected.size) throw new Error("Select at least one course to import.");
  return { completedCourses, currentCourses };
}

export function prepareAuditImport(text: string, choices: unknown, importedAt = new Date().toISOString()) {
  const audit = parseUachieveText(text);
  return prepareParsedAuditImport(audit, choices, importedAt);
}

export function prepareParsedAuditImport(audit: AuditPreview, choices: unknown, importedAt = new Date().toISOString()) {
  const courses = reviewImport(audit, choices);
  return {
    ...courses,
    auditImport: {
      version: 1 as const,
      importedAt,
      // Structured academic evidence only; never persist the pasted text or identity.
      metadata: audit.metadata,
      attempts: audit.attempts,
      totals: audit.totals,
      requirements: audit.requirements,
      exceptions: audit.exceptions,
      warnings: audit.warnings,
      choices: choices as ImportChoice[],
    },
  };
}

export type SavedAuditImport = ReturnType<typeof prepareAuditImport>["auditImport"];

export function selectedCurrentCoursesFromSavedImport(auditImport: SavedAuditImport | null | undefined) {
  if (!auditImport) return [];
  return auditImport.attempts.flatMap((attempt, index) =>
    auditImport.choices[index] === "in_progress" ? [attempt.code] : [],
  );
}

/** Replace courses supplied by the previous audit without deleting classes the
 * student added manually. Newly completed courses cannot remain in progress. */
export function mergeCurrentCoursesAfterAuditImport(
  existingCurrentCourses: string[],
  previousAuditImport: SavedAuditImport | null | undefined,
  importedCurrentCourses: string[],
  importedCompletedCourses: string[],
) {
  const previousAuditCurrent = new Set(selectedCurrentCoursesFromSavedImport(previousAuditImport));
  const newlyCompleted = new Set(importedCompletedCourses);
  return [...new Set([
    ...existingCurrentCourses.filter(code => !previousAuditCurrent.has(code)),
    ...importedCurrentCourses,
  ])].filter(code => !newlyCompleted.has(code));
}
