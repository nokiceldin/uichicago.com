-- Expand Sparky query logs so every chat turn can be analyzed later.
ALTER TABLE "QueryLog"
ADD COLUMN "userId" TEXT,
ADD COLUMN "conversationId" TEXT,
ADD COLUMN "normalizedQuery" TEXT,
ADD COLUMN "requestMessages" TEXT,
ADD COLUMN "responseText" TEXT,
ADD COLUMN "responseKind" TEXT,
ADD COLUMN "responseStatus" TEXT,
ADD COLUMN "attachedFileName" TEXT,
ADD COLUMN "attachedFileType" TEXT,
ADD COLUMN "metadataJson" TEXT;

CREATE INDEX "QueryLog_userId_idx" ON "QueryLog"("userId");
CREATE INDEX "QueryLog_conversationId_idx" ON "QueryLog"("conversationId");
CREATE INDEX "QueryLog_responseKind_idx" ON "QueryLog"("responseKind");
