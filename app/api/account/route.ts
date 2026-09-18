import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentSession, getCurrentStudyUser } from "@/lib/auth/session";

export async function DELETE() {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studyUser = await getCurrentStudyUser();

    await prisma.$transaction(async (tx) => {
      await tx.chatConversation.deleteMany({
        where: { userId: session.user!.id },
      });

      if (studyUser) {
        await tx.studyUser.delete({ where: { id: studyUser.id } });
      }

      await tx.user.deleteMany({
        where: { id: session.user!.id },
      });
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}
