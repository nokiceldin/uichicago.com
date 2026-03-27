import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import type { StudySet } from "./types";

const PUBLIC_SET_DIR = path.join(process.cwd(), "artifacts", "study");
const PUBLIC_SET_PATH = path.join(PUBLIC_SET_DIR, "public-study-sets.json");

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

export async function readPublicStudySets(): Promise<StudySet[]> {
  try {
    const raw = await readFile(PUBLIC_SET_PATH, "utf8");
    const parsed = JSON.parse(raw) as StudySet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writePublicStudySets(sets: StudySet[]) {
  await mkdir(PUBLIC_SET_DIR, { recursive: true });
  await writeFile(PUBLIC_SET_PATH, JSON.stringify(sets, null, 2), "utf8");
}

export function moderatePublicStudySet(set: StudySet): { allowed: boolean; reason?: string } {
  const fullText = [
    set.title,
    set.description,
    set.course,
    set.subject,
    ...set.tags,
    ...set.cards.flatMap((card) => [card.front, card.back, card.hint || "", card.example || "", ...(card.tags || [])]),
  ]
    .join(" ")
    .trim();

  if (!set.course.trim()) {
    return { allowed: false, reason: "Add a real course before publishing publicly." };
  }

  if (set.cards.length < 2) {
    return { allowed: false, reason: "Public sets need at least two real cards." };
  }

  if (set.title.trim().length < 4) {
    return { allowed: false, reason: "Give the set a clearer title before publishing publicly." };
  }

  if (BANNED_PATTERNS.some((pattern) => pattern.test(fullText))) {
    return { allowed: false, reason: "This set could not be published because it contains harmful language." };
  }

  const lowSignalHits = LOW_SIGNAL_PATTERNS.reduce((count, pattern) => count + (pattern.test(fullText) ? 1 : 0), 0);
  const meaningfulCards = set.cards.filter((card) => card.front.trim().length >= 3 && card.back.trim().length >= 3).length;

  if (lowSignalHits >= 2 || meaningfulCards < Math.max(2, Math.ceil(set.cards.length * 0.6))) {
    return { allowed: false, reason: "This set looks incomplete or joke-like, so it was kept private." };
  }

  return { allowed: true };
}

export function searchPublicStudySets(sets: StudySet[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sets;

  return sets.filter((set) =>
    [set.title, set.course, set.subject, set.description, ...set.tags]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export async function upsertPublicStudySet(set: StudySet) {
  const existing = await readPublicStudySets();
  const next = [
    set,
    ...existing.filter((entry) => entry.id !== set.id),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await writePublicStudySets(next);
  return next;
}

export async function removePublicStudySet(setId: string) {
  const existing = await readPublicStudySets();
  const next = existing.filter((entry) => entry.id !== setId);
  await writePublicStudySets(next);
  return next;
}

