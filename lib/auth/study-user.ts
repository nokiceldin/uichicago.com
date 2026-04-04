import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type AuthUserSeed = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export async function ensureStudyUserForAuthUser(authUser: AuthUserSeed) {
  const hasPersistedAuthUser = authUser.id
    ? Boolean(
        await prisma.user.findUnique({
          where: { id: authUser.id },
          select: { id: true },
        }),
      )
    : false;
  const byAuthId = hasPersistedAuthUser
    ? await prisma.studyUser.findUnique({
        where: { authUserId: authUser.id },
      })
    : null;

  if (byAuthId) {
    return prisma.studyUser.update({
      where: { id: byAuthId.id },
      data: {
        email: authUser.email ?? byAuthId.email,
        displayName: authUser.name ?? byAuthId.displayName,
        image: authUser.image ?? byAuthId.image,
      },
    });
  }

  if (authUser.email) {
    const byEmail = await prisma.studyUser.findUnique({
      where: { email: authUser.email },
    });

    if (byEmail) {
      return prisma.studyUser.update({
        where: { id: byEmail.id },
        data: {
          authUserId: hasPersistedAuthUser ? authUser.id : byEmail.authUserId,
          displayName: authUser.name ?? byEmail.displayName,
          image: authUser.image ?? byEmail.image,
        },
      });
    }
  }

  try {
    return await prisma.studyUser.create({
      data: {
        authUserId: hasPersistedAuthUser ? authUser.id : null,
        email: authUser.email,
        displayName: authUser.name,
        image: authUser.image,
        school: "UIC",
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const recovered =
      (await prisma.studyUser.findUnique({
        where: { authUserId: authUser.id },
      })) ||
      (authUser.email
        ? await prisma.studyUser.findUnique({
            where: { email: authUser.email },
          })
        : null);

    if (!recovered) {
      throw error;
    }

    return prisma.studyUser.update({
      where: { id: recovered.id },
      data: {
        authUserId: hasPersistedAuthUser ? authUser.id : recovered.authUserId,
        email: authUser.email ?? recovered.email,
        displayName: authUser.name ?? recovered.displayName,
        image: authUser.image ?? recovered.image,
      },
    });
  }
}
