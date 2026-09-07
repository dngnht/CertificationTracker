import { prisma } from "@/lib/prisma";
import { enrichAssignments } from "@/features/assignments/effective";
import { goldBalance } from "@/features/gold/award";

/**
 * Featured recommended certifications with the member's own status for each.
 */
export async function getRecommendedCatalog(memberId: string) {
  const [certs, assignments, balance, recent] = await Promise.all([
    prisma.certification.findMany({
      where: { isActive: true, isRecommendedFeatured: true },
      orderBy: [{ goldReward: "desc" }, { provider: "asc" }, { code: "asc" }],
    }),
    prisma.certificationAssignment.findMany({
      where: { memberId },
      include: {
        certification: { select: { code: true, name: true, provider: true } },
        member: { select: { id: true, displayName: true, email: true } },
        memberCert: true,
      },
    }),
    goldBalance(prisma, memberId),
    prisma.goldTransaction.findMany({
      where: { memberId },
      include: { certification: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const enriched = enrichAssignments(assignments);
  const byCode = new Map(enriched.map((a) => [a.certification.code, a]));

  const catalog = certs.map((c) => {
    const assignment = byCode.get(c.code);
    return {
      ...c,
      memberStatus: assignment?.effectiveStatus ?? null,
      memberProgress: assignment?.progressPercent ?? 0,
      memberCertificationId: assignment?.memberCert?.id ?? null,
      hasAssignment: Boolean(assignment),
    };
  });

  return { catalog, balance, recent };
}