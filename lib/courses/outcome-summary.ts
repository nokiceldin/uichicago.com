export type CourseOutcomeCounts = {
  a?: number | null;
  b?: number | null;
  c?: number | null;
  d?: number | null;
  f?: number | null;
  w?: number | null;
};

export type CourseOutcomeSummary = {
  a: number;
  b: number;
  c: number;
  d: number;
  f: number;
  w: number;
  letterGradeTotal: number;
  visibleOutcomeTotal: number;
  cOrBetterRate: number | null;
  dOrBetterRate: number | null;
  withdrawalRate: number | null;
  mostCommonLetterGrade: string | null;
};

function count(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

/**
 * Canonical course outcome calculations shared by course pages and Sparky.
 * Grade-attainment rates use A–F as the denominator. Withdrawal rate uses
 * A–F plus W because withdrawals are not letter grades.
 */
export function summarizeCourseOutcomes(counts: CourseOutcomeCounts): CourseOutcomeSummary {
  const a = count(counts.a);
  const b = count(counts.b);
  const c = count(counts.c);
  const d = count(counts.d);
  const f = count(counts.f);
  const w = count(counts.w);
  const letterGradeTotal = a + b + c + d + f;
  const visibleOutcomeTotal = letterGradeTotal + w;
  const letterGrades = [
    { label: "A", value: a },
    { label: "B", value: b },
    { label: "C", value: c },
    { label: "D", value: d },
    { label: "F", value: f },
  ];

  return {
    a,
    b,
    c,
    d,
    f,
    w,
    letterGradeTotal,
    visibleOutcomeTotal,
    cOrBetterRate: letterGradeTotal > 0 ? ((a + b + c) / letterGradeTotal) * 100 : null,
    dOrBetterRate: letterGradeTotal > 0 ? ((a + b + c + d) / letterGradeTotal) * 100 : null,
    withdrawalRate: visibleOutcomeTotal > 0 ? (w / visibleOutcomeTotal) * 100 : null,
    mostCommonLetterGrade: letterGradeTotal > 0
      ? letterGrades.reduce((best, current) => current.value > best.value ? current : best).label
      : null,
  };
}

const TERM_ORDER: Record<string, number> = { SP: 0, SU: 1, FA: 2 };

function termSortKey(code: string) {
  const match = code.match(/^(\d{4})(SP|SU|FA)$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 10 + TERM_ORDER[match[2]];
}

export function formatCourseTermScope(terms: Array<{ code: string; name: string | null }>) {
  const ordered = [...terms].sort((left, right) => termSortKey(left.code) - termSortKey(right.code));
  if (ordered.length === 0) return "No term-level grade data";
  const first = ordered[0].name?.trim() || ordered[0].code;
  const last = ordered[ordered.length - 1].name?.trim() || ordered[ordered.length - 1].code;
  return first === last ? first : `${first}–${last}`;
}
