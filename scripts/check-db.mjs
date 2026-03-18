import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const terms = await prisma.term.findMany();
  console.log("TERMS:");
  console.log(terms);

  for (const t of terms) {
    const courseStats = await prisma.courseTermStats.count({
      where: { termId: t.id },
    });

    const instructorStats = await prisma.courseInstructorTermStats.count({
      where: { termId: t.id },
    });

    console.log(
      `${t.code} -> courseStats: ${courseStats}, instructorStats: ${instructorStats}`
    );
  }

  const sample = await prisma.course.findMany({
  take: 5,
  select: {
    subject: true,
    number: true,
    difficultyScore: true,
    avgGpa: true,
    totalRegsAllTime: true,
  },
});
console.log(sample);

  const totalCourses = await prisma.course.count();
  const totalCourseStats = await prisma.courseTermStats.count();
  const totalInstructorStats = await prisma.courseInstructorTermStats.count();

  console.log("\nTOTALS:");
  console.log("Courses:", totalCourses);
  console.log("CourseTermStats:", totalCourseStats);
  console.log("InstructorTermStats:", totalInstructorStats);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());