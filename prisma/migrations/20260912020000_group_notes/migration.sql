CREATE TABLE "study_group_notes" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "study_group_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "study_group_notes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "study_group_notes_groupId_noteId_key" ON "study_group_notes"("groupId", "noteId");
