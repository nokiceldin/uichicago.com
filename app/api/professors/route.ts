import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const C = 20;
const M = 4.0;

import fs from "fs";
import path from "path";

function mapKeyToDbName(key: string) {
  const s = (key || "").trim();
  if (!s) return s;

  if (s.includes(",")) {
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
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

type ProfCoursesMap = Record<string, string[]>;

function normalizeCourseInput(s: string) {
  const t = (s || "").trim().toUpperCase();
  const m = t.match(/^([A-Z&]+)\s*[- ]?\s*(\d+[A-Z]?)\b/);
  if (!m) return "";
  return `${m[1]} ${m[2]}`;
}

function courseLabelFromItem(s: string) {
  const t = (s || "").trim().toUpperCase();
  const m = t.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/);
  if (m) return `${m[1]} ${m[2]}`;
  const pipe = t.split("|").map((x) => x.trim());
  if (pipe.length >= 2) return `${pipe[0]} ${pipe[1]}`;
  return t;
}

const globalForCourseMap = globalThis as unknown as { __profCourseMap?: ProfCoursesMap };

function getProfCourseMap(): ProfCoursesMap {
  if (globalForCourseMap.__profCourseMap) return globalForCourseMap.__profCourseMap;

  const filePath = path.join(process.cwd(), "public", "data", "professor_to_courses.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const map = JSON.parse(raw) as ProfCoursesMap;

  globalForCourseMap.__profCourseMap = map;
  return map;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim();
  const dept = (searchParams.get("dept") || "All").trim();
  const minRatings = Number(searchParams.get("minRatings") || "0") || 0;
  const minStars = Number(searchParams.get("minStars") || "0") || 0;
  const sort = (searchParams.get("sort") || "best").toLowerCase();
  const courseRaw = (searchParams.get("course") || "").trim();
  const course = normalizeCourseInput(courseRaw);

  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") || "50") || 50)
  );
  const offset = (page - 1) * pageSize;

  const courseMap = getProfCourseMap();

  const activeDbNames: string[] = [];
  for (const key of Object.keys(courseMap)) {
    const dbStyle = mapKeyToDbName(key);
    activeDbNames.push(dbStyle);
  }

  const whereParts: string[] = [];
  const params: any[] = [];

  if (dept !== "All") {
    params.push(dept);
    whereParts.push(`"department" = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const p1 = params.length;
    params.push(`%${q}%`);
    const p2 = params.length;
    whereParts.push(`("name" ILIKE $${p1} OR "department" ILIKE $${p2})`);
  }

  if (minRatings > 0) {
    params.push(minRatings);
    whereParts.push(`COALESCE("rmpRatingsCount", 0) >= $${params.length}`);
  }

  if (minStars > 0) {
    params.push(minStars);
    whereParts.push(`COALESCE("rmpQuality", 0) >= $${params.length}`);
  }

  if (course) {
    const map = getProfCourseMap();

    const matchedDbStyleNames: string[] = [];

    for (const [key, courses] of Object.entries(map)) {
      const hasIt = (courses || []).some((c) => courseLabelFromItem(c) === course);
      if (hasIt) matchedDbStyleNames.push(mapKeyToDbName(key));
    }

    if (matchedDbStyleNames.length === 0) {
      return NextResponse.json({ total: 0, page, pageSize, items: [] });
    }

    const rows = await prisma.professor.findMany({ select: { name: true } });

    const wanted = new Set(matchedDbStyleNames.map(normName));
    const matchedRealDbNames = rows
      .map((r) => r.name)
      .filter((n) => wanted.has(normName(n)));

    if (matchedRealDbNames.length === 0) {
      return NextResponse.json({ total: 0, page, pageSize, items: [] });
    }

    params.push(matchedRealDbNames);
    whereParts.push(`"name" = ANY($${params.length})`);
  }

  if (activeDbNames.length > 0) {
    params.push(activeDbNames);
    whereParts.push(`"name" = ANY($${params.length})`);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const scoreSql = `
    CASE
      WHEN COALESCE("rmpRatingsCount", 0) = 0 THEN 0
      ELSE
        (COALESCE("rmpRatingsCount", 0)::float / (COALESCE("rmpRatingsCount", 0) + ${C})) * COALESCE("rmpQuality", 0)
        + (${C}::float / (COALESCE("rmpRatingsCount", 0) + ${C})) * ${M}
    END
  `;

  let orderSql = `"score" DESC, "rmpRatingsCount" DESC, "name" ASC`;
  if (sort === "worst") orderSql = `"score" ASC, "rmpRatingsCount" DESC, "name" ASC`;
  if (sort === "most") {
    orderSql = `COALESCE("rmpRatingsCount", 0) DESC, COALESCE("rmpQuality", 0) DESC, "name" ASC`;
  }

  const countRows = await prisma.$queryRawUnsafe<{ total: number }[]>(
    `SELECT COUNT(*)::int as total FROM "Professor" ${whereSql}`,
    ...params
  );
  const total = countRows?.[0]?.total ?? 0;

  const dataParams = [...params, pageSize, offset];
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      "id",
      "slug",
      "name",
      "department",
      "school",
      COALESCE("rmpQuality", 0) as "quality",
      COALESCE("rmpRatingsCount", 0) as "ratingsCount",
      COALESCE("rmpUrl", '') as "url",
      ${scoreSql} as "score"
    FROM "Professor"
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT $${dataParams.length - 1}
    OFFSET $${dataParams.length}
    `,
    ...dataParams
  );

  return NextResponse.json({
    total,
    page,
    pageSize,
    items: rows,
  });
}