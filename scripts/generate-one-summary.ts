import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import {
  generateProfessorSummary,
  type CourseRankSnippet,
  type ProfessorSummaryInput,
} from "../lib/generateProfessorSummary";

type ProfCoursesMap = Record<string, string[]>;

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const C = 20;
const M = 4.0;

function mapKeyToDbName(key: string) {
  const s = (key || "").trim();
  if (!s) return s;

  if (s.includes(",")) {
    const parts = s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const last = parts[0];
      const first = parts.slice(1).join(" ");
      return `${first} ${last}`.replace(/\s+/g, " ").trim();
    }
  }

  return s;
}

function normName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function courseLabelFromItem(s: string) {
  const t = (s || "").trim().toUpperCase();
  const m = t.match(/^([A-Z&]+)\s*\|?\s*(\d+[A-Z]?)\b/);
  if (m) return `${m[1]} ${m[2]}`;

  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) {
    const mm = `${pipe[0]} ${pipe[1]}`.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/);
    if (mm) return `${mm[1]} ${mm[2]}`;
  }

  return "";
}

function courseTitleFromItem(s: string) {
  const t = (s || "").trim();
  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) return pipe.slice(1).join(" | ");
  return "";
}

function bayesScore(quality: number, ratingsCount: number) {
  const q = Number.isFinite(quality) ? quality : 0;
  const n = Number.isFinite(ratingsCount) ? ratingsCount : 0;
  if (n <= 0) return 0;
  return (n / (n + C)) * q + (C / (n + C)) * M;
}

async function main() {
  const slug = process.argv[2];

  if (!slug) {
    console.error("Please provide a professor slug.");
    console.error("Example: npx tsx scripts/generate-one-summary.ts william-mccarty-criminal-justice");
    process.exit(1);
  }

  const filePath = path.join(process.cwd(), "public", "data", "professor_to_courses.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const courseMap = JSON.parse(raw) as ProfCoursesMap;

  const activeDbNames = Object.keys(courseMap).map(mapKeyToDbName);

  const profRows = await prisma.professor.findMany({
    where: { name: { in: activeDbNames } },
    select: {
      id: true,
      slug: true,
      name: true,
      department: true,
      school: true,
      rmpQuality: true,
      rmpRatingsCount: true,
    },
  });

  const target = profRows.find((p) => p.slug === slug);

  if (!target) {
    console.error(`Professor with slug "${slug}" was not found among active mapped professors.`);
    process.exit(1);
  }

  const profByNorm = new Map<string, (typeof profRows)[number]>();
  for (const p of profRows) profByNorm.set(normName(p.name), p);

  const scored = profRows.map((p) => {
    const quality = Number(p.rmpQuality ?? 0);
    const ratingsCount = Number(p.rmpRatingsCount ?? 0);
    const score = bayesScore(quality, ratingsCount);
    return { ...p, quality, ratingsCount, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
    return a.name.localeCompare(b.name);
  });

  const overallTotal = scored.length;
  const overallRankByNorm = new Map<string, number>();
  for (let i = 0; i < scored.length; i++) {
    overallRankByNorm.set(normName(scored[i].name), i + 1);
  }

  const deptGroups = new Map<string, typeof scored>();
  for (const p of scored) {
    const k = p.department || "Unknown";
    const arr = deptGroups.get(k) || [];
    arr.push(p);
    deptGroups.set(k, arr);
  }

  const deptRankByNorm = new Map<string, { rank: number; total: number }>();
  for (const [, arr] of deptGroups.entries()) {
    arr.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < arr.length; i++) {
      deptRankByNorm.set(normName(arr[i].name), { rank: i + 1, total: arr.length });
    }
  }

  const profCoursesByNorm = new Map<string, { label: string; title: string }[]>();
  const courseToProfNorms = new Map<string, Set<string>>();
  const courseTitleByLabel = new Map<string, string>();

  for (const [key, items] of Object.entries(courseMap)) {
    const dbName = mapKeyToDbName(key);
    const pNorm = normName(dbName);

    const courses = (items || [])
      .map((it) => {
        const label = courseLabelFromItem(it);
        const title = courseTitleFromItem(it);
        return { label, title };
      })
      .filter((x) => x.label);

    profCoursesByNorm.set(pNorm, courses);

    for (const c of courses) {
      if (!courseToProfNorms.has(c.label)) courseToProfNorms.set(c.label, new Set<string>());
      courseToProfNorms.get(c.label)!.add(pNorm);

      if (c.title && !courseTitleByLabel.has(c.label)) courseTitleByLabel.set(c.label, c.title);
    }
  }

  const courseRankListByLabel = new Map<string, string[]>();

  for (const [label, setNorms] of courseToProfNorms.entries()) {
    const arr = Array.from(setNorms)
      .map((n) => {
        const p = profByNorm.get(n);
        if (!p) return null;
        const quality = Number(p.rmpQuality ?? 0);
        const ratingsCount = Number(p.rmpRatingsCount ?? 0);
        const score = bayesScore(quality, ratingsCount);
        return {
          norm: n,
          name: p.name,
          ratingsCount,
          score,
        };
      })
      .filter(Boolean) as { norm: string; name: string; ratingsCount: number; score: number }[];

    arr.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
      return a.name.localeCompare(b.name);
    });

    courseRankListByLabel.set(label, arr.map((x) => x.norm));
  }

  const pNorm = normName(target.name);
  const overallRank = overallRankByNorm.get(pNorm) || 0;
  const deptInfo = deptRankByNorm.get(pNorm) || { rank: 0, total: 0 };

  const courses = profCoursesByNorm.get(pNorm) || [];
  const coursesTaughtCount = courses.length;

  const snippets: CourseRankSnippet[] = [];
  for (const c of courses) {
    const list = courseRankListByLabel.get(c.label);
    if (!list) continue;

    const idx = list.indexOf(pNorm);
    if (idx === -1) continue;

    snippets.push({
      courseLabel: c.label,
      courseTitle: c.title || courseTitleByLabel.get(c.label) || "",
      rank: idx + 1,
      total: list.length,
    });
  }

  snippets.sort((a, b) => {
    const aPct = a.total ? a.rank / a.total : 1;
    const bPct = b.total ? b.rank / b.total : 1;
    if (aPct !== bPct) return aPct - bPct;
    return a.courseLabel.localeCompare(b.courseLabel);
  });

  const topCourseRanks = snippets.slice(0, 3);

  const input: ProfessorSummaryInput = {
    slug: target.slug,
    name: target.name,
    department: target.department,
    school: target.school,
    quality: Number(target.rmpQuality ?? 0),
    ratingsCount: Number(target.rmpRatingsCount ?? 0),
    score: bayesScore(Number(target.rmpQuality ?? 0), Number(target.rmpRatingsCount ?? 0)),
    overallRank,
    overallTotal,
    deptRank: deptInfo.rank,
    deptTotal: deptInfo.total,
    coursesTaughtCount,
    topCourseRanks,
  };

  const aiSummary = generateProfessorSummary(input);

  await prisma.professor.update({
    where: { id: target.id },
    data: { aiSummary },
  });

  console.log(`Updated summary for ${target.name} (${target.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });