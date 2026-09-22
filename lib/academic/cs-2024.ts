import { auditRequirements, type AcademicRecord, type Requirement, type RuleResult } from "./audit.ts";
import { reviewImport, type SavedAuditImport } from "./audit-import-review.ts";

export const CS_2024_SOURCE = "https://catalog.uic.edu/ucat/archive-links/UIC_Undergraduate_Catalog_2024-2025.pdf#page=246";
export const LINEAR_ALGEBRA_SOURCE = "https://webcs7.osss.uic.edu/schedule-of-classes/static/schedules/spring-2026/MATH.html";
export const CS_2024_MATH = ["IE 342", "STAT 381", "MATH 215", "MATH 220", "MATH 310", "MATH 320", "MATH 430", "MATH 435", "MATH 436", "MCS 421", "MCS 423", "MCS 471", "STAT 401", "STAT 473"];
export const CS_2024_TECH = [
  ..."351 378 398 402 407 411 412 415 418 421 422 424 425 426 427 428 440 441 442 450 453 454 455 461 463 466 468 473 474 476 477 478 479 480 483 484 485 487 488 489".split(" ").map(n => `CS ${n}`),
  "ECE 469", "IT 301", "IT 302", "MCS 320", "MCS 425", "MCS 471", "MCS 481", "STAT 471",
];
// Each outer entry is one science choice; inner entries are alternatives.
const science = [
  [["BIOS 110"]], [["BIOS 120"]], [["CHEM 122", "CHEM 123"], ["CHEM 116"]],
  [["CHEM 124", "CHEM 125"], ["CHEM 118"]], [["PHYS 141"]], [["PHYS 142"]], [["EAES 101"]], [["EAES 111"]],
];
const canonical = (code: string) => code === "MATH 218" ? "MATH 310" : code;
const same = (a: string[], b: string[]) => a.length === b.length && a.every(c => b.includes(c));

/** Catalog selection is deliberately narrow. 202408 -> Fall 2024 is a working
 * mapping corroborated by the supplied audit, not an institutional code registry.
 * Only the base 0112 BS is supported; concentrations need their own rules.
 */
export function supportsCs2024(snapshot?: SavedAuditImport) {
  return snapshot?.metadata.catalogCode === "202408"
    && /^0112\s+BS:\s*Computer Science\s*$/i.test(snapshot.metadata.program ?? "");
}

