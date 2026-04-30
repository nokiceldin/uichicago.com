import { NextResponse } from "next/server";
import { getCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { readPublicStudySets } from "@/lib/study/public-sets";
import { serializeStudySet } from "@/lib/study/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const studyUser = await getCurrentStudyUser().catch(() => null);
    const { id } = await params;

    const set = await prisma.studySet.findUnique({
      where: { id },
      include: { flashcards: true },
    });

    if (set && (set.visibility === "PUBLIC" || set.ownerId === studyUser?.id)) {
      return NextResponse.json({
        set: serializeStudySet(set, studyUser?.id),
      });
    }

    const legacy = (await readPublicStudySets()).find((entry) => entry.id === id && entry.visibility === "public");
    if (legacy) {
      return NextResponse.json({ set: legacy });
    }

    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load study set." },
      { status: 500 },
    );
  }
}
