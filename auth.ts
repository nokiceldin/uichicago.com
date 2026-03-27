import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "database",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn() {
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
};
