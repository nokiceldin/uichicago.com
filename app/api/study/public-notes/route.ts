import { NextRequest, NextResponse } from "next/server";
import type { StudyNote } from "@/lib/study/types";
import {
  moderatePublicStudyNote,
  readPublicStudyNotes,
  removePublicStudyNote,
  searchPublicStudyNotes,
  upsertPublicStudyNote,
} from "@/lib/study/public-notes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const course = (searchParams.get("course") || "").trim();

  const notes = await readPublicStudyNotes();
  const filtered = searchPublicStudyNotes(
    notes.filter((note) => !course || note.course.toLowerCase() === course.toLowerCase()),
    q,
  );

  return NextResponse.json({
    items: filtered.slice(0, 24),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const note = body?.note as StudyNote | undefined;

    if (!note?.id || !note?.title) {
      return NextResponse.json({ error: "Invalid note payload." }, { status: 400 });
    }

    const moderation = moderatePublicStudyNote(note);
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason || "This note could not be published." }, { status: 400 });
    }

    await upsertPublicStudyNote(note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish note." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const noteId = String(body?.noteId || "").trim();
    if (!noteId) {
      return NextResponse.json({ error: "Missing note id." }, { status: 400 });
    }
    await removePublicStudyNote(noteId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unpublish note." },
      { status: 500 },
    );
  }
}
