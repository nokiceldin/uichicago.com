-- CreateEnum
CREATE TYPE "StudySetVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "StudyDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "StudyQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_BLANK', 'MATCHING', 'WRITTEN');

-- CreateEnum
CREATE TYPE "StudySessionMode" AS ENUM ('FLASHCARDS', 'LEARN', 'TEST', 'EXAM', 'MATCH');

-- CreateEnum
CREATE TYPE "StudyNoteSourceType" AS ENUM ('MANUAL', 'AUDIO', 'IMPORTED');

-- CreateEnum
CREATE TYPE "StudyNoteStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "StudyTranscriptStatus" AS ENUM ('IDLE', 'PROCESSING', 'READY', 'ERROR');

-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "auth_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "study_users" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT,
    "email" TEXT,
    "sessionKey" TEXT,
    "displayName" TEXT,
    "image" TEXT,
    "school" TEXT DEFAULT 'UIC',
    "major" TEXT,
    "currentCourses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "studyPreferences" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "course" TEXT,
    "subject" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficulty" "StudyDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "visibility" "StudySetVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_groups" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course" TEXT,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_group_memberships" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_group_sets" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_group_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_flashcards" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "hint" TEXT,
    "mnemonic" TEXT,
    "pronunciation" TEXT,
    "formula" TEXT,
    "example" TEXT,
    "imageFrontUrl" TEXT,
    "imageBackUrl" TEXT,
    "difficulty" "StudyDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_flashcards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "setId" TEXT NOT NULL,
    "mode" "StudySessionMode" NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "cardsReviewed" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION DEFAULT 0,
    "score" DOUBLE PRECISION DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_card_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cardId" TEXT NOT NULL,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timesSeen" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "timesWrong" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "markedDifficult" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_card_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_quizzes" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'mixed',
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_quiz_questions" (
    "id" TEXT NOT NULL,
    "quizId" TEXT,
    "cardId" TEXT,
    "type" "StudyQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "difficulty" "StudyDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "topic" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_quiz_attempts" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT,
    "percentCorrect" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_quiz_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_exams" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "topicsCovered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficultyMix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_exam_attempts" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT,
    "percentCorrect" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "resultsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_review_queue" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cardId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'due',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_mistake_deck_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "setId" TEXT NOT NULL,
    "cardId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'quiz',
    "sourceAttempt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_mistake_deck_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_ai_generation_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "setId" TEXT,
    "generationType" TEXT NOT NULL,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_notes" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "course" TEXT,
    "noteDate" TIMESTAMP(3),
    "subject" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawContent" TEXT,
    "structuredContent" TEXT,
    "transcriptContent" TEXT,
    "sourceType" "StudyNoteSourceType" NOT NULL DEFAULT 'MANUAL',
    "visibility" "StudySetVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "StudyNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_note_transcripts" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "StudyTranscriptStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_note_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_note_audio_sessions" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "audioRef" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "transcriptStatus" "StudyTranscriptStatus" NOT NULL DEFAULT 'IDLE',
    "aiStatus" "StudyTranscriptStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_note_audio_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_note_ai_generation_logs" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "detail" TEXT,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_note_ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_sessionToken_key" ON "auth_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_token_key" ON "auth_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "study_users_authUserId_key" ON "study_users"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "study_users_email_key" ON "study_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "study_users_sessionKey_key" ON "study_users"("sessionKey");

-- CreateIndex
CREATE INDEX "study_sets_ownerId_idx" ON "study_sets"("ownerId");

-- CreateIndex
CREATE INDEX "study_sets_course_idx" ON "study_sets"("course");

-- CreateIndex
CREATE INDEX "study_sets_subject_idx" ON "study_sets"("subject");

-- CreateIndex
CREATE INDEX "study_sets_visibility_idx" ON "study_sets"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "study_groups_inviteCode_key" ON "study_groups"("inviteCode");

-- CreateIndex
CREATE INDEX "study_groups_creatorId_idx" ON "study_groups"("creatorId");

-- CreateIndex
CREATE INDEX "study_groups_inviteCode_idx" ON "study_groups"("inviteCode");

-- CreateIndex
CREATE INDEX "study_group_memberships_userId_idx" ON "study_group_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "study_group_memberships_groupId_userId_key" ON "study_group_memberships"("groupId", "userId");

-- CreateIndex
CREATE INDEX "study_group_sets_setId_idx" ON "study_group_sets"("setId");

-- CreateIndex
CREATE INDEX "study_group_sets_addedById_idx" ON "study_group_sets"("addedById");

-- CreateIndex
CREATE UNIQUE INDEX "study_group_sets_groupId_setId_key" ON "study_group_sets"("groupId", "setId");

-- CreateIndex
CREATE INDEX "study_flashcards_setId_idx" ON "study_flashcards"("setId");

-- CreateIndex
CREATE INDEX "study_flashcards_orderIndex_idx" ON "study_flashcards"("orderIndex");

-- CreateIndex
CREATE INDEX "study_sessions_userId_idx" ON "study_sessions"("userId");

-- CreateIndex
CREATE INDEX "study_sessions_setId_idx" ON "study_sessions"("setId");

-- CreateIndex
CREATE INDEX "study_sessions_mode_idx" ON "study_sessions"("mode");

-- CreateIndex
CREATE INDEX "study_card_progress_cardId_idx" ON "study_card_progress"("cardId");

