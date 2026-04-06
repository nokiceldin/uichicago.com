import { NextResponse } from "next/server";
import { getProfessorDirectory } from "@/lib/professors/directory";
import prisma from "@/lib/prisma";
import { getCurrentStudyUser } from "@/lib/auth/session";

function normalizeCourseInput(value: string) {
  const text = (value || "").trim().toUpperCase();
  const match = text.match(/^([A-Z&]+)\s*[- ]?\s*(\d+[A-Z]?)\b/);
  if (!match) return "";
  return `${match[1]} ${match[2]}`;
}

function sortDirectory(
  entries: Awaited<ReturnType<typeof getProfessorDirectory>>,
  sort: string
) {
  const items = [...entries];

  if (sort === "most") {
    items.sort((a, b) => {
      if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
      if (a.isRated !== b.isRated) return a.isRated ? -1 : 1;
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.name.localeCompare(b.name);
    });
    return items;
  }

  if (sort === "worst") {
    items.sort((a, b) => {
      if (a.isRated !== b.isRated) return a.isRated ? -1 : 1;
      if (a.score !== b.score) return a.score - b.score;
      if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
      return a.name.localeCompare(b.name);
    });
    return items;
  }

  items.sort((a, b) => {
    if (a.isRated !== b.isRated) return a.isRated ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.ratingsCount !== a.ratingsCount) return b.ratingsCount - a.ratingsCount;
    return a.name.localeCompare(b.name);
  });
  return items;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const dept = (searchParams.get("dept") || "All").trim();
  const minRatings = Math.max(0, Number(searchParams.get("minRatings") || "0") || 0);
  const minStars = Math.max(0, Number(searchParams.get("minStars") || "0") || 0);
  const sort = (searchParams.get("sort") || "best").toLowerCase();
  const course = normalizeCourseInput(searchParams.get("course") || "");
  const savedOnly = searchParams.get("saved") === "1";

  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "50") || 50));

  let items = await getProfessorDirectory();

  if (savedOnly) {
    const studyUser = await getCurrentStudyUser();
    if (!studyUser) {
      return NextResponse.json({
        total: 0,
        page,
        pageSize,
        items: [],
      });
    }

    const savedProfessors = await prisma.savedProfessor.findMany({
      where: { userId: studyUser.id },
      select: { professorSlug: true },
    });
    const savedSlugs = new Set(savedProfessors.map((entry) => entry.professorSlug));
    items = items.filter((entry) => savedSlugs.has(entry.slug));
  }

  if (dept !== "All") {
    items = items.filter((entry) => entry.department === dept);
  }

  if (q) {
    items = items.filter((entry) =>
      entry.name.toLowerCase().includes(q) ||
      entry.department.toLowerCase().includes(q) ||
      entry.courseLabels.some((label) => label.toLowerCase().includes(q))
    );
  }

  if (minRatings > 0) {
    items = items.filter((entry) => entry.ratingsCount >= minRatings);
  }

  if (minStars > 0) {
    items = items.filter((entry) => entry.quality >= minStars);
  }

  if (course) {
    items = items.filter((entry) => entry.courseLabels.includes(course));
  }

  items = sortDirectory(items, sort);

  const total = items.length;
  const offset = (page - 1) * pageSize;
  const pagedItems = items.slice(offset, offset + pageSize).map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    department: entry.department,
    school: entry.school,
    quality: entry.quality,
    ratingsCount: entry.ratingsCount,
    wouldTakeAgain: entry.wouldTakeAgain,
    difficulty: entry.difficulty,
    url: entry.url,
    isRated: entry.isRated,
    isSynthetic: entry.isSynthetic,
    courseItems: entry.courseItems,
    courseLabels: entry.courseLabels,
  }));

  return NextResponse.json({
    total,
    page,
    pageSize,
    items: pagedItems,
  });
}
