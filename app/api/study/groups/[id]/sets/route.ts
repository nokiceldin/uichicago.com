import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { serializeStudyGroup } from "@/lib/study/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const { id } = await params;
    const body = await request.json();
    const setId = String(body.setId || "").trim();

    if (!setId) {
      return NextResponse.json({ error: "Study set id is required." }, { status: 400 });
    }

    const [membership, set] = await Promise.all([
      prisma.studyGroupMembership.findUnique({
        where: {
          groupId_userId: {
            groupId: id,
            userId: studyUser.id,
          },
        },
      }),
      prisma.studySet.findUnique({
        where: { id: setId },
      }),
    ]);

    if (!membership) {
      return NextResponse.json({ error: "You must join this group first." }, { status: 403 });
    }

    if (!set || set.ownerId !== studyUser.id) {
      return NextResponse.json({ error: "Only your signed-in study sets can be linked." }, { status: 403 });
    }

    await prisma.studyGroupSet.upsert({
      where: {
        groupId_setId: {
          groupId: id,
          setId,
        },
      },
      create: {
        groupId: id,
        setId,
        addedById: studyUser.id,
      },
      update: {
        addedById: studyUser.id,
      },
    });

    const updated = await prisma.studyGroup.findUniqueOrThrow({
      where: { id },
      include: {
        memberships: {
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        },
        linkedSets: true,
      },
    });

    return NextResponse.json({ ok: true, group: serializeStudyGroup(updated as never) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to link study set." }, { status: 500 });
  }
}
