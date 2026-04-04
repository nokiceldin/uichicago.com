import prisma from "@/lib/prisma";

export type SavedProfessorSummary = {
  id: string;
  slug: string;
  name: string;
  department: string;
  school: string;
  note: string | null;
  href: string;
  createdAt: string;
};

export type SavedCourseSummary = {
  id: string;
  courseId: string;
  subject: string;
  number: string;
  title: string;
  href: string;
  createdAt: string;
};

export type SavedItemsPayload = {
  professors: SavedProfessorSummary[];
  courses: SavedCourseSummary[];
};

export async function getSavedItemsForStudyUser(studyUserId: string): Promise<SavedItemsPayload> {
  const [savedProfessors, savedCourses] = await Promise.all([
    prisma.savedProfessor.findMany({
      where: { userId: studyUserId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.savedCourse.findMany({
      where: { userId: studyUserId },
      orderBy: { updatedAt: "desc" },
      include: {
        course: {
          select: {
            id: true,
            subject: true,
            number: true,
            title: true,
          },
        },
      },
    }),
  ]);

  return {
    professors: savedProfessors.map((entry) => ({
      id: entry.id,
      slug: entry.professorSlug,
      name: entry.professorName,
      department: entry.department ?? "",
      school: entry.school ?? "",
      note: entry.note?.trim() || null,
      href: `/professors/${encodeURIComponent(entry.professorSlug)}`,
      createdAt: entry.createdAt.toISOString(),
    })),
    courses: savedCourses.map((entry) => ({
      id: entry.id,
      courseId: entry.courseId,
      subject: entry.course.subject,
      number: entry.course.number,
      title: entry.course.title,
      href: `/courses/${encodeURIComponent(entry.course.subject)}/${encodeURIComponent(entry.course.number)}`,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
