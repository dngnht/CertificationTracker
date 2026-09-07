import { prisma } from "@/lib/prisma";

export interface HotCertification {
  certificationId: string;
  code: string;
  name: string;
  provider: string;
  isRecommendedFeatured: boolean;
  goldReward: number;
  newAssignments: number;
  completions: number;
  activeInProgress: number;
  featuredBoost: number;
  hotScore: number;
}

/**
 * Compute a "hot certifications" popularity score over a window.
 *
 *   hotScore = w1*newAssignments + w2*completions + w3*activeInProgress + w4*(featured?1:0)
 */
export async function getHotCertifications(
  opts: { windowDays?: number; limit?: number; now?: Date } = {}
): Promise<HotCertification[]> {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 90;
  const limit = Math.min(opts.limit ?? 10, 50);
  const windowStart = new Date(now.getTime() - windowDays * 86400000);

  const w1 = 1.0;
  const w2 = 1.5;
  const w3 = 0.8;
  const w4 = 5;

  const [certs, newAssignments, completions, inProgress] = await Promise.all([
    prisma.certification.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        provider: true,
        isRecommendedFeatured: true,
        goldReward: true,
      },
    }),
    prisma.certificationAssignment.groupBy({
      by: ["certificationId"],
      where: { createdAt: { gte: windowStart } },
      _count: { _all: true },
    }),
    prisma.memberCertification.groupBy({
      by: ["certificationId"],
      where: {
        status: "CERTIFIED",
        verificationStatus: "VERIFIED",
        updatedAt: { gte: windowStart },
      },
      _count: { _all: true },
    }),
    prisma.memberCertification.groupBy({
      by: ["certificationId"],
      where: { status: { in: ["LEARNING", "EXAM_SCHEDULED"] } },
      _count: { _all: true },
    }),
  ]);

  const naMap = new Map(newAssignments.map((r) => [r.certificationId, r._count._all]));
  const coMap = new Map(completions.map((r) => [r.certificationId, r._count._all]));
  const ipMap = new Map(inProgress.map((r) => [r.certificationId, r._count._all]));

  const results: HotCertification[] = certs.map((c) => {
    const newAssignments = naMap.get(c.id) ?? 0;
    const completions = coMap.get(c.id) ?? 0;
    const activeInProgress = ipMap.get(c.id) ?? 0;
    const featuredBoost = c.isRecommendedFeatured ? w4 : 0;
    const hotScore = w1 * newAssignments + w2 * completions + w3 * activeInProgress + featuredBoost;
    return {
      certificationId: c.id,
      code: c.code,
      name: c.name,
      provider: c.provider,
      isRecommendedFeatured: c.isRecommendedFeatured,
      goldReward: c.goldReward,
      newAssignments,
      completions,
      activeInProgress,
      featuredBoost,
      hotScore: Math.round(hotScore * 100) / 100,
    };
  });

  return results.sort((a, b) => b.hotScore - a.hotScore).slice(0, limit);
}