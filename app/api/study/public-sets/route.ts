import { NextRequest, NextResponse } from "next/server";
import type { StudySet } from "@/lib/study/types";
import {
  moderatePublicStudySet,
  readPublicStudySets,
  removePublicStudySet,
  searchPublicStudySets,
  upsertPublicStudySet,
} from "@/lib/study/public-sets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const course = (searchParams.get("course") || "").trim();

  const sets = await readPublicStudySets();
  const filtered = searchPublicStudySets(
    sets.filter((set) => !course || set.course.toLowerCase() === course.toLowerCase()),
    q,
  );

  return NextResponse.json({
    items: filtered.slice(0, 24),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const set = body?.set as StudySet | undefined;

    if (!set?.id || !set?.title || !Array.isArray(set?.cards)) {
      return NextResponse.json({ error: "Invalid study set payload." }, { status: 400 });
    }

    const moderation = moderatePublicStudySet(set);
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason || "This set could not be published." }, { status: 400 });
    }

    await upsertPublicStudySet(set);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish study set." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const setId = String(body?.setId || "").trim();
    if (!setId) {
      return NextResponse.json({ error: "Missing set id." }, { status: 400 });
    }
    await removePublicStudySet(setId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unpublish study set." },
      { status: 500 },
    );
  }
}

