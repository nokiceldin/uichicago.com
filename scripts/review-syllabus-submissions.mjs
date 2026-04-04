#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STORAGE_ROOT = process.env.SYLLABUS_SUBMISSIONS_DIR?.trim() || path.join(ROOT_DIR, "artifacts", "syllabus-submissions");
const REVIEW_DIR = path.join(STORAGE_ROOT, "review-cache");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function readPendingSubmissions() {
  return prisma.syllabusSubmission.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      courseCode: true,
      courseTitle: true,
      term: true,
      instructor: true,
      notes: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
      fileData: true,
      extractedText: true,
    },
  });
}

async function materializeSubmission(submission) {
  const dir = path.join(REVIEW_DIR, submission.id);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, submission.originalFileName);
  await fs.writeFile(filePath, submission.fileData);

  let extractedPath = null;
  if (submission.extractedText?.trim()) {
    extractedPath = path.join(dir, "extracted.txt");
    await fs.writeFile(extractedPath, submission.extractedText, "utf8");
  }

  return { filePath, extractedPath };
}

function printSubmission(submission, materialized) {
  console.log(`\n${submission.id}`);
  console.log(`  Course: ${submission.courseCode} - ${submission.courseTitle}`);
  console.log(`  Term: ${submission.term || "N/A"} | Instructor: ${submission.instructor || "N/A"}`);
  console.log(`  File: ${submission.originalFileName} (${submission.mimeType || "unknown"}, ${Math.round((submission.sizeBytes || 0) / 1024)} KB)`);
  console.log(`  Submitted: ${submission.createdAt.toISOString()}`);
  console.log(`  Review file: ${materialized.filePath}`);
  console.log(`  Extracted text: ${materialized.extractedPath || "none"}`);
  if (submission.notes) console.log(`  Notes: ${submission.notes}`);
}

async function main() {
  const submissions = await readPendingSubmissions();

  if (submissions.length === 0) {
    console.log(`No pending syllabus submissions in the database.`);
    return;
  }

  console.log(`Pending syllabus submissions: ${submissions.length}`);
  for (const submission of submissions) {
    const materialized = await materializeSubmission(submission);
    printSubmission(submission, materialized);
  }

  console.log(`\nApprove everything with: npm run syllabus:upsert -- --all`);
  console.log(`Approve one with:        npm run syllabus:upsert -- --id ${submissions[0].id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
});
