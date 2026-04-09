import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "node:fs";
import path from "node:path";

type FallbackCourse = {
  id: string;
  subject: string;
  number: string;
  title: string;
  description: string;
  avgGpa: number | null;
  difficultyScore: number | null;
  totalRegsAllTime: number;
};

let fallbackCatalogCache: FallbackCourse[] | null = null;

function getFallbackCatalog() {
  if (fallbackCatalogCache) return fallbackCatalogCache;

  const filePath = path.join(process.cwd(), "scripts", "catalog-scraped.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<{ subject?: string; number?: string; title?: string; description?: string }>;

  fallbackCatalogCache = parsed
    .map((course) => ({
      id: `catalog-${String(course.subject || "").trim()}-${String(course.number || "").trim()}`,
      subject: String(course.subject || "").trim(),
      number: String(course.number || "").trim(),
      title: String(course.title || "").trim(),
      description: String(course.description || "").trim(),
      avgGpa: null,
      difficultyScore: null,
      totalRegsAllTime: 0,
    }))
    .filter((course) => course.subject && course.number && course.title);

  return fallbackCatalogCache;
}

function buildCourseHref(subject: string, number: string) {
  return `/courses/${encodeURIComponent(subject)}/${encodeURIComponent(number)}`;
}

function isCodeLikeQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  if (/[a-z&]+\s*\d/.test(normalized)) return true;
  return /\d/.test(normalized);
}

