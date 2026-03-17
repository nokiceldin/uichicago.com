-- ============================================================
-- Sparky Schema Migration
-- Run via: npx prisma migrate dev --name sparky_phase1
-- Or apply manually against your Postgres DB
-- ============================================================

-- 1. Add nameNormalized to Professor
ALTER TABLE "Professor"
  ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT;

CREATE INDEX IF NOT EXISTS "Professor_nameNormalized_idx"
  ON "Professor"("nameNormalized");

-- 2. Add professorId FK to CourseInstructorTermStats
ALTER TABLE "CourseInstructorTermStats"
  ADD COLUMN IF NOT EXISTS "professorId" TEXT;

ALTER TABLE "CourseInstructorTermStats"
  ADD CONSTRAINT "CourseInstructorTermStats_professorId_fkey"
  FOREIGN KEY ("professorId")
  REFERENCES "Professor"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE
  NOT VALID;

CREATE INDEX IF NOT EXISTS "CourseInstructorTermStats_professorId_idx"
  ON "CourseInstructorTermStats"("professorId");

-- 3. Add sessionState column to ConversationSession
ALTER TABLE "ConversationSession"
  ADD COLUMN IF NOT EXISTS "sessionState" TEXT NOT NULL DEFAULT '{}';

-- 4. Add new columns to KnowledgeChunk
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "chunkType"  TEXT,
  ADD COLUMN IF NOT EXISTS "entityId"   TEXT,
  ADD COLUMN IF NOT EXISTS "entityType" TEXT,
  ADD COLUMN IF NOT EXISTS "trustLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_chunkType_idx"
  ON "KnowledgeChunk"("chunkType");

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_entityId_idx"
  ON "KnowledgeChunk"("entityId");

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_trustLevel_idx"
  ON "KnowledgeChunk"("trustLevel");

-- 5. Create ProfessorReview table
CREATE TABLE IF NOT EXISTS "ProfessorReview" (
  "id"             TEXT        NOT NULL,
  "professorId"    TEXT        NOT NULL,
  "reviewText"     TEXT        NOT NULL,
  "quality"        INTEGER,
  "difficulty"     INTEGER,
  "wouldTakeAgain" BOOLEAN,
  "thumbsUp"       INTEGER,
  "thumbsDown"     INTEGER,
  "grade"          TEXT,
  "courseCode"     TEXT,
  "forCredit"      BOOLEAN,
  "useTextbook"    BOOLEAN,
  "attendanceReq"  BOOLEAN,
  "rmpReviewId"    TEXT,
  "scrapedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProfessorReview_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProfessorReview"
  ADD CONSTRAINT "ProfessorReview_professorId_fkey"
  FOREIGN KEY ("professorId")
  REFERENCES "Professor"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "ProfessorReview_rmpReviewId_key"
  ON "ProfessorReview"("rmpReviewId");

CREATE INDEX IF NOT EXISTS "ProfessorReview_professorId_idx"
  ON "ProfessorReview"("professorId");

CREATE INDEX IF NOT EXISTS "ProfessorReview_courseCode_idx"
  ON "ProfessorReview"("courseCode");

-- 6. Create QueryLog table
CREATE TABLE IF NOT EXISTS "QueryLog" (
  "id"               TEXT         NOT NULL,
  "sessionId"        TEXT         NOT NULL,
  "query"            TEXT         NOT NULL,
  "answerMode"       TEXT,
  "domainsTriggered" TEXT,
  "retrievalSources" TEXT,
  "topChunkScore"    DOUBLE PRECISION,
  "chunkCount"       INTEGER,
  "abstained"        BOOLEAN      NOT NULL DEFAULT false,
  "abstainReason"    TEXT,
  "responseMs"       INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QueryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QueryLog_sessionId_idx"
  ON "QueryLog"("sessionId");

CREATE INDEX IF NOT EXISTS "QueryLog_createdAt_idx"
  ON "QueryLog"("createdAt");

CREATE INDEX IF NOT EXISTS "QueryLog_abstained_idx"
  ON "QueryLog"("abstained");

CREATE INDEX IF NOT EXISTS "QueryLog_answerMode_idx"
  ON "QueryLog"("answerMode");

-- ============================================================
-- Backfill: populate nameNormalized for all existing Professor rows
-- Run immediately after the migration, before the grade import
-- resolution pass.
--
-- Logic:
--   "Last, First Middle" → "first middle last" → lowercase stripped
--   "First Last"         → "first last"         → lowercase stripped
-- ============================================================
UPDATE "Professor"
SET "nameNormalized" = lower(
  regexp_replace(
    trim(
      CASE
        WHEN name LIKE '%,%' THEN
          trim(split_part(name, ',', 2))
            || ' '
            || trim(split_part(name, ',', 1))
        ELSE
          name
      END
    ),
    '[^a-z0-9 ]',
    '',
    'g'
  )
)
WHERE "nameNormalized" IS NULL;