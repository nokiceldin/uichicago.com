import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import type { StudyNote } from "@/lib/study/types";

type Context = { params: Promise<{ id: string }> };
async function access(context: Context) {
  const user = await requireCurrentStudyUser();
  const { id } = await context.params;
  const membership = await prisma.studyGroupMembership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
  if (!membership) throw new Error("FORBIDDEN");
  return { user, id, membership };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Sign in to access group materials." : message === "FORBIDDEN" ? "You do not have permission to change or view these materials." : "Could not save or load group materials. Please try again." }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
}
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await access(context);
    const rows = await prisma.studyGroupNote.findMany({ where: { groupId: id }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ notes: rows.map(row => JSON.parse(row.content)) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { user, id } = await access(context);
    const { note } = await request.json() as { note: StudyNote };
    if (!note?.id || !note.title?.trim() || (!note.rawContent?.trim() && !note.transcriptContent?.trim() && !note.structuredContent?.summary?.trim())) {
      return NextResponse.json({ error: "Add a title and some note content before sharing with the group." }, { status: 400 });
    }
    const where = { groupId_noteId: { groupId: id, noteId: note.id } };
    const existing = await prisma.studyGroupNote.findUnique({ where });
    if (existing && existing.authorId !== user.id) throw new Error("FORBIDDEN");
    // Store a group-only copy. Sharing here never publishes the original note.
    const content = JSON.stringify({ ...note, visibility: "private", status: "ready" });
    await prisma.studyGroupNote.upsert({ where, create: { groupId: id, noteId: note.id, authorId: user.id, content }, update: { content } });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { user, id, membership } = await access(context);
    const { noteId } = await request.json();
    if (typeof noteId !== "string") return NextResponse.json({ error: "Note id is required." }, { status: 400 });
    const where = { groupId_noteId: { groupId: id, noteId } };
    const existing = await prisma.studyGroupNote.findUnique({ where });
    if (existing && existing.authorId !== user.id && membership.role !== "owner") throw new Error("FORBIDDEN");
    if (existing) await prisma.studyGroupNote.delete({ where });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
