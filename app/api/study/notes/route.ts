import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import type { StudyNote } from "@/lib/study/types";
import { moderatePublicStudyNote } from "@/lib/study/public-notes";
import { serializeStudyNote, toDbVisibility } from "@/lib/study/server";

function noteData(note: StudyNote) {
  return {
    title: note.title.trim() || "Untitled note",
    course: note.course.trim() || null,
    noteDate: note.noteDate ? new Date(`${note.noteDate}T12:00:00Z`) : null,
    subject: note.subject.trim() || null,
    tags: note.tags,
    rawContent: note.rawContent || null,
    structuredContent: note.structuredContent ? JSON.stringify(note.structuredContent) : null,
    transcriptContent: note.transcriptContent || null,
    sourceType: note.sourceType.toUpperCase() as "MANUAL" | "AUDIO" | "IMPORTED",
    visibility: toDbVisibility(note.visibility),
    status: note.status.toUpperCase() as "DRAFT" | "PROCESSING" | "READY" | "ERROR",
    pinned: note.pinned,
    favorite: note.favorite,
    lastOpenedAt: new Date(note.lastOpenedAt || Date.now()),
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentStudyUser();
    const { note } = await request.json() as { note?: StudyNote };
    if (!note?.id) return NextResponse.json({ error: "Invalid note." }, { status: 400 });
    if (note.visibility === "public") {
      const moderation = moderatePublicStudyNote(note);
      if (!moderation.allowed) return NextResponse.json({ error: moderation.reason }, { status: 400 });
    }
    const existing = await prisma.studyNote.findUnique({ where: { id: note.id }, select: { ownerId: true } });
    if (existing && existing.ownerId !== user.id) return NextResponse.json({ error: "Only the owner can edit this note." }, { status: 403 });
    const data = noteData(note);
    const saved = await prisma.studyNote.upsert({
      where: { id: note.id },
      create: { id: note.id, ownerId: user.id, ...data },
      update: data,
    });
    return NextResponse.json({ ok: true, note: serializeStudyNote(saved) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Sign in to sync notes." }, { status: 401 });
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentStudyUser();
    const { noteId } = await request.json() as { noteId?: string };
    if (!noteId) return NextResponse.json({ error: "Note id is required." }, { status: 400 });
    const existing = await prisma.studyNote.findUnique({ where: { id: noteId }, select: { ownerId: true } });
    if (!existing || existing.ownerId !== user.id) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    await prisma.studyNote.delete({ where: { id: noteId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Sign in to delete synced notes." }, { status: 401 });
    return NextResponse.json({ error: "Could not delete the note." }, { status: 500 });
  }
}
