/** Parse pasted UIC uAchieve text as evidence, never as executable instructions.
 * Import previews deliberately omit names, UINs, and the original document.
 * Supports the expanded website copy/paste format, not arbitrary PDF text.
 */
export type AuditCourseAttempt = {
  term: string;
  code: string;
  hours: number;
  grade: string;
  flags: string[];
  status: "in_progress" | "graded" | "needs_review";
  sourceLine: number;
};

export type ImportedRequirement = {
  title: string;
  status: "complete" | "in_progress" | "unfulfilled" | "unspecified";
  earnedHours: number | null;
  inProgressHours: number | null;
  neededHours: number | null;
  requiredHours: number | null;
  appliedCourses: AuditCourseAttempt[];
  sourceLine: number;
};

const COURSE_ROW = /^(?:IP\s+)?((?:FA|WS|SP|SU|SS)\d{2,4})\s+([A-Z&]{2,5})\s+(\d{3}[A-Z]?)\s+(\d+(?:\.\d+)?)\s+([A-Z][A-Z+*\-]*)(?=\s|$)(.*)$/;

function courseRow(line: string, sourceLine: number): AuditCourseAttempt | null {
  const match = line.match(COURSE_ROW);
  if (!match) return null;
  const [, term, subject, number, hours, grade, tail] = match;
  const flags = tail.match(/>[A-Z]/g) ?? [];
  return {
    term, code: `${subject} ${number}`, hours: Number(hours), grade, flags, sourceLine,
    status: grade === "IP" ? "in_progress"
      : /^(?:[ABCDF][+\-]?|S\*?|U|CR|NC|P|NP|W)$/.test(grade) ? "graded" : "needs_review",
  };
}

function metric(lines: string[], label: string): number | null {
  const match = lines.join("\n").match(new RegExp(`${label}:\\s*(\\d+(?:\\.\\d+)?)\\s*HOURS`, "i"));
  return match ? Number(match[1]) : null;
}

export function parseUachieveText(text: string) {
  if (text.length > 1_000_000) throw new Error("Audit text is too large. Paste only the expanded audit results.");
  const lines = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").split("\n").map(line => line.trim());
  const requirements: ImportedRequirement[] = [];
  const warnings: string[] = [];
  const program = text.match(/Program:\s*([^\r\n]+)/)?.[1]?.trim() ?? null;
  // Preserve the institution's catalog code; do not guess its year mapping.
  const catalogCode = text.match(/Catalog Year:\s*(\d{6})\b/)?.[1] ?? null;
  const preparedOn = text.match(/Prepared On:\s*([^\r\n]+)/)?.[1]?.trim() ?? null;
  const starts = lines.flatMap((line, index) => /^Requirement:/.test(line) ? [index] : []);

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const block = lines.slice(start, starts[i + 1] ?? lines.length);
    const header = block[0].match(/^Requirement:\s*(.*?)\t+Requirement(?: (Complete|In Progress|Unfulfilled))?(?:\t+(.*))?$/);
    if (!header) {
      warnings.push(`Unrecognized requirement header at line ${start + 1}; use the expanded website copy/paste format.`);
      continue;
    }
    const title = (header[1] || header[3] || "Untitled requirement").trim();
    requirements.push({
      title,
      status: header[2] === "Complete" ? "complete" : header[2] === "In Progress" ? "in_progress"
        : header[2] === "Unfulfilled" ? "unfulfilled" : "unspecified",
      earnedHours: metric(block, "EARNED"), inProgressHours: metric(block, "In-Prog"), neededHours: metric(block, "NEEDS"),
      requiredHours: (() => {
        const match = block.join("\n").match(/(?:^|\n)(\d+(?:\.\d+)?)\s+hours required\b/i);
        return match ? Number(match[1]) : null;
      })(),
      appliedCourses: block.flatMap((line, offset) => {
        const row = courseRow(line, start + offset + 1);
        return row ? [row] : [];
      }),
      sourceLine: start + 1,
    });
  }

  const allCourses = requirements.find(r => r.title === "ALL COURSES");
  const degreeHours = requirements.find(r => r.title === "Total Degree Hours");
  // Do not flatten every requirement's rows: those are allocations, not new attempts.
  const attempts = allCourses?.appliedCourses ?? [];
  if (allCourses) {
    const start = allCourses.sourceLine - 1;
    const end = starts.find(index => index > start) ?? lines.length;
    for (let i = start + 1; i < end; i++) {
      if (/^(?:IP\s+)?(?:FA|WS|SP|SU|SS)\d{2,4}\s+[A-Z&]{2,5}\s+\d/.test(lines[i]) && !courseRow(lines[i], i + 1)) {
        warnings.push(`Unrecognized course row at line ${i + 1}; course history may be incomplete.`);
      }
    }
  }
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const key = `${attempt.term}:${attempt.code}`;
    if (seen.has(key)) warnings.push(`Repeated course/term in ALL COURSES: ${attempt.code} (${attempt.term}); review rather than automatically merging.`);
    seen.add(key);
    if (attempt.status === "needs_review") warnings.push(`Unrecognized grade for ${attempt.code}; do not infer completion.`);
  }
  const exceptionStart = lines.findIndex(line => line.includes("EXCEPTION SUMMARY"));
  const exceptionLines = exceptionStart < 0 ? [] : lines.slice(exceptionStart + 1)
    .filter(line => /(?:\bRCRSE=|\bYT=|\bAC=|\bRC=)/.test(line));
  if (!catalogCode) warnings.push("Catalog code is missing; no catalog rules can be selected automatically.");
  if (!allCourses) warnings.push("ALL COURSES is missing; no course history was imported. Expand all sections before copying.");
  if (!degreeHours) warnings.push("Total Degree Hours is missing; degree-credit totals are unknown.");
  if (exceptionLines.length) warnings.push("An exception summary is present. Its codes require review before applying waivers or substitutions.");
  const sum = (status: AuditCourseAttempt["status"]) => attempts.filter(a => a.status === status).reduce((total, a) => total + a.hours, 0);
  if (allCourses?.inProgressHours != null && Math.abs(sum("in_progress") - allCourses.inProgressHours) > 0.01) {
    warnings.push("Parsed in-progress credits do not match the audit summary; the import may be incomplete.");
  }
  if (attempts.some(a => a.flags.includes(">S"))) warnings.push("Split-credit markers appear in course history and need review.");

  return {
    format: "uic-uachieve-pasted-text" as const,
    requiresReview: true as const,
    metadata: { program, catalogCode, preparedOn },
    attempts,
    requirements,
    totals: {
      allCoursesEarned: allCourses?.earnedHours ?? null,
      degreeEarned: degreeHours?.earnedHours ?? null,
      degreeInProgress: degreeHours?.inProgressHours ?? null,
      degreeRequired: degreeHours?.requiredHours ?? null,
    },
    exceptions: exceptionLines.map((_, index) => ({ index: index + 1, status: "needs_review" as const })),
    warnings,
  };
}
