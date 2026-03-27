import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { serializeStudyGroup } from "@/lib/study/server";

export async function POST(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const inviteCode = String(body.inviteCode || "").trim().toUpperCase();

    if (!inviteCode) {
      return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
    }

    const group = await prisma.studyGroup.findUnique({
      where: { inviteCode },
    });

    if (!group) {
      return NextResponse.json({ error: "No study group found for that code." }, { status: 404 });
    }

    await prisma.studyGroupMembership.upsert({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: studyUser.id,
        },
      },
      create: {
        groupId: group.id,
        userId: studyUser.id,
      },
      update: {},
    });

    const updated = await prisma.studyGroup.findUniqueOrThrow({
      where: { id: group.id },
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
    return NextResponse.json({ error: "Failed to join study group." }, { status: 500 });
  }
}