function getSearchableDescription(description: string) {
  const trimmed = description.trim();
  if (!trimmed) return "";

  const cutMarkers = [
    "course information:",
    "class schedule information:",
    "prerequisite",
    "recommended background:",
  ];

  const lower = trimmed.toLowerCase();
  const cutIndex = cutMarkers
    .map((marker) => lower.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return cutIndex == null ? trimmed : trimmed.slice(0, cutIndex).trim();
}

function searchFallbackCatalog(query: string, page: number, pageSize: number) {
  const q = query.trim().toLowerCase();
  const allowDescriptionMatch = !isCodeLikeQuery(query);
  const compact = q.replace(/\s+/g, "");
  const compactLetters = compact.replace(/[^a-z&]/g, "");
  const compactNumbers = compact.replace(/[^0-9a-z]/g, "").replace(/^[a-z&]+/, "");

  const ranked = getFallbackCatalog()
    .map((course) => {
      const title = course.title.toLowerCase();
      const description = getSearchableDescription(course.description).toLowerCase();
      const subject = course.subject.toLowerCase();
      const number = course.number.toLowerCase();
      const code = `${subject} ${number}`;
      const codeCompact = `${subject}${number}`.replace(/\s+/g, "");
      const titleCompact = title.replace(/\s+/g, "");
      const descriptionCompact = description.replace(/\s+/g, "");

      let score = 0;
      if (!q) score = 1;
      else if (code === q || codeCompact === compact) score = 1000;
      else if (subject === compactLetters && compactNumbers && number.startsWith(compactNumbers)) score = 950;
      else if (title === q || titleCompact === compact) score = 925;
      else if (title.startsWith(q) || titleCompact.startsWith(compact)) score = 875;
      else if (code.startsWith(q) || codeCompact.startsWith(compact)) score = 900;
      else if (subject.startsWith(q) || number.startsWith(q)) score = 700;
      else if (compactLetters && subject.includes(compactLetters) && compactNumbers && number.includes(compactNumbers)) score = 650;
      else if (title.includes(q)) score = 500;
      else if (allowDescriptionMatch && (description.includes(q) || descriptionCompact.includes(compact))) score = 425;
      else if (subject.includes(q) || number.includes(q)) score = 350;

      return { course, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.course.subject.localeCompare(b.course.subject) ||
      a.course.number.localeCompare(b.course.number) ||
      a.course.title.localeCompare(b.course.title)
    );

  const total = ranked.length;
  const start = (page - 1) * pageSize;
  const items = ranked.slice(start, start + pageSize).map(({ course }) => ({
    ...course,
    href: buildCourseHref(course.subject, course.number),
  }));

  return { total, items };
}

type RankedCourse = {
  id: string;
  subject: string;
  number: string;
  title: string;
  avgGpa: number | null;
  difficultyScore: number | null;
  totalRegsAllTime: number;
  metaV2: { description: string | null } | null;
};

function scoreCourseMatch(course: RankedCourse, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const allowDescriptionMatch = !isCodeLikeQuery(query);
  const compact = q.replace(/\s+/g, "");
  const compactLetters = compact.replace(/[^a-z&]/g, "");
  const compactNumbers = compact.replace(/[^0-9a-z]/g, "").replace(/^[a-z&]+/, "");
  const title = course.title.toLowerCase();
  const description = getSearchableDescription(course.metaV2?.description || "").toLowerCase();
  const subject = course.subject.toLowerCase();
  const number = course.number.toLowerCase();
  const code = `${subject} ${number}`;
  const codeCompact = `${subject}${number}`.replace(/\s+/g, "");
  const titleCompact = title.replace(/\s+/g, "");
  const descriptionCompact = description.replace(/\s+/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  const titleHasAllWords = words.length > 0 && words.every((word) => title.includes(word));
  const descriptionHasAllWords = words.length > 0 && words.every((word) => description.includes(word));

  if (code === q || codeCompact === compact) return 1000;
  if (subject === compactLetters && compactNumbers && number.startsWith(compactNumbers)) return 950;
  if (code.startsWith(q) || codeCompact.startsWith(compact)) return 900;
  if (title === q || titleCompact === compact) return 890;
  if (title.startsWith(q) || titleCompact.startsWith(compact)) return 860;
  if (titleHasAllWords) return 820;
  if (subject.startsWith(q) || number.startsWith(q)) return 700;
  if (compactLetters && subject.includes(compactLetters) && compactNumbers && number.includes(compactNumbers)) return 650;
  if (title.includes(q) || titleCompact.includes(compact)) return 600;
  if (allowDescriptionMatch && descriptionHasAllWords) return 520;
  if (allowDescriptionMatch && (description.includes(q) || descriptionCompact.includes(compact))) return 460;
  if (subject.includes(q) || number.includes(q)) return 350;
  return 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(
    20,
    Math.max(1, Number(searchParams.get("pageSize") || "10") || 10)
  );
  const skip = (page - 1) * pageSize;
  const allowDescriptionMatch = !isCodeLikeQuery(q);

  const qCompact = q.toLowerCase().replace(/\s+/g, "");
  const qParts = q.trim().split(/\s+/);

  const subjectPart = qParts[0]?.match(/^[a-zA-Z&]+$/) ? qParts[0] : "";
  const numberPart = qParts[1]?.match(/^\d+[a-zA-Z]*$/) ? qParts[1] : "";

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          ...(allowDescriptionMatch
            ? [{ metaV2: { description: { contains: q, mode: "insensitive" as const } } }]
            : []),
          { subject: { contains: q, mode: "insensitive" as const } },
          { number: { contains: q, mode: "insensitive" as const } },

          ...(subjectPart && numberPart
            ? [
                {
                  AND: [
                    { subject: { equals: subjectPart, mode: "insensitive" as const } },
                    { number: { startsWith: numberPart, mode: "insensitive" as const } },
                  ],
                },
              ]
            : []),

          ...(qCompact
            ? [
                {
                  AND: [
                    {
                      subject: {
                        contains: qCompact.replace(/\d.*$/, ""),
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      number: {
                        contains: qCompact.replace(/^[a-zA-Z&]+/, ""),
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      }
    : {};

  try {
    if (q) {
      const candidateTake = Math.max(pageSize * 12, 60);
      const rawItems = await prisma.course.findMany({
        where,
        take: candidateTake,
        select: {
          id: true,
          subject: true,
          number: true,
          title: true,
          avgGpa: true,
          difficultyScore: true,
          totalRegsAllTime: true,
          metaV2: {
            select: {
              description: true,
            },
          },
        },
      });

      const ranked = rawItems
        .map((course) => ({
          course,
          score: scoreCourseMatch(course, q),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) =>
          b.score - a.score ||
          b.course.totalRegsAllTime - a.course.totalRegsAllTime ||
          (b.course.avgGpa ?? -1) - (a.course.avgGpa ?? -1) ||
          a.course.subject.localeCompare(b.course.subject) ||
          a.course.number.localeCompare(b.course.number) ||
          a.course.title.localeCompare(b.course.title)
        );

      const total = ranked.length;
      const items = ranked
        .slice(skip, skip + pageSize)
        .map(({ course }) => ({
          id: course.id,
          subject: course.subject,
          number: course.number,
          title: course.title,
          avgGpa: course.avgGpa,
          difficultyScore: course.difficultyScore,
          totalRegsAllTime: course.totalRegsAllTime,
          href: buildCourseHref(course.subject, course.number),
        }));

      return NextResponse.json({
        total,
        page,
        pageSize,
        items,
      });
    }

    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        take: pageSize,
        skip,
        orderBy: [
          { totalRegsAllTime: "desc" },
          { avgGpa: "desc" },
          { subject: "asc" },
          { number: "asc" },
        ],
        select: {
          id: true,
          subject: true,
          number: true,
          title: true,
          avgGpa: true,
          difficultyScore: true,
          totalRegsAllTime: true,
        },
      }),
      prisma.course.count({ where }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      items: items.map((c) => ({
        ...c,
        href: buildCourseHref(c.subject, c.number),
      })),
    });
  } catch (error) {
    console.error("[GET /api/courses] Falling back to local catalog search", error);
    const fallback = searchFallbackCatalog(q, page, pageSize);
    return NextResponse.json({
      total: fallback.total,
      page,
      pageSize,
      items: fallback.items,
      source: "fallback_catalog",
    });
  }
}
