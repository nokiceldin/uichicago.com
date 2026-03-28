import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { serializeStudyGroup } from "@/lib/study/server";

export async function POST(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const inviteCode = String(body.inviteCode || Math.random().toString(36).slice(2, 8).toUpperCase()).trim().toUpperCase();

    if (!String(body.name || "").trim()) {
      return NextResponse.json({ error: "Group name is required." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.studyGroup.create({
        data: {
          name: String(body.name).trim(),
          course: String(body.course || "").trim() || null,
          description: String(body.description || "").trim() || null,
          creatorId: studyUser.id,
          inviteCode,
          memberships: {
            create: {
              userId: studyUser.id,
              role: "owner",
            },
          },
        },
        include: {
          memberships: {
            include: { user: true },
          },
          linkedSets: true,
        },
      });

      return tx.studyGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: {
          memberships: {
            include: { user: true },
            orderBy: { joinedAt: "asc" },
          },
          linkedSets: true,
        },
      });
    });

    return NextResponse.json({ ok: true, group: serializeStudyGroup(created as never) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create study group." }, { status: 500 });
  }
}
