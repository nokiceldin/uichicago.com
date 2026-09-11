import prisma from "@/lib/prisma";
import type { StudyNote } from "./types";

const BANNED_PATTERNS = [
  /\bnigg(?:a|er|ers)\b/i,
  /\bfagg?(?:ot|ots)\b/i,
  /\bretard(?:ed)?\b/i,
  /\bkike\b/i,
  /\bspic\b/i,
  /\bchink\b/i,
  /\bslut\b/i,
  /\bwhore\b/i,
];

const LOW_SIGNAL_PATTERNS = [
  /\basdf+\b/i,
  /\bqwerty\b/i,
  /\bskibidi\b/i,
  /\bsigma\b/i,
  /\blol+\b/i,
  /\blmao+\b/i,
  /\btest(?:ing)?\b/i,
  /\bjoke\b/i,
  /\bdeez\b/i,
];

function fullNoteText(note: StudyNote) {
  return [
    note.title,
    note.course,
    note.subject,
    note.noteDate,
    ...note.tags,
    note.rawContent,
    note.transcriptContent,
    note.structuredContent?.summary || "",
    ...(note.structuredContent?.sections.flatMap((section) => [section.heading, ...section.items]) || []),
    ...(note.structuredContent?.keyTerms || []),
    ...(note.structuredContent?.questionsToReview || []),
  ]
    .join(" ")
    .trim();
}

export async function readPublicStudyNotes(): Promise<StudyNote[]> {
  const notes = await prisma.studyNote.findMany({ where: { visibility: "PUBLIC" }, orderBy: { updatedAt: "desc" } });
  return notes.map((note) => ({
    ...note, course: note.course ?? "", subject: note.subject ?? "",
    rawContent: note.rawContent ?? "", transcriptContent: note.transcriptContent ?? "",
    structuredContent: note.structuredContent ? JSON.parse(note.structuredContent) : null,
    noteDate: note.noteDate?.toISOString().slice(0, 10) ?? "",
    sourceType: note.sourceType.toLowerCase() as StudyNote["sourceType"],
    status: note.status.toLowerCase() as StudyNote["status"], visibility: "public",
    createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), lastOpenedAt: note.lastOpenedAt.toISOString(),
  }));
}

export function moderatePublicStudyNote(note: StudyNote): { allowed: boolean; reason?: string } {
  const text = fullNoteText(note);

  if (!note.course.trim()) {
    return { allowed: false, reason: "Choose a real course before publishing notes publicly." };
  }

  if (!note.noteDate.trim()) {
    return { allowed: false, reason: "Add the lecture date before publishing notes publicly." };
  }

  if (note.title.trim().length < 4) {
    return { allowed: false, reason: "Give the note a clearer title before publishing it." };
  }

  const contentLength =
    note.rawContent.trim().length +
    note.transcriptContent.trim().length +
    (note.structuredContent?.summary.trim().length || 0);

  if (contentLength < 40) {
    return { allowed: false, reason: "This note looks too empty to publish publicly." };
  }

  if (BANNED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { allowed: false, reason: "This note could not be published because it contains harmful language." };
  }

  const lowSignalHits = LOW_SIGNAL_PATTERNS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  if (lowSignalHits >= 2) {
    return { allowed: false, reason: "This note looks joke-like or low-signal, so it was kept private." };
  }

  return { allowed: true };
}

export function searchPublicStudyNotes(notes: StudyNote[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return notes;

  return notes.filter((note) =>
    [note.title, note.course, note.subject, note.noteDate, ...note.tags, note.rawContent, note.structuredContent?.summary || ""]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export async function upsertPublicStudyNote(note: StudyNote, ownerId: string) {
  const existing = await prisma.studyNote.findUnique({ where: { id: note.id }, select: { ownerId: true } });
  if (existing && existing.ownerId !== ownerId) throw new Error("FORBIDDEN");
  const data = {
    title: note.title.trim(), course: note.course, subject: note.subject, tags: note.tags,
    noteDate: new Date(`${note.noteDate}T12:00:00Z`), rawContent: note.rawContent,
    transcriptContent: note.transcriptContent, structuredContent: note.structuredContent ? JSON.stringify(note.structuredContent) : null,
    sourceType: note.sourceType.toUpperCase() as "MANUAL" | "AUDIO" | "IMPORTED",
    status: "READY" as const, visibility: "PUBLIC" as const,
  };
  await prisma.studyNote.upsert({ where: { id: note.id }, create: { id: note.id, ownerId, ...data }, update: data });
}

export async function removePublicStudyNote(noteId: string, ownerId: string) {
  const existing = await prisma.studyNote.findUnique({ where: { id: noteId }, select: { ownerId: true } });
  if (!existing) return;
  if (existing.ownerId !== ownerId) throw new Error("FORBIDDEN");
  await prisma.studyNote.update({ where: { id: noteId }, data: { visibility: "PRIVATE" } });
}
