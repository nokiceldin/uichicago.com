-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "rawContent" TEXT NOT NULL,
    "aiSummary" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_guid_key" ON "NewsItem"("guid");

-- CreateIndex
CREATE INDEX "NewsItem_source_idx" ON "NewsItem"("source");

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");
