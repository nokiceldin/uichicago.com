import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import {
  generateProfessorSummary,
  type CourseRankSnippet,
} from "@/lib/generateProfessorSummary";
import { PROFESSOR_COURSE_MAP_FILE } from "@/lib/professors/course-map-config";

export type ProfessorDirectoryEntry = {
  id: string;
  slug: string;
  name: string;
  department: string;
  school: string;
  quality: number;
  ratingsCount: number;
  wouldTakeAgain: number | null;
  difficulty: number | null;
  url: string;
  aiSummary: string;
  salary: number | null;
  salaryTitle: string | null;
  score: number;
  isRated: boolean;
  isSynthetic: boolean;
  rawCourseMapKeys: string[];
  courseItems: string[];
  courseLabels: string[];
  dbProfessorId: string | null;
  dbName: string | null;
};

type ProfCoursesMap = Record<string, string[]>;

type DbProfessorRow = {
  id: string;
  slug: string;
  name: string;
  nameNormalized: string | null;
  department: string;
  school: string;
  rmpQuality: number | null;
  rmpDifficulty: number | null;
  rmpWouldTakeAgain: number | null;
  rmpRatingsCount: number | null;
  rmpUrl: string | null;
  aiSummary: string | null;
  salary: number | null;
  salaryTitle: string | null;
};

type NameParts = {
  normalized: string;
  tokens: string[];
  first: string;
  last: string;
  middle: string[];
  sourceLastTokens: string[];
};

const C = 20;
const M = 4.0;
const SYNTHETIC_SCHOOL = "University of Illinois Chicago";

const COURSE_DEPARTMENT_ALIASES: Record<string, string[]> = {
  ACTG: ["accounting"],
  ANTH: ["anthropology"],
  ARCH: ["architecture"],
  BIOS: ["biological sciences", "biology"],
  CD: ["urban planning"],
  CHEM: ["chemistry"],
  CLJ: ["criminal justice"],
  COMM: ["communication"],
  CS: ["computer science"],
  DES: ["design"],
  ECE: ["electrical engineering"],
  ECON: ["economics"],
  ENGL: ["english"],
  FIN: ["finance"],
  HIST: ["history"],
  HN: ["nutrition"],
  IDS: ["information science"],
  JD: ["law"],
  KN: ["kinesiology"],
  LAW: ["law"],
  MATH: ["mathematics"],
  MGMT: ["management"],
  MKTG: ["marketing"],
  MUS: ["music"],
  PHIL: ["philosophy"],
  PHYS: ["physics"],
  POLS: ["political science"],
  PSCH: ["psychology"],
  SOC: ["sociology"],
  SPAN: ["spanish"],
  UPP: ["urban planning"],
};

const HONORIFICS = new Set([
  "dr",
  "prof",
  "professor",
  "mr",
  "mrs",
  "ms",
  "miss",
]);

const SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
]);

const NICKNAMES: Record<string, string[]> = {
  alex: ["alexander", "alexandra"],
  alexander: ["alex"],
  alexandra: ["alex"],
  andy: ["andrew"],
  andrew: ["andy", "drew", "andruid"],
  andruid: ["andrew"],
  bill: ["william"],
  bob: ["robert"],
  brad: ["bradley"],
  cate: ["catherine", "katherine", "kathryn"],
  cathy: ["catherine", "katherine", "kathryn"],
  chris: ["christopher", "christina", "christine"],
  dan: ["daniel"],
  danny: ["daniel"],
  dave: ["david"],
  drew: ["andrew"],
  ed: ["edward", "edwin"],
  frank: ["francis", "franklin"],
  gabe: ["gabriel"],
  jack: ["john", "jackson"],
  jake: ["jacob"],
  james: ["jim", "jimmy", "jamie"],
  jay: ["jason"],
  jeff: ["jeffrey"],
  jen: ["jennifer"],
  jess: ["jessica"],
  jim: ["james"],
  jimmy: ["james"],
  joe: ["joseph"],
  jon: ["jonathan"],
  josh: ["joshua"],
  kate: ["katherine", "catherine", "kathryn"],
  katie: ["katherine", "catherine", "kathryn"],
  kathy: ["katherine", "catherine", "kathryn"],
  ken: ["kenneth"],
  kim: ["kimberly"],
  larry: ["lawrence"],
  liz: ["elizabeth"],
  maddy: ["madeline", "madison"],
  mandy: ["amanda"],
  marc: ["mark"],
  matt: ["matthew"],
  mike: ["michael"],
  nate: ["nathan"],
  nathan: ["nate"],
  nick: ["nicholas"],
  pat: ["patrick", "patricia"],
  pete: ["peter"],
  phil: ["philip", "phillip"],
  rob: ["robert"],
  ron: ["ronald"],
  sam: ["samuel", "samantha"],
  stephen: ["steve"],
  steve: ["steven", "stephen"],
  steven: ["steve"],
  sue: ["susan"],
  ted: ["theodore"],
  tim: ["timothy"],
  tom: ["thomas", "tomas"],
  tony: ["anthony"],
  will: ["william"],
};

