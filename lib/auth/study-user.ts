import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type AuthUserSeed = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export async function ensureStudyUserForAuthUser(authUser: AuthUserSeed) {
  const updateData = {
    email: authUser.email,
    displayName: authUser.name,
    image: authUser.image,
  };

  const byAuthId = await prisma.studyUser.findUnique({
    where: { authUserId: authUser.id },
  });

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
          authUserId: authUser.id,
          displayName: authUser.name ?? byEmail.displayName,
          image: authUser.image ?? byEmail.image,
        },
      });
    }
  }

  try {
    return await prisma.studyUser.create({
      data: {
        authUserId: authUser.id,
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
        authUserId: authUser.id,
        email: authUser.email ?? recovered.email,
        displayName: authUser.name ?? recovered.displayName,
        image: authUser.image ?? recovered.image,
      },
    });
  }
}
