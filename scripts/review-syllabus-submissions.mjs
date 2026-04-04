#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STORAGE_ROOT = process.env.SYLLABUS_SUBMISSIONS_DIR?.trim() || path.join(ROOT_DIR, "artifacts", "syllabus-submissions");
const PENDING_DIR = path.join(STORAGE_ROOT, "pending");

async function readPendingSubmissions() {
  try {
    const entries = await fs.readdir(PENDING_DIR, { withFileTypes: true });
    const submissions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = path.join(PENDING_DIR, entry.name, "submission.json");
      try {
        const raw = await fs.readFile(jsonPath, "utf8");
        submissions.push(JSON.parse(raw));
      } catch (error) {
        console.warn(`Skipping ${entry.name}: ${error.message}`);
      }
    }

    submissions.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    return submissions;
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

function printSubmission(submission) {
  console.log(`\n${submission.id}`);
  console.log(`  Course: ${submission.courseCode} - ${submission.courseTitle}`);
  console.log(`  Term: ${submission.term || "N/A"} | Instructor: ${submission.instructor || "N/A"}`);
  console.log(`  File: ${submission.originalFileName} (${submission.mimeType || "unknown"}, ${Math.round((submission.sizeBytes || 0) / 1024)} KB)`);
  console.log(`  Submitted: ${submission.submittedAt}`);
  console.log(`  Stored file: ${path.join(STORAGE_ROOT, submission.relativeStoredPath)}`);
  if (submission.relativeExtractedTextPath) {
    console.log(`  Extracted text: ${path.join(STORAGE_ROOT, submission.relativeExtractedTextPath)}`);
  } else {
    console.log(`  Extracted text: none`);
  }
  if (submission.notes) {
    console.log(`  Notes: ${submission.notes}`);
  }
}

async function main() {
  const submissions = await readPendingSubmissions();

  if (submissions.length === 0) {
    console.log(`No pending syllabus submissions in ${PENDING_DIR}`);
    return;
  }

  console.log(`Pending syllabus submissions: ${submissions.length}`);
  for (const submission of submissions) {
    printSubmission(submission);
  }

  console.log(`\nApprove everything with: npm run syllabus:upsert -- --all`);
  console.log(`Approve one with:        npm run syllabus:upsert -- --id ${submissions[0].id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
