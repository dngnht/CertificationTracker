import type { AuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Append an audit log entry. Best-effort: never throws into the caller.
 */
export async function logAudit(input: {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        details: (input.details as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}