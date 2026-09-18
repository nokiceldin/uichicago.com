import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type AuthUserSeed = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export async function ensureStudyUserForAuthUser(authUser: AuthUserSeed) {
  // JWT sessions do not require a row in auth_users. Keep a stable, unique
  // link to the provider identity in sessionKey so every request resolves the
  // same StudyUser without an auth_users lookup and an unnecessary update.
  const bySessionKey = await prisma.studyUser.findUnique({
    where: { sessionKey: authUser.id },
  });

  if (bySessionKey) {
    const nextEmail = authUser.email ?? bySessionKey.email;
    const nextName = authUser.name ?? bySessionKey.displayName;
    const nextImage = authUser.image ?? bySessionKey.image;
    if (nextEmail === bySessionKey.email && nextName === bySessionKey.displayName && nextImage === bySessionKey.image) {
      return bySessionKey;
    }
    return prisma.studyUser.update({
      where: { id: bySessionKey.id },
      data: { email: nextEmail, displayName: nextName, image: nextImage },
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
          sessionKey: authUser.id,
          displayName: authUser.name ?? byEmail.displayName,
          image: authUser.image ?? byEmail.image,
        },
      });
    }
  }

  try {
    return await prisma.studyUser.create({
      data: {
        sessionKey: authUser.id,
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
        where: { sessionKey: authUser.id },
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
        sessionKey: authUser.id,
        email: authUser.email ?? recovered.email,
        displayName: authUser.name ?? recovered.displayName,
        image: authUser.image ?? recovered.image,
      },
    });
  }
}
