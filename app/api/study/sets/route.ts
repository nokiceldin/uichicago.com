import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import type { StudySet } from "@/lib/study/types";
import { serializeStudySet, toDbDifficulty, toDbVisibility } from "@/lib/study/server";

export async function POST(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const set = body?.set as StudySet | undefined;

    if (!set?.id || !set.title || !Array.isArray(set.cards) || set.cards.length === 0) {
      return NextResponse.json({ error: "Invalid study set payload." }, { status: 400 });
    }

    const saved = await prisma.$transaction(async (tx) => {
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
          visibility: toDbVisibility(set.visibility),
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
          visibility: toDbVisibility(set.visibility),
        },
      });

      await tx.flashcard.deleteMany({
        where: { setId: set.id },
      });

      if (set.cards.length) {
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
      }

      return tx.studySet.findUniqueOrThrow({
        where: { id: set.id },
        include: { flashcards: true },
      });
    });

    return NextResponse.json({ ok: true, set: serializeStudySet(saved as never) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save study set." }, { status: 500 });
  }
}
