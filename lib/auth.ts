import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "MEMBER" | "ADMIN";
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: "MEMBER" | "ADMIN";
  }
}

/**
 * Upsert a user from identity provider attributes.
 */
async function upsertUserFromIdentity(input: {
  providerAccountId: string;
  email: string;
  name: string;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Sync identity link and name but keep assigned role.
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        entraObjectId: input.providerAccountId,
        displayName: input.name || existing.displayName,
        isActive: true,
      },
    });
  }
  // First login from the corporate directory -> MEMBER by default.
  return prisma.user.create({
    data: {
      entraObjectId: input.providerAccountId,
      email,
      displayName: input.name || email,
      role: "MEMBER",
    },
  });
}

const devLoginEnabled = () =>
  process.env.AUTH_ENABLE_DEV_LOGIN === "true" || process.env.NODE_ENV !== "production";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? undefined,
    }),
    ...(devLoginEnabled()
      ? [
          Credentials({
            id: "dev-login",
            name: "Development Login",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              if (!devLoginEnabled()) return null;
              const email = typeof credentials?.email === "string" ? credentials.email : "";
              if (!email) return null;
              const user = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
              });
              if (!user || !user.isActive) return null;
              return {
                id: user.id,
                email: user.email,
                name: user.displayName,
                role: user.role,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: "MEMBER" | "ADMIN" }).role ?? "MEMBER";
      }
      if (account?.provider === "microsoft-entra-id") {
        // Ensure the corporate user exists in our database.
        const email = token.email;
        if (email) {
          const dbUser = await upsertUserFromIdentity({
            providerAccountId: account.providerAccountId,
            email,
            name: token.name ?? email,
          });
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as "MEMBER" | "ADMIN") ?? "MEMBER";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);