const globalForDirectory = globalThis as unknown as {
  __uicProfessorDirectoryPromise?: Promise<ProfessorDirectoryEntry[]>;
  __uicProfessorDirectoryCache?: ProfessorDirectoryEntry[];
};

if (process.env.NODE_ENV !== "production") {
  globalForDirectory.__uicProfessorDirectoryPromise = undefined;
  globalForDirectory.__uicProfessorDirectoryCache = undefined;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeProfessorName(raw: string) {
  let value = String(raw ?? "").trim();
  if (!value) return "";

  if (value.includes(",")) {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      value = `${parts.slice(1).join(" ")} ${parts[0]}`;
    }
  }

  value = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  value = value
    .toLowerCase()
    .replace(/[’'".]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/-/g, " ");

  const tokens = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !HONORIFICS.has(token))
    .filter((token) => !SUFFIXES.has(token));

  return normalizeWhitespace(tokens.join(" "));
}

function getNameParts(raw: string): NameParts {
  const sourceLastTokens = raw.includes(",")
    ? normalizeProfessorName(raw.split(",")[0] ?? "").split(" ").filter(Boolean)
    : [];
  const normalized = normalizeProfessorName(raw);
  const tokens = normalized.split(" ").filter(Boolean);
  return {
    normalized,
    tokens,
    first: tokens[0] ?? "",
    last: tokens[tokens.length - 1] ?? "",
    middle: tokens.slice(1, -1),
    sourceLastTokens,
  };
}

function middleInsensitiveKey(parts: NameParts) {
  if (!parts.first || !parts.last) return parts.normalized;
  return `${parts.first} ${parts.last}`;
}

function firstInitialLastKey(parts: NameParts) {
  if (!parts.first || !parts.last) return "";
  return `${parts.first[0]} ${parts.last}`;
}

function expandNickname(token: string) {
  return [token, ...(NICKNAMES[token] ?? [])];
}

function firstNameMatches(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a[0] === b[0] && (a.length === 1 || b.length === 1)) return true;
  if (a.length >= 3 && b.startsWith(a)) return true;
  if (b.length >= 3 && a.startsWith(b)) return true;

  const aExpanded = expandNickname(a);
  const bExpanded = expandNickname(b);
  return aExpanded.includes(b) || bExpanded.includes(a);
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function overlapCount(a: string[], b: string[]) {
  const bSet = new Set(b);
  let total = 0;
  for (const token of a) {
    if (bSet.has(token)) total += 1;
  }
  return total;
}

function calculateProfessorScore(quality: number | null | undefined, ratingsCount: number | null | undefined) {
  const q = Number(quality ?? 0);
  const r = Number(ratingsCount ?? 0);
  if (!r) return 0;
  return (r / (r + C)) * q + (C / (r + C)) * M;
}

function courseLabelFromItem(item: string) {
  const value = (item || "").trim().toUpperCase();
  const match = value.match(/^([A-Z&]+)\s*\|?\s*(\d+[A-Z]?)\b/);
  if (match) return `${match[1]} ${match[2]}`;
  const pipeParts = value.split("|").map((part) => part.trim());
  if (pipeParts.length >= 2) {
    const fallback = `${pipeParts[0]} ${pipeParts[1]}`.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/);
    if (fallback) return `${fallback[1]} ${fallback[2]}`;
  }
  return value;
}

