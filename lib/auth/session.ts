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

  const authUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
    },
  });

  if (!authUser) {
    return null;
  }

  return ensureStudyUserForAuthUser({
    id: authUser.id,
    email: authUser.email ?? null,
    name: authUser.name ?? null,
    image: authUser.image ?? null,
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
