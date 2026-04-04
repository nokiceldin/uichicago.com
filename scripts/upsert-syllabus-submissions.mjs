#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STORAGE_ROOT = process.env.SYLLABUS_SUBMISSIONS_DIR?.trim() || path.join(ROOT_DIR, "artifacts", "syllabus-submissions");
const PENDING_DIR = path.join(STORAGE_ROOT, "pending");
const APPROVED_DIR = path.join(STORAGE_ROOT, "approved");
const EMBEDDING_MODEL = "voyage-3-large";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function parseArgs(argv) {
  const selectedIds = [];
  let approveAll = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") {
      approveAll = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--id") {
      const value = argv[i + 1];
      if (!value) throw new Error("--id requires a submission id");
      selectedIds.push(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!approveAll && selectedIds.length === 0) {
    throw new Error('Choose at least one submission with "--id <id>" or use "--all"');
  }

  return { approveAll, selectedIds, dryRun };
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{3,}/g, "  ")
    .trim();
}

function buildChunkContent(submission, extractedText) {
  const header = [
    `Course: ${submission.courseCode} - ${submission.courseTitle}`,
    `Department: ${submission.department || "N/A"}`,
    `Term: ${submission.term || "N/A"}`,
    `Instructor: ${submission.instructor || "N/A"}`,
    `Notes: ${submission.notes || "N/A"}`,
    `Original file: ${submission.originalFileName}`,
    `Submission id: ${submission.id}`,
  ].join("\n");

  return `${header}\n\n=== SYLLABUS TEXT ===\n${extractedText}\n=== END SYLLABUS TEXT ===`;
}

async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      input_type: "document",
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage API error: ${await res.text()}`);
  }

  const json = await res.json();
  return json.data.map((item) => item.embedding);
}

async function upsertChunk(content, sourceId, metadata, embedding) {
  const embeddingStr = `[${embedding.join(",")}]`;

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "KnowledgeChunk" (
      id,
      content,
      "sourceType",
      "sourceId",
      metadata,
      embedding,
      "chunkType",
      "entityId",
      "entityType",
      "trustLevel",
      "embeddingUpdatedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1, 'course', $2, $3, $4::vector, $5, $6, $7, $8, NOW(), NOW(), NOW()
    )
    ON CONFLICT ("sourceId", "sourceType") DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "chunkType" = EXCLUDED."chunkType",
      "entityId" = EXCLUDED."entityId",
      "entityType" = EXCLUDED."entityType",
      "trustLevel" = EXCLUDED."trustLevel",
      "embeddingUpdatedAt" = NOW(),
      "updatedAt" = NOW()
    `,
    content,
    sourceId,
    JSON.stringify(metadata),
    embeddingStr,
    "syllabus",
    null,
    "course_syllabus",
    "reviewed_user_submission"
  );
}

async function readSubmissionDir(dirName) {
  const jsonPath = path.join(PENDING_DIR, dirName, "submission.json");
  const raw = await fs.readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

async function readPendingSubmissions() {
  try {
    const entries = await fs.readdir(PENDING_DIR, { withFileTypes: true });
    const submissions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      submissions.push(await readSubmissionDir(entry.name));
    }

    submissions.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    return submissions;
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function extractText(submission) {
  if (submission.relativeExtractedTextPath) {
    const extractedPath = path.join(STORAGE_ROOT, submission.relativeExtractedTextPath);
    return cleanText(await fs.readFile(extractedPath, "utf8"));
  }

  const filePath = path.join(STORAGE_ROOT, submission.relativeStoredPath);

  if (submission.mimeType === "application/pdf" || filePath.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdf(await fs.readFile(filePath));
    return cleanText(parsed.text || "");
  }

  if (submission.mimeType === "text/plain" || filePath.toLowerCase().endsWith(".txt")) {
    return cleanText(await fs.readFile(filePath, "utf8"));
  }

  return "";
}

async function moveToApproved(submission) {
  const fromDir = path.join(PENDING_DIR, submission.id);
  const toDir = path.join(APPROVED_DIR, submission.id);
  await fs.mkdir(APPROVED_DIR, { recursive: true });
  await fs.rename(fromDir, toDir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pending = await readPendingSubmissions();

  if (pending.length === 0) {
    console.log(`No pending syllabus submissions in ${PENDING_DIR}`);
    return;
  }

  const selected = args.approveAll
    ? pending
    : pending.filter((submission) => args.selectedIds.includes(submission.id));

  if (selected.length === 0) {
    throw new Error("No matching pending submissions found for the ids you passed.");
  }

  console.log(`Selected ${selected.length} submission(s).`);

  for (const submission of selected) {
    const extractedText = await extractText(submission);
    if (extractedText.length < 120) {
      throw new Error(
        `Submission ${submission.id} does not have enough extracted text to index safely. ` +
        `Use a text-friendly PDF or add OCR before approving it.`
      );
    }

    const content = buildChunkContent(submission, extractedText);
    const metadata = {
      submissionId: submission.id,
      subject: submission.courseCode.split(/\s+/)[0] || submission.courseCode,
      courseCode: submission.courseCode,
      courseTitle: submission.courseTitle,
      department: submission.department || null,
      term: submission.term || null,
      instructor: submission.instructor || null,
      originalFileName: submission.originalFileName,
      reviewedAt: new Date().toISOString(),
      storagePath: submission.relativeStoredPath,
      chunkType: "syllabus",
      entityType: "course_syllabus",
      trustLevel: "reviewed_user_submission",
    };

    console.log(`\n${submission.id}`);
    console.log(`  ${submission.courseCode} - ${submission.courseTitle}`);
    console.log(`  Extracted text length: ${extractedText.length}`);

    if (args.dryRun) {
      console.log("  Dry run: skipping embedding/upsert");
      continue;
    }

    const [embedding] = await embedBatch([content]);
    await upsertChunk(content, `syllabus:${submission.id}`, metadata, embedding);
    await moveToApproved(submission);
    console.log("  Approved and upserted");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  });
