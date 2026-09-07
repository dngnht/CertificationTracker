import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "MEMBER" | "ADMIN";
}

/**
 * Require an authenticated session. Redirects to /login when absent.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user as SessionUser;
}

/**
 * Require an authenticated ADMIN. Redirects to /dashboard otherwise.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return session.user as SessionUser;
}

/**
 * Load the current user row from the database, or null when the session user
 * no longer exists.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export function assertAdmin(user: { role: string }): asserts user is { role: "ADMIN" } {
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: admin role required");
  }
}