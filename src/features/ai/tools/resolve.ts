import { prisma } from "@/lib/prisma";
import type { ResolvedMember } from "./types";

/**
 * Resolve a member by email or display name (case-insensitive, substring on
 * email). Returns null when not found.
 */
export async function resolveMember(query: string): Promise<ResolvedMember | null> {
  const q = query.trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true, email: true },
  });
  return (
    users.find((u) => u.email === q) ||
    users.find((u) => u.email.includes(q)) ||
    users.find((u) => u.displayName.toLowerCase() === q) ||
    null
  );
}

/**
 * Resolve multiple members from a list of queries. Skips unknowns.
 */
export async function resolveMembers(queries: string[]): Promise<ResolvedMember[]> {
  const out: ResolvedMember[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const m = await resolveMember(q);
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}