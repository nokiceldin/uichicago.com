-- CreateTable
CREATE TABLE "MissingProfessorReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "searchQuery" TEXT,
    "professorName" TEXT NOT NULL,
    "department" TEXT,
    "classInput" TEXT,
    "notes" TEXT,
    "page" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "MissingProfessorReport_pkey" PRIMARY KEY ("id")
);