export function auditCs2024(record: AcademicRecord, snapshot: SavedAuditImport) {
  let fresh = false;
  try {
    const saved = reviewImport({ ...snapshot, format: "uic-uachieve-pasted-text", requiresReview: true }, snapshot.choices);
    fresh = same(saved.completedCourses, record.completedCourses) && same(saved.currentCourses, record.currentCourses);
  } catch { /* An invalid/stale snapshot must not establish credit completion. */ }
  const rows = snapshot.attempts.filter((a, i) => snapshot.choices[i] !== "skip"
    && (snapshot.choices[i] === "completed" ? record.completedCourses : record.currentCourses).includes(a.code));
  const creditEvidenceNeedsReview = rows.some(a => !Number.isFinite(a.hours) || a.hours < 0 || a.flags.includes(">S"));
  const available = [...record.completedCourses, ...record.currentCourses].map(canonical);
  const shared = available.includes("MCS 471");
  const hasIE = available.includes("IE 342");
  const hasLinear = available.some(c => ["MATH 310", "MATH 320"].includes(c));
  const mathOptions = CS_2024_MATH.filter(c => !(hasIE && ["STAT 381", "STAT 401"].includes(c))
    && !(hasLinear && ["MATH 310", "MATH 320"].includes(c)));
  const credits = (code: string) => rows.find(a => a.code === code)?.hours ?? 0;
  const candidates = (projected: boolean) => (projected ? [...record.completedCourses, ...record.currentCourses] : record.completedCourses);
  const hours = (codes: string[]) => codes.reduce((sum, c) => sum + credits(c), 0);
  const mathSelection = (projected: boolean) => {
    const selected = candidates(projected).filter(c => CS_2024_MATH.includes(canonical(c)) && c !== "MCS 471"
      && !(hasIE && ["STAT 381", "STAT 401"].includes(c)));
    const linear = selected.filter(c => ["MATH 310", "MATH 320"].includes(canonical(c))).sort((a, b) => credits(b) - credits(a))[0];
    return selected.filter(c => !["MATH 310", "MATH 320"].includes(canonical(c)) || c === linear);
  };
  const techSelection = (projected: boolean) => {
    const selected = candidates(projected).filter(c => CS_2024_TECH.includes(c) && !["CS 398", "MCS 471"].includes(c));
    // Maximize accepted hours subject to six courses and at most one outside CS.
    const cs = selected.filter(c => c.startsWith("CS ")).sort((a, b) => credits(b) - credits(a));
    const outside = selected.filter(c => !c.startsWith("CS ")).sort((a, b) => credits(b) - credits(a))[0];
    return [...cs.slice(0, 6), ...(outside ? [outside] : [])].sort((a, b) => credits(b) - credits(a)).slice(0, 6);
  };
  const scienceSelection = (projected: boolean) => {
    const all = candidates(projected);
    return science.flatMap(group => {
      const selected = group.filter(bundle => bundle.every(c => all.includes(c))).sort((a, b) => hours(b) - hours(a))[0];
      return selected ? [selected] : [];
    }).sort((a, b) => hours(b) - hours(a)).slice(0, 2);
  };
  type Check = { codes: string[]; satisfied: boolean; detail: string };
  const mathCheck = (projected: boolean): Check => {
    const codes = mathSelection(projected);
    const stats = codes.some(c => c === "IE 342" || c === "STAT 381");
    return { codes, satisfied: hours(codes) >= 9 && stats,
      detail: `${hours(codes)}/9 reported credits; ${Math.max(0, 9 - hours(codes))} additional credits${stats ? "" : "; IE 342 or STAT 381 also required"}` };
  };
  const techCheck = (projected: boolean): Check => {
    const codes = techSelection(projected);
    return { codes, satisfied: codes.length >= 6 && hours(codes) >= 18,
      detail: `${codes.length}/6 courses and ${hours(codes)}/18 reported credits; ${Math.max(0, 6 - codes.length)} courses and ${Math.max(0, 18 - hours(codes))} credits still needed` };
  };
  const scienceCheck = (projected: boolean): Check => {
    const bundles = scienceSelection(projected), codes = bundles.flat();
    return { codes, satisfied: bundles.length >= 2 && hours(codes) >= 8,
      detail: `${bundles.length}/2 complete science choices and ${hours(codes)}/8 reported credits` };
  };
  const group = (id: string, label: string, check: (projected: boolean) => Check, options: string[], policy: string, unresolved = false) => {
    const done = check(false), projected = check(true);
    const result: RuleResult = {
      status: !fresh || unresolved || creditEvidenceNeedsReview ? "unknown" : done.satisfied ? "reported_complete" : projected.satisfied ? "in_progress" : "missing",
      completed: done.codes, inProgress: projected.codes.filter(c => record.currentCourses.includes(c)),
      options: projected.satisfied && !unresolved ? [] : options.filter(c => !available.includes(canonical(c))),
      explanation: `${fresh && !creditEvidenceNeedsReview ? `Completed: ${done.detail}. Including current courses: ${projected.detail}.` : "Course lists changed, credit markers need review, or import evidence is invalid; re-import/review the audit before trusting credit totals."} ${policy} Reported credits are not independently verified institutional credit acceptance.`,
    };
    return { id, label, source: CS_2024_SOURCE, rule: { kind: "unknown" as const, reason: "Evaluated by the catalog credit-group checker." }, ...result };
  };
  // Keep this version independent of the live catalog, even when it changes.
  const fixed: Requirement[] = [
    { id: "cs.intro", label: "Introductory programming: one alternative", source: CS_2024_SOURCE,
      rule: { kind: "any", rules: ["CS 111", "CS 112", "CS 113"].map(code => ({ kind: "course", code })) } },
    ...["ENGL 160", "ENGL 161", "MATH 180", "MATH 181", "MATH 210", "CS 141", "CS 151", "CS 211", "CS 251", "CS 261", "CS 277", "CS 301", "CS 341", "CS 342", "CS 361", "CS 362", "CS 377", "CS 401", "CS 499"].map(code => ({
      id: `cs.course.${code.replace(" ", "-")}`, label: code, source: CS_2024_SOURCE, rule: { kind: "course" as const, code },
    })),
    { id: "cs.statistics", label: "Statistics component of required mathematics", source: CS_2024_SOURCE,
      rule: { kind: "any", rules: (hasIE ? ["IE 342"] : ["IE 342", "STAT 381"]).map(code => ({ kind: "course", code })) } },
    ...[
      ["gened", "General education and humanities/social sciences/art", "Category allocation and the six additional department-approved HSSA credits are not yet evaluated. Preserve imported audit outcomes as separate evidence."],
      ["free", "Free electives", "The catalog specifies nine free-elective credits. Accepted credits, exclusions, and allocation toward the 128-credit degree minimum are unresolved; do not assume nine remain."],
      ["graduation", "University and college graduation requirements", "128 accepted degree credits, the 46-credit engineering core, grades, GPA, residency, transfer policies, and exceptions need verification. ENGR 100 does not count toward degree credits. Transcript hours must not be substituted for degree hours."],
    ].map(([id, label, reason]) => ({ id: `cs.${id}`, label, source: CS_2024_SOURCE, rule: { kind: "unknown" as const, reason } })),
  ];
  const requirements = auditRequirements(fixed, record);
  requirements.push(...auditRequirements([{ id: "cs.seminar", label: "ENGR 100 (not degree credit)", source: CS_2024_SOURCE, rule: { kind: "course", code: "ENGR 100" } }], record));
  requirements.push(
    group("cs.math", "Required mathematics: 9 credits", mathCheck, mathOptions,
      `IE 342 excludes STAT 381 and STAT 401. Count only one of MATH 218/310/320. MATH 218 replaces MATH 310 (${LINEAR_ALGEBRA_SOURCE}).${shared ? " MCS 471 is unallocated: choose mathematics OR technical electives with an advisor; never both." : " MCS 471 can count in mathematics OR technical electives, not both."}`, shared),
    group("cs.technical", "Technical electives: six courses / 18 credits", techCheck,
      CS_2024_TECH.filter(c => c.startsWith("CS ") || !techSelection(true).some(code => !code.startsWith("CS "))),
      `At most one course outside CS. CS 398 is not automatically allocated: project/documentation approval needs review.${shared ? " MCS 471 is unallocated pending a choice of mathematics OR technical electives." : " MCS 471 cannot also count toward mathematics."}`, shared || available.includes("CS 398")),
    group("cs.science", "Science electives: two choices / 8 credits", scienceCheck,
      science.filter(alternatives => !alternatives.some(bundle => bundle.every(c => available.includes(c))))
        .flatMap(alternatives => alternatives.map(bundle => bundle.filter(c => !available.includes(c)).join(" + "))),
      "CHEM 122 + 123 and CHEM 124 + 125 are lecture/lab bundles; CHEM 116 and 118 are their respective alternatives, not additional independent choices."),
  );
  return {
    program: "Computer Science BS", catalogYear: "2024-2025", reviewedOn: "2026-09-21", source: CS_2024_SOURCE,
    scope: "partial" as const, record, requirements,
    notice: `Partial archived-catalog comparison. Catalog code 202408 is provisionally mapped to Fall 2024 (2024–2025); confirm with UIC. Fixed courses and selected elective constraints are checked, not prerequisite eligibility, general-education allocation, accepted degree-credit totals, GPA, residency, or graduation clearance.${fresh ? "" : " The imported course snapshot no longer matches this record; credit-group statuses are unresolved."}${snapshot.exceptions.length ? " Imported exceptions require advisor review; no waiver or substitution has been inferred." : ""} The schedule remains sample-based.`,
  };
}
