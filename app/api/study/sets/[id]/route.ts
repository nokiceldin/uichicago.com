import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const { id } = await params;

    const set = await prisma.studySet.findUnique({
      where: { id },
    });

    if (!set || set.ownerId !== studyUser.id) {
      return NextResponse.json({ error: "Study set not found." }, { status: 404 });
    }

    await prisma.studySet.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete study set." }, { status: 500 });
  }
}
