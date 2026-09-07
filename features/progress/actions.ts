"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import {
  updateMemberCertificationSchema,
  completeCertificateInfoSchema,
} from "@/features/schemas";

/**
 * A member updates their own learning progress on a certification.
 * The member must own the member certification.
 */
export async function updateOwnProgress(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    const parsed = updateMemberCertificationSchema.parse(input);

    const mc = await prisma.memberCertification.findUnique({
      where: { id: parsed.memberCertificationId },
    });
    if (!mc) throw new Error("Member certification not found");
    if (mc.memberId !== user.id) throw new Error("Forbidden: not your certification");

    await prisma.memberCertification.update({
      where: { id: mc.id },
      data: {
        ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.progressPercent !== undefined ? { progressPercent: parsed.progressPercent } : {}),
        ...(parsed.targetExamDate !== undefined
          ? { targetExamDate: parsed.targetExamDate ? new Date(parsed.targetExamDate) : null }
          : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes ?? null } : {}),
      },
    });

    revalidateTracker(["/my-certifications"]);
  });
}

/**
 * A member records certificate issuance details (dates, number). Only allowed
 * once the certificate has been uploaded and is not yet verified.
 */
export async function updateCertificateInfo(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    const parsed = completeCertificateInfoSchema.parse(input);

    const mc = await prisma.memberCertification.findUnique({
      where: { id: parsed.memberCertificationId },
    });
    if (!mc) throw new Error("Member certification not found");
    if (mc.memberId !== user.id) throw new Error("Forbidden: not your certification");

    await prisma.memberCertification.update({
      where: { id: mc.id },
      data: {
        ...(parsed.issuedDate !== undefined
          ? { issuedDate: parsed.issuedDate ? new Date(parsed.issuedDate) : null }
          : {}),
        ...(parsed.expirationDate !== undefined
          ? { expirationDate: parsed.expirationDate ? new Date(parsed.expirationDate) : null }
          : {}),
        ...(parsed.certificateNumber !== undefined
          ? { certificateNumber: parsed.certificateNumber ?? null }
          : {}),
      },
    });

    revalidateTracker(["/my-certifications"]);
  });
}