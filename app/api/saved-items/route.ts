import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import { getSavedItemsForStudyUser } from "@/lib/saved-items";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const studyUser = await requireCurrentStudyUser();
    const saved = await getSavedItemsForStudyUser(studyUser.id);
    return NextResponse.json({ saved });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/saved-items]", error);
    return NextResponse.json({ error: "Failed to load saved items." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json().catch(() => null);
    const type = typeof body?.type === "string" ? body.type.trim() : "";

    if (type === "professor") {
      const professorSlug = typeof body?.professorSlug === "string" ? body.professorSlug.trim() : "";
      const professorName = typeof body?.professorName === "string" ? body.professorName.trim() : "";
      const department = typeof body?.department === "string" ? body.department.trim() : "";
      const school = typeof body?.school === "string" ? body.school.trim() : "";
      const note = typeof body?.note === "string" ? body.note.trim() : "";

      if (!professorSlug || !professorName) {
        return NextResponse.json({ error: "Professor info is required." }, { status: 400 });
      }

      await prisma.savedProfessor.upsert({
        where: {
          userId_professorSlug: {
            userId: studyUser.id,
            professorSlug,
          },
        },
        create: {
          userId: studyUser.id,
          professorSlug,
          professorName,
          department: department || null,
          school: school || null,
          note: note || null,
        },
        update: {
          professorName,
          department: department || null,
          school: school || null,
          note: note || null,
        },
      });
    } else if (type === "course") {
      const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
      if (!courseId) {
        return NextResponse.json({ error: "Course id is required." }, { status: 400 });
      }

      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true },
      });

      if (!existingCourse) {
        return NextResponse.json({ error: "Course not found." }, { status: 404 });
      }

      await prisma.savedCourse.upsert({
        where: {
          userId_courseId: {
            userId: studyUser.id,
            courseId,
          },
        },
        create: {
          userId: studyUser.id,
          courseId,
        },
        update: {},
      });
    } else {
      return NextResponse.json({ error: "Unsupported save type." }, { status: 400 });
    }

    const saved = await getSavedItemsForStudyUser(studyUser.id);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/saved-items]", error);
    return NextResponse.json({ error: "Failed to save item." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json().catch(() => null);
    const type = typeof body?.type === "string" ? body.type.trim() : "";

    if (type === "professor") {
      const professorSlug = typeof body?.professorSlug === "string" ? body.professorSlug.trim() : "";
      if (!professorSlug) {
        return NextResponse.json({ error: "Professor slug is required." }, { status: 400 });
      }

      await prisma.savedProfessor.deleteMany({
        where: {
          userId: studyUser.id,
          professorSlug,
        },
      });
    } else if (type === "course") {
      const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
      if (!courseId) {
        return NextResponse.json({ error: "Course id is required." }, { status: 400 });
      }

      await prisma.savedCourse.deleteMany({
        where: {
          userId: studyUser.id,
          courseId,
        },
      });
    } else {
      return NextResponse.json({ error: "Unsupported save type." }, { status: 400 });
    }

    const saved = await getSavedItemsForStudyUser(studyUser.id);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/saved-items]", error);
    return NextResponse.json({ error: "Failed to remove saved item." }, { status: 500 });
  }
}