function courseTitleFromItem(item: string) {
  const parts = (item || "").trim().split("|").map((part) => part.trim());
  return parts.length >= 2 ? parts.slice(1).join(" | ") : "";
}

function normalizeSalary(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function deriveDepartmentFromCourses(courseItems: string[]) {
  const counts = new Map<string, number>();
  for (const item of courseItems) {
    const label = courseLabelFromItem(item);
    const match = label.match(/^([A-Z&]+)/);
    const subject = match?.[1] ?? "";
    if (!subject) continue;
    counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return "Active UIC Instructor";
  if (ranked.length === 1) return ranked[0][0];
  return `${ranked[0][0]} / ${ranked[1][0]}`;
}

function isCourseDepartmentCompatible(courseItems: string[], department: string) {
  const normalizedDepartment = normalizeProfessorName(department);
  if (!normalizedDepartment) return false;

  for (const item of courseItems) {
    const subject = courseLabelFromItem(item).match(/^([A-Z&]+)/)?.[1] ?? "";
    const aliases = COURSE_DEPARTMENT_ALIASES[subject] ?? [];
    if (aliases.some((alias) => normalizedDepartment.includes(normalizeProfessorName(alias)))) {
      return true;
    }
  }

  return false;
}

function createSyntheticSlug(name: string, used: Set<string>) {
  const base = createSyntheticSlugBase(name);

  let slug = base;
  let counter = 2;
  while (used.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  used.add(slug);
  return slug;
}

function createSyntheticSlugBase(name: string) {
  return `uic-${normalizeProfessorName(name)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "instructor"}`;
}

function displayNameFromCourseMapKey(rawKey: string) {
  return normalizeWhitespace(
    rawKey.includes(",")
      ? rawKey.split(",").map((part) => part.trim()).filter(Boolean).slice(1).join(" ") + ` ${rawKey.split(",")[0].trim()}`
      : rawKey
  );
}

function loadProfCourseMap(): ProfCoursesMap {
  const raw = fs.readFileSync(
    path.join(process.cwd(), PROFESSOR_COURSE_MAP_FILE),
    "utf8"
  );
  return JSON.parse(raw) as ProfCoursesMap;
}

function withGeneratedSummaries(entries: ProfessorDirectoryEntry[]) {
  const overallRanked = entries.filter((entry) => entry.isRated);
  const coursePeers = new Map<string, ProfessorDirectoryEntry[]>();

  for (const entry of entries) {
    for (const label of entry.courseLabels) {
      const peers = coursePeers.get(label) ?? [];
      peers.push(entry);
      coursePeers.set(label, peers);
    }
  }

  for (const peers of coursePeers.values()) {
    peers.sort((a, b) => {
      if (a.isRated !== b.isRated) return a.isRated ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
      return a.name.localeCompare(b.name);
    });
  }

  return entries.map((entry) => {
    if (!entry.isRated || entry.aiSummary.trim()) return entry;

    const departmentRanked = overallRanked.filter((candidate) => candidate.department === entry.department);
    const topCourseRanks: CourseRankSnippet[] = entry.courseItems
      .flatMap((item) => {
        const courseLabel = courseLabelFromItem(item);
        const peers = coursePeers.get(courseLabel) ?? [];
        const rank = peers.findIndex((candidate) => candidate.slug === entry.slug) + 1;
        if (!courseLabel || rank <= 0) return [];

        return [{
          courseLabel,
          courseTitle: courseTitleFromItem(item),
          rank,
          total: peers.length,
        }];
      })
      .sort((a, b) => {
        const aPct = a.total ? a.rank / a.total : 1;
        const bPct = b.total ? b.rank / b.total : 1;
        if (aPct !== bPct) return aPct - bPct;
        return a.courseLabel.localeCompare(b.courseLabel);
      })
      .slice(0, 3);

    return {
      ...entry,
      aiSummary: generateProfessorSummary({
        slug: entry.slug,
        name: entry.name,
        department: entry.department,
        school: entry.school,
        quality: entry.quality,
        ratingsCount: entry.ratingsCount,
        score: entry.score,
        overallRank: overallRanked.findIndex((candidate) => candidate.slug === entry.slug) + 1,
        overallTotal: overallRanked.length,
        deptRank: departmentRanked.findIndex((candidate) => candidate.slug === entry.slug) + 1,
        deptTotal: departmentRanked.length,
        coursesTaughtCount: entry.courseLabels.length,
        topCourseRanks,
      }),
    };
  });
}

function buildDbIndexes(rows: DbProfessorRow[]) {
  const byNormalized = new Map<string, DbProfessorRow[]>();
  const byMiddleInsensitive = new Map<string, DbProfessorRow[]>();
  const byInitialLast = new Map<string, DbProfessorRow[]>();
  const byFirst = new Map<string, DbProfessorRow[]>();
  const byLast = new Map<string, DbProfessorRow[]>();

  for (const row of rows) {
    const parts = getNameParts(row.name);
    if (!parts.normalized) continue;

    const normalizedBucket = byNormalized.get(parts.normalized) ?? [];
    normalizedBucket.push(row);
    byNormalized.set(parts.normalized, normalizedBucket);

    const middleInsensitive = middleInsensitiveKey(parts);
    if (middleInsensitive) {
      const bucket = byMiddleInsensitive.get(middleInsensitive) ?? [];
      bucket.push(row);
      byMiddleInsensitive.set(middleInsensitive, bucket);
    }

    const initialLast = firstInitialLastKey(parts);
    if (initialLast) {
      const bucket = byInitialLast.get(initialLast) ?? [];
      bucket.push(row);
      byInitialLast.set(initialLast, bucket);
    }

    if (parts.first) {
      const bucket = byFirst.get(parts.first) ?? [];
      bucket.push(row);
      byFirst.set(parts.first, bucket);
    }

    if (parts.last) {
      const bucket = byLast.get(parts.last) ?? [];
      bucket.push(row);
      byLast.set(parts.last, bucket);
    }
  }

  return { byNormalized, byMiddleInsensitive, byInitialLast, byFirst, byLast };
}

function chooseBestDbProfessor(
  sourceName: string,
  courseItems: string[],
  indexes: ReturnType<typeof buildDbIndexes>
) {
  const source = getNameParts(sourceName);
  if (!source.first || !source.last) return null;

  const candidateMap = new Map<string, DbProfessorRow>();
  const buckets = [
    indexes.byNormalized.get(source.normalized) ?? [],
    indexes.byMiddleInsensitive.get(middleInsensitiveKey(source)) ?? [],
    indexes.byInitialLast.get(firstInitialLastKey(source)) ?? [],
    source.sourceLastTokens.length > 1 ? indexes.byFirst.get(source.first) ?? [] : [],
    indexes.byLast.get(source.last) ?? [],
  ];

  for (const bucket of buckets) {
    for (const row of bucket) candidateMap.set(row.id, row);
  }

  let best: { row: DbProfessorRow; score: number } | null = null;
  let secondBestScore = -Infinity;

  for (const row of candidateMap.values()) {
    const candidate = getNameParts(row.name);
    if (!candidate.first || !candidate.last) continue;

    let score = -1;

    if (candidate.normalized === source.normalized) {
      score = 1000;
    } else if (middleInsensitiveKey(candidate) === middleInsensitiveKey(source)) {
      score = 900;
    } else if (candidate.last === source.last && firstNameMatches(candidate.first, source.first)) {
      score = 800 + overlapCount(candidate.middle, source.middle) * 5;
    } else if (
      candidate.last === source.last &&
      source.middle.includes(candidate.first) &&
      isCourseDepartmentCompatible(courseItems, row.department)
    ) {
      score = 790 + overlapCount(candidate.middle, source.middle) * 5;
    } else if (
      candidate.last === source.last &&
      source.first.length >= 4 &&
      candidate.first.length >= 4 &&
      editDistance(candidate.first, source.first) <= 2 &&
      isCourseDepartmentCompatible(courseItems, row.department)
    ) {
      score = 780 + overlapCount(candidate.middle, source.middle) * 5;
    } else if (
      candidate.last === source.last &&
      candidate.first[0] === source.first[0] &&
      (candidate.first.length === 1 || source.first.length === 1)
    ) {
      score = 720 + overlapCount(candidate.middle, source.middle) * 5;
    } else if (
      source.sourceLastTokens.length > 1 &&
      firstNameMatches(candidate.first, source.first) &&
      source.sourceLastTokens.includes(candidate.last) &&
      candidate.tokens.every((token) => source.tokens.includes(token))
    ) {
      score = 760 + overlapCount(candidate.middle, source.middle) * 5;
    }

    if (score < 0) continue;
    score += Math.min(50, Number(row.rmpRatingsCount ?? 0));

    if (!best || score > best.score) {
      secondBestScore = best?.score ?? -Infinity;
      best = { row, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!best) return null;

  const sourceFull = source.normalized;
  const candidateFull = getNameParts(best.row.name).normalized;
  if (sourceFull !== candidateFull && best.score - secondBestScore < 5) {
    return null;
  }

  return best.row;
}

export async function getProfessorDirectory() {
  if (process.env.NODE_ENV !== "production") {
    return buildProfessorDirectory();
  }

  if (globalForDirectory.__uicProfessorDirectoryCache) {
    return globalForDirectory.__uicProfessorDirectoryCache;
  }

  if (!globalForDirectory.__uicProfessorDirectoryPromise) {
    globalForDirectory.__uicProfessorDirectoryPromise = buildProfessorDirectory()
      .then((entries) => {
        globalForDirectory.__uicProfessorDirectoryCache = entries;
        return entries;
      })
      .catch((error) => {
        globalForDirectory.__uicProfessorDirectoryPromise = undefined;
        throw error;
      });
  }

  return globalForDirectory.__uicProfessorDirectoryPromise;
}

async function buildProfessorDirectory(): Promise<ProfessorDirectoryEntry[]> {
  const [courseMap, dbRows] = await Promise.all([
    Promise.resolve(loadProfCourseMap()),
    prisma.professor.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        nameNormalized: true,
        department: true,
        school: true,
        rmpQuality: true,
        rmpDifficulty: true,
        rmpWouldTakeAgain: true,
        rmpRatingsCount: true,
        rmpUrl: true,
        aiSummary: true,
        salary: true,
        salaryTitle: true,
      },
    }),
  ]);

  const indexes = buildDbIndexes(dbRows);
  const byStableKey = new Map<string, ProfessorDirectoryEntry>();
  const usedSlugs = new Set<string>(dbRows.map((row) => row.slug));

  for (const [rawKey, rawCourses] of Object.entries(courseMap)) {
    const courses = uniqueSorted((rawCourses || []).map((item) => item.trim()).filter(Boolean));
    const matchedDb = chooseBestDbProfessor(rawKey, courses, indexes);
    const stableKey = matchedDb ? `db:${matchedDb.id}` : `uic:${normalizeProfessorName(rawKey)}`;

    const existing = byStableKey.get(stableKey);
    if (existing) {
      existing.rawCourseMapKeys = uniqueSorted([...existing.rawCourseMapKeys, rawKey]);
      existing.courseItems = uniqueSorted([...existing.courseItems, ...courses]);
      existing.courseLabels = uniqueSorted([...existing.courseLabels, ...courses.map(courseLabelFromItem)]);
      continue;
    }

    if (matchedDb) {
      const normalizedSalary = normalizeSalary(matchedDb.salary);
      byStableKey.set(stableKey, {
        id: matchedDb.id,
        slug: matchedDb.slug,
        name: matchedDb.name,
        department: matchedDb.department || deriveDepartmentFromCourses(courses),
        school: matchedDb.school || SYNTHETIC_SCHOOL,
        quality: Number(matchedDb.rmpQuality ?? 0),
        ratingsCount: Number(matchedDb.rmpRatingsCount ?? 0),
        wouldTakeAgain: matchedDb.rmpWouldTakeAgain ?? null,
        difficulty: matchedDb.rmpDifficulty ?? null,
        url: matchedDb.rmpUrl ?? "",
        aiSummary: matchedDb.aiSummary ?? "",
        salary: normalizedSalary,
        salaryTitle: normalizedSalary ? matchedDb.salaryTitle ?? null : null,
        score: calculateProfessorScore(matchedDb.rmpQuality, matchedDb.rmpRatingsCount),
        isRated: Number(matchedDb.rmpRatingsCount ?? 0) > 0,
        isSynthetic: false,
        rawCourseMapKeys: [rawKey],
        courseItems: courses,
        courseLabels: uniqueSorted(courses.map(courseLabelFromItem)),
        dbProfessorId: matchedDb.id,
        dbName: matchedDb.name,
      });
      continue;
    }

    const displayName = displayNameFromCourseMapKey(rawKey);

    byStableKey.set(stableKey, {
      id: stableKey,
      slug: createSyntheticSlug(displayName, usedSlugs),
      name: displayName,
      department: deriveDepartmentFromCourses(courses),
      school: SYNTHETIC_SCHOOL,
      quality: 0,
      ratingsCount: 0,
      wouldTakeAgain: null,
      difficulty: null,
      url: "",
      aiSummary: "",
      salary: null,
      salaryTitle: null,
      score: 0,
      isRated: false,
      isSynthetic: true,
      rawCourseMapKeys: [rawKey],
      courseItems: courses,
      courseLabels: uniqueSorted(courses.map(courseLabelFromItem)),
      dbProfessorId: null,
      dbName: null,
    });
  }

  const entries = [...byStableKey.values()]
    .filter((entry) => entry.isRated || entry.courseLabels.length > 0)
    .sort((a, b) => {
      if (a.isRated !== b.isRated) return a.isRated ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
      return a.name.localeCompare(b.name);
    });

  return withGeneratedSummaries(entries);
}

export async function getProfessorDirectoryBySlug(slug: string) {
  const directory = await getProfessorDirectory();
  const exact = directory.find((entry) => entry.slug === slug);
  if (exact) return exact;

  return directory.find((entry) =>
    entry.rawCourseMapKeys.some((key) => createSyntheticSlugBase(displayNameFromCourseMapKey(key)) === slug)
  ) ?? null;
}

export async function findProfessorDirectorySlugForUicName(uicName: string) {
  const target = normalizeProfessorName(uicName);
  if (!target) return null;

  const directory = await getProfessorDirectory();
  const exact = directory.find((entry) =>
    entry.rawCourseMapKeys.some((key) => normalizeProfessorName(key) === target) ||
    normalizeProfessorName(entry.name) === target
  );
  if (exact) return exact.slug;

  const targetParts = getNameParts(uicName);
  let best: { slug: string; score: number } | null = null;

  for (const entry of directory) {
    const entryParts = getNameParts(entry.name);
    if (!entryParts.first || !entryParts.last) continue;
    if (entryParts.last !== targetParts.last) continue;
    if (!firstNameMatches(entryParts.first, targetParts.first) && entryParts.first[0] !== targetParts.first[0]) continue;

    const score =
      (firstNameMatches(entryParts.first, targetParts.first) ? 100 : 75) +
      overlapCount(entryParts.middle, targetParts.middle) * 5 +
      (entry.isRated ? 25 : 0);

    if (!best || score > best.score) best = { slug: entry.slug, score };
  }

  return best?.slug ?? null;
}
