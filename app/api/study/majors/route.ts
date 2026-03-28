import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const indexPath = join(process.cwd(), "public/data/uic-knowledge/majors/_index.json");
    const raw = JSON.parse(readFileSync(indexPath, "utf8"));
    const majors = Array.isArray(raw.majors) ? raw.majors : [];

    return NextResponse.json({
      items: majors
        .filter((major: { hasSchedule?: boolean }) => major.hasSchedule !== false)
        .map((major: { name: string; slug: string; college?: string; hasSchedule?: boolean }) => ({
          name: major.name,
          slug: major.slug,
          college: major.college ?? "",
          hasSchedule: major.hasSchedule !== false,
        })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load major options." }, { status: 500 });
  }
}
