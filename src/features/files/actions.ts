"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin, getCurrentUser } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { getFileStorage, buildStorageKey } from "@/features/files/storage";
import {
  ALLOWED_CERTIFICATE_CONTENT_TYPES,
  MAX_CERTIFICATE_FILE_SIZE_BYTES,
} from "@/features/config";
import { verifyCertificateSchema, rejectCertificateSchema } from "@/features/schemas";
import { canMutateMemberCertification } from "@/features/files/access";
import { awardGoldOnVerify } from "@/features/gold/award";
import { sha256Hex } from "@/features/files/hash";

async function assertOwnerOrAdmin(memberCertificationId: string, userId: string) {
  const mc = await prisma.memberCertification.findUnique({
    where: { id: memberCertificationId },
    select: { memberId: true },
  });
  if (!mc) throw new Error("Member certification not found");
  const session = await requireSession();
  if (!canMutateMemberCertification(userId, mc.memberId, session.role)) {
    throw new Error("Forbidden: not your certification");
  }
  return mc;
}

/**
 * Step 1: prepare an upload. Returns a short-lived upload descriptor the
 * browser uses to push the file directly to storage (no proxying through
 * Next.js for Azure).
 */
export async function prepareCertificateUpload(input: {
  memberCertificationId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ key: string; descriptor: import("@/features/files/storage").UploadDescriptor }>> {
  return wrapAction(async () => {
    const user = await requireSession();
    await assertOwnerOrAdmin(input.memberCertificationId, user.id);

    if (!ALLOWED_CERTIFICATE_CONTENT_TYPES.includes(input.contentType as never)) {
      throw new Error("Unsupported file type. Use PDF, JPG, JPEG or PNG.");
    }
    if (input.sizeBytes > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
      throw new Error("File exceeds the maximum allowed size.");
    }

    const key = buildStorageKey(input.memberCertificationId, input.fileName);
    const storage = getFileStorage();
    const descriptor = await storage.createUploadDescriptor({
      key,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });

    return { key, descriptor };
  });
}

/**
 * Step 2: record the uploaded file metadata in PostgreSQL.
 */
export async function completeCertificateUpload(input: {
  memberCertificationId: string;
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    await assertOwnerOrAdmin(input.memberCertificationId, user.id);
    if (!(await getCurrentUser())) {
      throw new Error("Session is stale. Please sign out and sign in again.");
    }

    // CR-CERT-002: compute SHA-256 of the uploaded bytes for tamper-evidence.
    const imageHash = sha256Hex(await getFileStorage().download(input.key));

    await prisma.$transaction([
      prisma.certificateFile.create({
        data: {
          memberCertificationId: input.memberCertificationId,
          blobUrl: input.key,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          imageHash,
          uploadedById: user.id,
        },
      }),
      prisma.memberCertification.update({
        where: { id: input.memberCertificationId },
        data: { verificationStatus: "PENDING", rejectionReason: null },
      }),
    ]);

    await logAudit({
      actorId: user.id,
      action: "UPLOAD_CERTIFICATE",
      entityType: "MemberCertification",
      entityId: input.memberCertificationId,
      details: { fileName: input.fileName },
    });

    revalidateTracker(["/my-certifications"]);
  });
}

export async function deleteCertificate(fileId: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    const file = await prisma.certificateFile.findUnique({ where: { id: fileId } });
    if (!file) throw new Error("File not found");
    // A file may not be linked to a member certification yet (OCR flow).
    if (file.memberCertificationId) {
      const mc = await prisma.memberCertification.findUnique({
        where: { id: file.memberCertificationId },
        select: { memberId: true },
      });
      if (!mc || (mc.memberId !== user.id && user.role !== "ADMIN")) {
        throw new Error("Forbidden");
      }
    } else if (file.uploadedById !== user.id && user.role !== "ADMIN") {
      throw new Error("Forbidden");
    }

    await getFileStorage().delete(file.blobUrl);
    await prisma.certificateFile.delete({ where: { id: fileId } });

    await logAudit({
      actorId: user.id,
      action: "DELETE_CERTIFICATE",
      entityType: "CertificateFile",
      entityId: fileId,
    });
    revalidateTracker(["/my-certifications"]);
  });
}

export async function verifyCertificate(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = verifyCertificateSchema.parse(input);

    const mc = await prisma.memberCertification.findUnique({
      where: { id: parsed.memberCertificationId },
      include: { certification: { select: { goldReward: true } } },
    });
    if (!mc) throw new Error("Member certification not found");

    const result = await prisma.$transaction(async (tx) => {
      await tx.memberCertification.update({
        where: { id: parsed.memberCertificationId },
        data: {
          verificationStatus: "VERIFIED",
          status: "CERTIFIED",
          rejectionReason: null,
          verifiedById: admin.id,
          verifiedAt: new Date(),
        },
      });

      const award = await awardGoldOnVerify(tx, {
        memberId: mc.memberId,
        certificationId: mc.certificationId,
        reward: mc.certification.goldReward,
      });

      return award;
    });

    await logAudit({
      actorId: admin.id,
      action: "VERIFY_CERTIFICATE",
      entityType: "MemberCertification",
      entityId: parsed.memberCertificationId,
      details: { goldAwarded: result.awarded ? result.amount : 0 },
    });
    revalidateTracker();
  });
}

export async function rejectCertificate(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = rejectCertificateSchema.parse(input);

    await prisma.memberCertification.update({
      where: { id: parsed.memberCertificationId },
      data: { verificationStatus: "REJECTED", rejectionReason: parsed.reason },
    });

    await logAudit({
      actorId: admin.id,
      action: "REJECT_CERTIFICATE",
      entityType: "MemberCertification",
      entityId: parsed.memberCertificationId,
      details: { reason: parsed.reason },
    });
    revalidateTracker();
  });
}