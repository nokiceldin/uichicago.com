import { NextResponse } from "next/server";
import { getCurrentStudyUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { serializeStudyNote } from "@/lib/study/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await getCurrentStudyUser().catch(() => null);
    const { id } = await params;
    const note = await prisma.studyNote.findFirst({
      where: {
        id: decodeURIComponent(id),
        OR: [
          { visibility: "PUBLIC" },
          ...(viewer ? [{ ownerId: viewer.id }] : []),
        ],
      },
    });

    if (!note) return NextResponse.json({ error: "Study material not found." }, { status: 404 });
    return NextResponse.json({ note: serializeStudyNote(note) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load this study material." },
      { status: 500 },
    );
  }
}
