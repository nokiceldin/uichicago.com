ALTER TABLE "chat_conversations" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "chat_conversations_userId_clientId_key"
ON "chat_conversations"("userId", "clientId");
