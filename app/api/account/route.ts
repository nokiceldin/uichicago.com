import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentAuthUserRecord } from "@/lib/auth/session";

export async function DELETE() {
  try {
    const authUser = await getCurrentAuthUserRecord();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatConversation.deleteMany({
        where: { userId: authUser.id },
      });

      await tx.studyUser.deleteMany({
        where: { authUserId: authUser.id },
      });

      await tx.user.delete({
        where: { id: authUser.id },
      });
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}
