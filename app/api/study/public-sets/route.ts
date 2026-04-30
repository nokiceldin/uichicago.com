import { NextRequest, NextResponse } from "next/server";
import { getCurrentStudyUser, requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
  moderatePublicStudySet,
  readPublicStudySets,
  removePublicStudySet,
  searchPublicStudySets,
  upsertPublicStudySet,
} from "@/lib/study/public-sets";
import { serializeStudySet, toDbDifficulty } from "@/lib/study/server";
import type { StudySet } from "@/lib/study/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const course = (searchParams.get("course") || "").trim();
  const studyUser = await getCurrentStudyUser().catch(() => null);

  const dbSets = await prisma.studySet.findMany({
    where: {
      visibility: "PUBLIC",
      ...(course
        ? {
            course: {
              equals: course,
              mode: "insensitive",
            },
          }
        : {}),
    },
    include: { flashcards: true },
    orderBy: { updatedAt: "desc" },
    take: q ? 80 : 24,
  });

  const liveItems = dbSets.map((set) => serializeStudySet(set, studyUser?.id));
  const legacyItems = (await readPublicStudySets()).filter(
    (set) =>
      set.visibility === "public" &&
      !liveItems.some((item) => item.id === set.id) &&
      (!course || set.course.toLowerCase() === course.toLowerCase()),
  );

  const merged = [...liveItems, ...legacyItems].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const filtered = searchPublicStudySets(merged, q);

  return NextResponse.json({
    items: filtered.slice(0, 24),
  });
}

export async function POST(request: NextRequest) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const set = body?.set as StudySet | undefined;

    if (!set?.id || !set.title || !Array.isArray(set.cards) || set.cards.length === 0) {
      return NextResponse.json({ error: "Invalid study set payload." }, { status: 400 });
    }

    const moderation = moderatePublicStudySet(set);
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason || "This set could not be published." }, { status: 400 });
    }

    const existing = await prisma.studySet.findUnique({
      where: { id: set.id },
      select: { ownerId: true },
    });

    if (existing?.ownerId && existing.ownerId !== studyUser.id) {
      return NextResponse.json({ error: "Only the owner can publish this set." }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.studySet.upsert({
        where: { id: set.id },
        create: {
          id: set.id,
          ownerId: studyUser.id,
          title: set.title.trim(),
          description: set.description.trim() || null,
          folder: set.folder?.trim() || null,
          course: set.course.trim() || null,
          subject: set.subject.trim() || null,
          tags: set.tags,
          difficulty: toDbDifficulty(set.difficulty),
          visibility: "PUBLIC",
        },
        update: {
          ownerId: studyUser.id,
          title: set.title.trim(),
          description: set.description.trim() || null,
          folder: set.folder?.trim() || null,
          course: set.course.trim() || null,
          subject: set.subject.trim() || null,
          tags: set.tags,
          difficulty: toDbDifficulty(set.difficulty),
          visibility: "PUBLIC",
        },
      });

      await tx.flashcard.deleteMany({
        where: { setId: set.id },
      });

      await tx.flashcard.createMany({
        data: set.cards.map((card, index) => ({
          id: card.id,
          setId: set.id,
          front: card.front,
          back: card.back,
          hint: card.hint || null,
          mnemonic: card.mnemonic || null,
          pronunciation: card.pronunciation || null,
          formula: card.formula || null,
          example: card.example || null,
          imageFrontUrl: card.imageFrontUrl || null,
          imageBackUrl: card.imageBackUrl || null,
          difficulty: toDbDifficulty(card.difficulty),
          tags: card.tags,
          orderIndex: typeof card.orderIndex === "number" ? card.orderIndex : index,
        })),
      });
    });

    await upsertPublicStudySet({
      ...set,
      visibility: "public",
      ownerId: studyUser.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish study set." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const setId = String(body?.setId || "").trim();
    if (!setId) {
      return NextResponse.json({ error: "Missing set id." }, { status: 400 });
    }

    const existing = await prisma.studySet.findUnique({
      where: { id: setId },
      select: { ownerId: true },
    });

    if (existing?.ownerId && existing.ownerId !== studyUser.id) {
      return NextResponse.json({ error: "Only the owner can change this set." }, { status: 403 });
    }

    if (existing?.ownerId === studyUser.id) {
      await prisma.studySet.update({
        where: { id: setId },
        data: { visibility: "PRIVATE" },
      });
    }

    await removePublicStudySet(setId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unpublish study set." },
      { status: 500 },
    );
  }
}
