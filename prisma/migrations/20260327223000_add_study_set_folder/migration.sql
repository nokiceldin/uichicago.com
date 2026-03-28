ALTER TABLE "study_sets"
ADD COLUMN "folder" TEXT;

CREATE INDEX "study_sets_folder_idx" ON "study_sets"("folder");
