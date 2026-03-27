import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import type { StudyNote } from "./types";

const PUBLIC_NOTES_DIR = path.join(process.cwd(), "artifacts", "study");
const PUBLIC_NOTES_PATH = path.join(PUBLIC_NOTES_DIR, "public-study-notes.json");

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
  try {
    const raw = await readFile(PUBLIC_NOTES_PATH, "utf8");
    const parsed = JSON.parse(raw) as StudyNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writePublicStudyNotes(notes: StudyNote[]) {
  await mkdir(PUBLIC_NOTES_DIR, { recursive: true });
  await writeFile(PUBLIC_NOTES_PATH, JSON.stringify(notes, null, 2), "utf8");
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

export async function upsertPublicStudyNote(note: StudyNote) {
  const existing = await readPublicStudyNotes();
  const next = [note, ...existing.filter((entry) => entry.id !== note.id)].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  await writePublicStudyNotes(next);
  return next;
}

export async function removePublicStudyNote(noteId: string) {
  const existing = await readPublicStudyNotes();
  const next = existing.filter((entry) => entry.id !== noteId);
  await writePublicStudyNotes(next);
  return next;
}
