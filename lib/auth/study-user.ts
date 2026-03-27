import prisma from "@/lib/prisma";

type AuthUserSeed = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export async function ensureStudyUserForAuthUser(authUser: AuthUserSeed) {
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

  return prisma.studyUser.create({
    data: {
      authUserId: authUser.id,
      email: authUser.email,
      displayName: authUser.name,
      image: authUser.image,
      school: "UIC",
    },
  });
}
