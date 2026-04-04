import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { validateStudyGroupName } from "@/lib/study/group-moderation";
import { serializeStudyGroup } from "@/lib/study/server";

function generateInviteCode(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function POST(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();

    const normalizedName = String(body.name || "").trim();
    const nameValidation = validateStudyGroupName(normalizedName);
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.reason || "Group name is required." }, { status: 400 });
    }

    let createdGroupId = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const inviteCode = generateInviteCode();

      try {
        const created = await prisma.$transaction(async (tx) => {
          const group = await tx.studyGroup.create({
            data: {
              name: normalizedName,
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

        createdGroupId = created.id;
        return NextResponse.json({ ok: true, group: serializeStudyGroup(created as never) });
      } catch (error) {
        const isInviteCollision =
          error instanceof Error &&
          "code" in error &&
          String((error as { code?: unknown }).code) === "P2002";

        if (!isInviteCollision) {
          throw error;
        }
      }
    }

    return NextResponse.json(
      {
        error: createdGroupId
          ? "Failed to finish creating study group."
          : "Could not generate a unique invite code. Please try again.",
      },
      { status: 500 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create study group." }, { status: 500 });
  }
}
