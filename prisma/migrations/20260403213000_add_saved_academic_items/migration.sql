-- CreateTable
CREATE TABLE "saved_professors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professorSlug" TEXT NOT NULL,
    "professorName" TEXT NOT NULL,
    "department" TEXT,
    "school" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_professors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_courses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_professors_userId_idx" ON "saved_professors"("userId");

-- CreateIndex
CREATE INDEX "saved_professors_professorSlug_idx" ON "saved_professors"("professorSlug");

-- CreateIndex
CREATE UNIQUE INDEX "saved_professors_userId_professorSlug_key" ON "saved_professors"("userId", "professorSlug");

-- CreateIndex
CREATE INDEX "saved_courses_userId_idx" ON "saved_courses"("userId");

-- CreateIndex
CREATE INDEX "saved_courses_courseId_idx" ON "saved_courses"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_courses_userId_courseId_key" ON "saved_courses"("userId", "courseId");

-- AddForeignKey
ALTER TABLE "saved_professors" ADD CONSTRAINT "saved_professors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_courses" ADD CONSTRAINT "saved_courses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "study_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_courses" ADD CONSTRAINT "saved_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
