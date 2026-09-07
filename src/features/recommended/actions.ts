"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";

/**
 * A member adds a featured recommended certification to their own plan as a
 * RECOMMENDED assignment. Idempotent via the unique (member, cert) constraint.
 */
export async function addToMyPlan(certCode: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    const cert = await prisma.certification.findUnique({
      where: { code: certCode },
      select: { id: true, isRecommendedFeatured: true },
    });
    if (!cert) throw new Error("Certification not found");
    if (!cert.isRecommendedFeatured) throw new Error("Certification is not featured as recommended");

    const existing = await prisma.certificationAssignment.findUnique({
      where: { memberId_certificationId: { memberId: user.id, certificationId: cert.id } },
    });
    if (existing) throw new Error("Already in your plan");

    await prisma.certificationAssignment.create({
      data: {
        memberId: user.id,
        certificationId: cert.id,
        type: "RECOMMENDED",
        status: "NOT_STARTED",
      },
    });

    revalidateTracker(["/recommended", "/dashboard", "/my-certifications"]);
  });
}