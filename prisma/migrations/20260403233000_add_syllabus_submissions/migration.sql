CREATE TABLE "SyllabusSubmission" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "department" TEXT,
  "term" TEXT,
  "instructor" TEXT,
  "notes" TEXT,
  "userAgent" TEXT,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "fileData" BYTEA NOT NULL,
  "extractedText" TEXT,
  "knowledgeChunkSourceId" TEXT,

  CONSTRAINT "SyllabusSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusSubmission_knowledgeChunkSourceId_key" ON "SyllabusSubmission"("knowledgeChunkSourceId");
CREATE INDEX "SyllabusSubmission_status_createdAt_idx" ON "SyllabusSubmission"("status", "createdAt" DESC);
