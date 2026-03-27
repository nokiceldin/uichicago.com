import { authOptions } from "@/auth";
import prisma from "@/lib/prisma";
import { ensureStudyUserForAuthUser } from "@/lib/auth/study-user";
import { getServerSession } from "next-auth";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

export async function getCurrentStudyUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  return ensureStudyUserForAuthUser({
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  });
}

export async function requireCurrentStudyUser() {
  const studyUser = await getCurrentStudyUser();
  if (!studyUser) {
    throw new Error("UNAUTHORIZED");
  }
  return studyUser;
}

export async function getCurrentAuthUserRecord() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
  });
}
