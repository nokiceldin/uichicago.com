import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { getProfessorDirectory } from "@/lib/professors/directory";
import { normalizeCourseCode, type SparkyLinkEntityPayload } from "@/lib/chat/entity-linking";

export const runtime = "nodejs";

let cachedPromise: Promise<SparkyLinkEntityPayload> | null = null;

function getFallbackCourseCodes() {
  const filePath = path.join(process.cwd(), "scripts", "catalog-scraped.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<{ subject?: string; number?: string }>;

  return parsed
    .map((course) => normalizeCourseCode(`${String(course.subject ?? "")} ${String(course.number ?? "")}`))
    .filter(Boolean);
}

async function loadLinkEntities(): Promise<SparkyLinkEntityPayload> {
  const [directory, courses] = await Promise.all([
    getProfessorDirectory(),
    prisma.course.findMany({
      select: {
        subject: true,
        number: true,
      },
    }).catch(() => [] as Array<{ subject: string; number: string }>),
  ]);

  const courseCodes = new Set<string>(
    courses.map((course) => normalizeCourseCode(`${course.subject} ${course.number}`)).filter(Boolean)
  );

  if (!courseCodes.size) {
    for (const code of getFallbackCourseCodes()) {
      courseCodes.add(code);
    }
  }

  const professorAliases = new Map<string, { name: string; slug: string }>();

  for (const entry of directory) {
    const aliases = [entry.name, ...entry.rawCourseMapKeys];
    for (const name of aliases) {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) continue;
      const key = `${entry.slug}::${trimmed.toLowerCase()}`;
      if (professorAliases.has(key)) continue;
      professorAliases.set(key, { name: trimmed, slug: entry.slug });
    }
  }

  return {
    courseCodes: [...courseCodes].sort(),
    professorAliases: [...professorAliases.values()],
  };
}

export async function GET() {
  cachedPromise ??= loadLinkEntities();
  const payload = await cachedPromise;
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
