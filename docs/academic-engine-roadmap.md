# Academic engine implementation

## First increment (2026-09-20)

- Pure shared AND/OR/course/unknown evaluator with stable requirement IDs.
- Partial CS comparison against the live 2026–2027 catalog, reviewed 2026-09-20.
- Fixed courses, introductory alternatives, and statistics component are explicit.
- Reported completion is distinct from in-progress and unknown; no grade verification is implied.
- Planner receives completed coursework separately, never infers it from standing, and exposes earlier unfinished sample slots.
- Planner and chat planning context consume the same partial audit.

This is not a complete degree audit or prerequisite solver. The catalog year has
not yet been collected from the student. Do not use this comparison to certify
graduation, eligibility, or the validity of the legacy sample-based schedule.
Current and completed overlap is treated as completed by the legacy code-list
adapter; repeated attempts need the richer record model below.

Source: https://catalog.uic.edu/ucat/colleges-depts/engineering/cs/bs-cs/

## Ordered next increments and acceptance criteria

### Import parser increment (2026-09-20)

`lib/academic/uachieve-import.ts` parses expanded website copy/paste text into a
review-only result. It has been checked against a user-provided audit locally;
the original audit, name, and UIN are not stored in the repository. Tests use a
synthetic miniature document. The planner now provides a paste-and-review UI and
confirmed account persistence. This is not a PDF importer.

Important format findings:

- Preserve the six-digit catalog code exactly. An older catalog code must not
  silently select the current 2026–2027 rule snapshot.
- Use ALL COURSES for attempts; requirement rows are separate allocations.
  Split allocations can repeat a course with partial hours without indicating
  multiple attempts.
- Keep earned transcript hours separate from earned degree hours; a required
  seminar can fulfill a requirement without contributing graduation credit.
- Preserve requirement status even when no explanatory course row is shown.
- Keep IP grades conditional, and retain special grades/markers for review.
- Flag exception summaries; do not infer the meaning of internal exception codes.
- The supplied print PDF loses explicit completion-status labels in extracted
  text. Do not send it through the website-text parser or infer status from order.

The UI parses locally, shows requirements, credits, per-attempt choices, warnings,
and course removals. A checkbox confirms replacement of completed/current lists.
The server reparses and revalidates choices, storing a structured audit snapshot
in the existing versioned profile envelope. Names, UINs, and original pasted text
are not stored. Ordinary profile edits preserve the snapshot. Snapshot evidence
is historical; subsequent manual course edits do not alter its original rows.

Known imported catalog codes disable the current-catalog CS rule comparison until
an explicit reviewed mapping exists. Saved major and standing remain unchanged.
Failed/withdrawn/unknown grades are excluded; repeated courses require selecting
at most one attempt. Reported completion does not establish minimum-grade credit.

Validation: unit tests cover choice validation, repeated attempts, account/device
round trips and catalog gating. `scripts/test-audit-import-ui.mjs` checks preview,
confirmation, failed-save retry, reload, mobile layout and signed-out protection
against mocked account endpoints, with no database writes. Run with a local dev
server using `node --experimental-strip-types scripts/test-audit-import-ui.mjs`.

Next import work: explicit catalog mapping, richer dedicated record storage,
subrequirement/option/footnote extraction, and a separate PDF extraction adapter.
Do not convert course grades into accepted requirement credit without policy checks.

1. Add catalog year, entry route, concentration, course attempts, grades, awarded
   credits, institution, equivalencies, and evidence provenance to the persisted
   student record. Preserve old profiles through an explicit adapter. Confirm
   catalog applicability before declaring any requirement verified.
2. Encode science bundles, mathematics credits and credit exclusions, technical
   elective count/credits and outside-CS limit, and MCS 471 allocation. Add a
   global allocation solver: do not greedily consume courses across buckets.
3. Source and review Gen Ed categories and overlap, CS-approved humanities lists,
   free electives, university/college GPA, residency, total-credit, repeat, and
   exception policies. ENGR seminar credit must not inflate graduation credits.
4. Add prerequisite/corequisite expressions, minimum grades, enrollment
   restrictions, and known term offerings. Missing data returns unknown, never
   eligible. Test course and credit equivalencies independently.
5. Replace sample-schedule rearrangement with a constraint-based planner and an
   independent plan validator. Preserve unmet requirements beyond the requested
   display horizon. An impossible deadline must yield an explanation.
6. Route all academic answers (including deterministic chat shortcuts) through
   the shared engine; render structured results without model authority to
   override them. The first increment only adds shared planning context.
7. Compare with permissioned, anonymized uAchieve cases and advisor-reviewed
   expectations. Track discrepancies for transfers, repeats, AP/IB, substitutions,
   grade thresholds, overlap, and changed programs before broader release.
8. Expand per program/catalog version and review source changes before promotion.

## Archived CS rules increment (2026-09-21)

`lib/academic/cs-2024.ts` now provides a separate, versioned base-CS rule set.
The supported imported program is exactly `0112 BS: Computer Science`, catalog
`202408`. The Fall 2024 mapping is provisional, corroborated by the supplied
audit and archive; institutional confirmation is still needed. Other catalogs,
concentrations, and missing imports do not fall back to current-catalog rules.

Implemented checks:

- Archived fixed courses, introductory alternatives, and zero-credit CS 499.
- ENGR 100 completion separately from degree credit.
- Mathematics: nine reported credits, required statistics component, IE 342
  exclusions, and one linear-algebra alternative (MATH 218/310/320).
- Technical electives: six courses AND 18 reported credits, at most one outside
  CS. CS 398 approval remains unresolved rather than automatically allocated.
- Science: two distinct choices AND eight reported credits; paired chemistry
  lectures/labs and their honors alternatives count as a single choice each.
- MCS 471 is explicitly unallocated and both affected groups remain unknown
  until allocation is resolved. This increment is not a global allocation solver.
- Completed and projected (including IP) checks remain distinct. Credit checks
  fail closed when course lists differ from the reviewed import or split-credit
  markers require review. Course-presence checks remain student-reported.
- Planner API loads credit evidence from the authenticated saved profile, never
  a client-supplied snapshot. Sparky planning context calls the same engine.

Sources reviewed: [2024–2025 archived catalog, printed pages 245–247](https://catalog.uic.edu/ucat/archive-links/UIC_Undergraduate_Catalog_2024-2025.pdf#page=246)
and [Spring 2026 MATH schedule documenting MATH 218 as formerly MATH 310](https://webcs7.osss.uic.edu/schedule-of-classes/static/schedules/spring-2026/MATH.html).
The catalog's tables and footnotes were visually checked. CS 398's conservative
review gate also reflects the documentation condition in the supplied audit;
this implementation does not infer project approval from a course code.

Validation uses synthetic regression cases plus a local comparison against the
provided audit; no original audit or identity is committed. The local comparison
matches fixed remaining courses, three additional mathematics credits, six/18
technical electives, and conditional science completion.

Still unresolved: confirmed catalog applicability, source-effective equivalency
dates beyond this case, minimum-grade/transfer acceptance, global allocations,
Gen Ed/HSSA categories, free electives, degree/core-credit reconciliation, GPA,
residency, and exceptions. No summed transcript total is called a degree total.
The existing semester schedule is still sample-based and may differ from this
archived audit; it is not a validated recommendation. The next increment should
reconcile imported requirement outcomes and exceptions before scheduling.

## Useful user input, when available

An anonymized CS uAchieve audit with its catalog year and expected remaining
requirements would provide a validation case. Remove names, UINs, and contact
information. No university account credentials are needed. Additional catalog
years and concentrations require their own reviewed rules before support.
