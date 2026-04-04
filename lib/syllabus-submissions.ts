import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

const DEFAULT_ROOT = path.join(process.cwd(), "artifacts", "syllabus-submissions");

export type PendingSyllabusSubmission = {
  id: string;
  submittedAt: string;
  courseCode: string;
  courseTitle: string;
  department: string;
  term: string;
  instructor: string;
  notes: string;
  userAgent: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  sizeBytes: number;
  relativeStoredPath: string;
  relativeExtractedTextPath: string | null;
  extractedTextLength: number;
};

function safeSegment(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "submission";
}

function extensionFromFileName(name: string) {
  const ext = path.extname(name || "").toLowerCase();
  return ext || "";
}

export function getSyllabusSubmissionRoot() {
  return process.env.SYLLABUS_SUBMISSIONS_DIR?.trim() || DEFAULT_ROOT;
}

export function getPendingSyllabusDir() {
  return path.join(getSyllabusSubmissionRoot(), "pending");
}

export function getApprovedSyllabusDir() {
  return path.join(getSyllabusSubmissionRoot(), "approved");
}

export function getRejectedSyllabusDir() {
  return path.join(getSyllabusSubmissionRoot(), "rejected");
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function savePendingSyllabusSubmission(input: {
  courseCode: string;
  courseTitle: string;
  department: string;
  term: string;
  instructor: string;
  notes: string;
  userAgent: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  extractedText?: string;
}) {
  const id = `${safeSegment(input.courseCode)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const pendingRoot = getPendingSyllabusDir();
  const submissionDir = path.join(pendingRoot, id);

  await ensureDir(submissionDir);

  const ext = extensionFromFileName(input.fileName);
  const storedFileName = `source${ext}`;
  const storedFilePath = path.join(submissionDir, storedFileName);
  await fs.writeFile(storedFilePath, input.buffer);

  const extractedText = input.extractedText?.trim() || "";
  let relativeExtractedTextPath: string | null = null;
  if (extractedText) {
    const extractedFileName = "extracted.txt";
    await fs.writeFile(path.join(submissionDir, extractedFileName), extractedText, "utf8");
    relativeExtractedTextPath = path.relative(getSyllabusSubmissionRoot(), path.join(submissionDir, extractedFileName));
  }

  const submission: PendingSyllabusSubmission = {
    id,
    submittedAt: new Date().toISOString(),
    courseCode: input.courseCode,
    courseTitle: input.courseTitle,
    department: input.department,
    term: input.term,
    instructor: input.instructor,
    notes: input.notes,
    userAgent: input.userAgent,
    originalFileName: input.fileName,
    storedFileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    relativeStoredPath: path.relative(getSyllabusSubmissionRoot(), storedFilePath),
    relativeExtractedTextPath,
    extractedTextLength: extractedText.length,
  };

  await fs.writeFile(
    path.join(submissionDir, "submission.json"),
    JSON.stringify(submission, null, 2),
    "utf8"
  );

  return {
    submission,
    submissionDir,
    storedFilePath,
  };
}
