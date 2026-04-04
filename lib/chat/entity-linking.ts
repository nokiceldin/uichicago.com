export type SparkyLinkEntityPayload = {
  courseCodes: string[];
  professorAliases: Array<{
    name: string;
    slug: string;
  }>;
};

export type SparkyEntityLookup = {
  courseCodes: Set<string>;
  professorAliases: Map<string, string>;
};

export type SparkyTextMatch = {
  start: number;
  end: number;
  label: string;
  href: string;
};

const COURSE_CODE_REGEX = /\b([A-Z]{2,4}) (\d{3}[A-Z]?)\b/g;
const PROFESSOR_NAME_REGEX =
  /\b(?:Dr\.?\s+|Professor\s+)?([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})\b/g;

const PROFESSOR_TITLES = /^(dr|prof|professor)\s+/i;

export function normalizeCourseCode(value: string) {
  const text = String(value ?? "").trim().toUpperCase();
  const match = text.match(/^([A-Z]{2,4})\s+(\d{3}[A-Z]?)$/);
  if (!match) return "";
  return `${match[1]} ${match[2]}`;
}

export function buildCourseHref(code: string) {
  const normalized = normalizeCourseCode(code);
  if (!normalized) return "";
  const [subject, number] = normalized.split(" ");
  return `/courses/${encodeURIComponent(subject)}/${encodeURIComponent(number)}`;
}

export function buildProfessorHref(slug: string) {
  return `/professors/${encodeURIComponent(slug)}`;
}

export function normalizeProfessorName(value: string) {
  return String(value ?? "")
    .trim()
    .replace(PROFESSOR_TITLES, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/['".,]/g, "")
    .replace(/[^A-Za-z\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildSparkyEntityLookup(payload: SparkyLinkEntityPayload): SparkyEntityLookup {
  const courseCodes = new Set(
    (payload.courseCodes ?? [])
      .map((value) => normalizeCourseCode(value))
      .filter(Boolean)
  );

  const professorAliases = new Map<string, string>();
  for (const alias of payload.professorAliases ?? []) {
    const normalizedName = normalizeProfessorName(alias.name);
    if (!normalizedName || professorAliases.has(normalizedName)) continue;
    professorAliases.set(normalizedName, alias.slug);
  }

  return { courseCodes, professorAliases };
}

function findCourseMatches(text: string, lookup: SparkyEntityLookup) {
  const matches: SparkyTextMatch[] = [];

  for (const match of text.matchAll(COURSE_CODE_REGEX)) {
    const label = match[0];
    const normalized = normalizeCourseCode(label);
    if (!normalized || !lookup.courseCodes.has(normalized)) continue;

    const start = match.index ?? -1;
    if (start < 0) continue;

    matches.push({
      start,
      end: start + label.length,
      label,
      href: buildCourseHref(normalized),
    });
  }

  return matches;
}

function findProfessorMatches(text: string, lookup: SparkyEntityLookup) {
  const matches: SparkyTextMatch[] = [];

  for (const match of text.matchAll(PROFESSOR_NAME_REGEX)) {
    const label = match[0];
    const normalized = normalizeProfessorName(label);
    if (!normalized || normalized.split(" ").length < 2) continue;

    const slug = lookup.professorAliases.get(normalized);
    if (!slug) continue;

    const start = match.index ?? -1;
    if (start < 0) continue;

    matches.push({
      start,
      end: start + label.length,
      label,
      href: buildProfessorHref(slug),
    });
  }

  return matches;
}

export function findSparkyTextMatches(text: string, lookup: SparkyEntityLookup) {
  const candidates = [
    ...findCourseMatches(text, lookup),
    ...findProfessorMatches(text, lookup),
  ].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const resolved: SparkyTextMatch[] = [];
  let cursor = -1;

  for (const match of candidates) {
    if (match.start < cursor) continue;
    resolved.push(match);
    cursor = match.end;
  }

  return resolved;
}
