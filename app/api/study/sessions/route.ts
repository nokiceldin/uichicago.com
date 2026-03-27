import { NextResponse } from "next/server";
import { requireCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import type { StudySessionRecord } from "@/lib/study/types";
import { serializeStudySession } from "@/lib/study/server";

function toDbMode(mode: StudySessionRecord["mode"]) {
  if (mode === "exam") return "EXAM";
  return mode.toUpperCase() as "FLASHCARDS" | "LEARN" | "TEST" | "MATCH";
}

export async function POST(request: Request) {
  try {
    const studyUser = await requireCurrentStudyUser();
    const body = await request.json();
    const session = body?.session as StudySessionRecord | undefined;

    if (!session?.id || !session.setId || !session.mode) {
      return NextResponse.json({ error: "Invalid study session payload." }, { status: 400 });
    }

    const set = await prisma.studySet.findUnique({
      where: { id: session.setId },
    });

    if (!set || set.ownerId !== studyUser.id) {
      return NextResponse.json({ error: "Study set not found." }, { status: 404 });
    }

    const saved = await prisma.studySession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        userId: studyUser.id,
        setId: session.setId,
        mode: toDbMode(session.mode),
        durationMs: session.durationMs,
        cardsReviewed: session.cardsReviewed,
        accuracy: session.accuracy,
        score: session.score,
        startedAt: new Date(session.startedAt),
        endedAt: session.endedAt ? new Date(session.endedAt) : null,
      },
      update: {
        userId: studyUser.id,
        durationMs: session.durationMs,
        cardsReviewed: session.cardsReviewed,
        accuracy: session.accuracy,
        score: session.score,
        startedAt: new Date(session.startedAt),
        endedAt: session.endedAt ? new Date(session.endedAt) : null,
      },
    });

    return NextResponse.json({ ok: true, session: serializeStudySession(saved as never) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save study session." }, { status: 500 });
  }
}