-- CreateIndex
CREATE INDEX "study_card_progress_nextReviewAt_idx" ON "study_card_progress"("nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "study_card_progress_userId_cardId_key" ON "study_card_progress"("userId", "cardId");

-- CreateIndex
CREATE INDEX "study_quizzes_setId_idx" ON "study_quizzes"("setId");

-- CreateIndex
CREATE INDEX "study_quiz_questions_quizId_idx" ON "study_quiz_questions"("quizId");

-- CreateIndex
CREATE INDEX "study_quiz_questions_cardId_idx" ON "study_quiz_questions"("cardId");

-- CreateIndex
CREATE INDEX "study_quiz_attempts_quizId_idx" ON "study_quiz_attempts"("quizId");

-- CreateIndex
CREATE INDEX "study_quiz_attempts_userId_idx" ON "study_quiz_attempts"("userId");

-- CreateIndex
CREATE INDEX "study_quiz_answers_questionId_idx" ON "study_quiz_answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "study_quiz_answers_attemptId_questionId_key" ON "study_quiz_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "study_exams_setId_idx" ON "study_exams"("setId");

-- CreateIndex
CREATE INDEX "study_exam_attempts_examId_idx" ON "study_exam_attempts"("examId");

-- CreateIndex
CREATE INDEX "study_exam_attempts_userId_idx" ON "study_exam_attempts"("userId");

-- CreateIndex
CREATE INDEX "study_review_queue_dueAt_idx" ON "study_review_queue"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "study_review_queue_userId_cardId_key" ON "study_review_queue"("userId", "cardId");

-- CreateIndex
CREATE INDEX "study_mistake_deck_entries_userId_idx" ON "study_mistake_deck_entries"("userId");

-- CreateIndex
CREATE INDEX "study_mistake_deck_entries_setId_idx" ON "study_mistake_deck_entries"("setId");

-- CreateIndex
CREATE INDEX "study_ai_generation_logs_userId_idx" ON "study_ai_generation_logs"("userId");

-- CreateIndex
CREATE INDEX "study_ai_generation_logs_setId_idx" ON "study_ai_generation_logs"("setId");

-- CreateIndex
CREATE INDEX "study_ai_generation_logs_generationType_idx" ON "study_ai_generation_logs"("generationType");

-- CreateIndex
CREATE INDEX "study_notes_ownerId_idx" ON "study_notes"("ownerId");

-- CreateIndex
CREATE INDEX "study_notes_course_idx" ON "study_notes"("course");

-- CreateIndex
CREATE INDEX "study_notes_subject_idx" ON "study_notes"("subject");

-- CreateIndex
CREATE INDEX "study_notes_visibility_idx" ON "study_notes"("visibility");

-- CreateIndex
CREATE INDEX "study_notes_lastOpenedAt_idx" ON "study_notes"("lastOpenedAt");

-- CreateIndex
CREATE INDEX "study_note_transcripts_noteId_idx" ON "study_note_transcripts"("noteId");

-- CreateIndex
CREATE INDEX "study_note_audio_sessions_noteId_idx" ON "study_note_audio_sessions"("noteId");

-- CreateIndex
CREATE INDEX "study_note_ai_generation_logs_noteId_idx" ON "study_note_ai_generation_logs"("noteId");

-- CreateIndex
CREATE INDEX "study_note_ai_generation_logs_userId_idx" ON "study_note_ai_generation_logs"("userId");

-- CreateIndex
CREATE INDEX "study_note_ai_generation_logs_action_idx" ON "study_note_ai_generation_logs"("action");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_users" ADD CONSTRAINT "study_users_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sets" ADD CONSTRAINT "study_sets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "study_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_memberships" ADD CONSTRAINT "study_group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_memberships" ADD CONSTRAINT "study_group_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_sets" ADD CONSTRAINT "study_group_sets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_sets" ADD CONSTRAINT "study_group_sets_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_sets" ADD CONSTRAINT "study_group_sets_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_flashcards" ADD CONSTRAINT "study_flashcards_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_card_progress" ADD CONSTRAINT "study_card_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_card_progress" ADD CONSTRAINT "study_card_progress_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "study_flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quizzes" ADD CONSTRAINT "study_quizzes_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quiz_questions" ADD CONSTRAINT "study_quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "study_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quiz_questions" ADD CONSTRAINT "study_quiz_questions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "study_flashcards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quiz_attempts" ADD CONSTRAINT "study_quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "study_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quiz_attempts" ADD CONSTRAINT "study_quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quiz_answers" ADD CONSTRAINT "study_quiz_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "study_quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_quiz_answers" ADD CONSTRAINT "study_quiz_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "study_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_exams" ADD CONSTRAINT "study_exams_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_exam_attempts" ADD CONSTRAINT "study_exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "study_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_exam_attempts" ADD CONSTRAINT "study_exam_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_review_queue" ADD CONSTRAINT "study_review_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_review_queue" ADD CONSTRAINT "study_review_queue_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "study_flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_mistake_deck_entries" ADD CONSTRAINT "study_mistake_deck_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_mistake_deck_entries" ADD CONSTRAINT "study_mistake_deck_entries_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_mistake_deck_entries" ADD CONSTRAINT "study_mistake_deck_entries_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "study_flashcards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_ai_generation_logs" ADD CONSTRAINT "study_ai_generation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_ai_generation_logs" ADD CONSTRAINT "study_ai_generation_logs_setId_fkey" FOREIGN KEY ("setId") REFERENCES "study_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_notes" ADD CONSTRAINT "study_notes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_note_transcripts" ADD CONSTRAINT "study_note_transcripts_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "study_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_note_audio_sessions" ADD CONSTRAINT "study_note_audio_sessions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "study_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_note_ai_generation_logs" ADD CONSTRAINT "study_note_ai_generation_logs_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "study_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_note_ai_generation_logs" ADD CONSTRAINT "study_note_ai_generation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

