import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Minimal transaction surface used by the award logic, so it can be unit
 * tested with a stub. Real callers pass a Prisma transaction client.
 */
export interface GoldTx {
  goldTransaction: {
    findUnique(args: any): Promise<any>;
    create(args: any): Promise<any>;
  };
}

/**
 * Credit gold to a member when a certification is verified.
 *
 * Idempotent via the unique `sourceKey = "AWARD:<memberId>:<certificationId>"`,
 * so re-verifying or a duplicate trigger never double-credits.
 *
 * Must be called inside the same transaction as `verifyCertificate()`.
 */
export async function awardGoldOnVerify(
  tx: GoldTx,
  input: {
    memberId: string;
    certificationId: string;
    reward: number;
    now?: Date;
  }
): Promise<{ awarded: boolean; amount: number }> {
  const now = input.now ?? new Date();
  if (input.reward <= 0) {
    return { awarded: false, amount: 0 };
  }

  const sourceKey = `AWARD:${input.memberId}:${input.certificationId}`;

  const existing = await tx.goldTransaction.findUnique({ where: { sourceKey } });
  if (existing) {
    return { awarded: false, amount: 0 };
  }

  await tx.goldTransaction.create({
    data: {
      memberId: input.memberId,
      certificationId: input.certificationId,
      amount: input.reward,
      reason: "CERT_AWARD",
      sourceKey,
      note: "Automatic award on verified certification",
      createdAt: now,
    },
  });

  return { awarded: true, amount: input.reward };
}

/**
 * Derived gold balance for a member (SUM of the ledger). Never stored.
 */
export async function goldBalance(
  prisma: Pick<PrismaClient, "goldTransaction">,
  memberId: string
): Promise<number> {
  const agg = await prisma.goldTransaction.aggregate({
    where: { memberId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Recent gold transactions for a member (for display). */
export async function recentGoldTransactions(
  prisma: PrismaClient,
  memberId: string,
  limit = 10
) {
  return prisma.goldTransaction.findMany({
    where: { memberId },
    include: { certification: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}