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
    const requestedSetIds: string[] = Array.isArray(body.setIds)
      ? [...new Set<string>(body.setIds.map((value: unknown) => String(value).trim()).filter(Boolean))]
      : [];
    const nameValidation = validateStudyGroupName(normalizedName);
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.reason || "Group name is required." }, { status: 400 });
    }

    const ownedSets = requestedSetIds.length
      ? await prisma.studySet.findMany({
          where: {
            id: { in: requestedSetIds },
            ownerId: studyUser.id,
          },
          select: { id: true },
        })
      : [];

    if (ownedSets.length !== requestedSetIds.length) {
      return NextResponse.json(
        { error: "Only your signed-in study sets can be added to a new group." },
        { status: 403 },
      );
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
              linkedSets: ownedSets.length
                ? {
                    create: ownedSets.map((set) => ({
                      setId: set.id,
                      addedById: studyUser.id,
                    })),
                  }
                : undefined,
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
