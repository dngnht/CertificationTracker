"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { extractCertificateFile, extractCertificateFiles, type ExtractResult } from "./extraction";
import { z } from "zod";

const extractOneSchema = z.object({
  certificateFileId: z.string().min(1),
  blobPath: z.string().min(1),
  targetMemberId: z.string().optional(),
  lang: z.string().optional(),
});

const extractBatchSchema = z.object({
  files: z.array(z.object({ certificateFileId: z.string().min(1), blobPath: z.string().min(1) })).min(1).max(20),
  targetMemberId: z.string().optional(),
  lang: z.string().optional(),
});

const createFromExtractionSchema = z.object({
  certificateFileId: z.string().min(1),
  certificationId: z.string().min(1),
  memberId: z.string().min(1),
  certificate: z.object({
    certificateNumber: z.string().trim().max(100).optional().nullable(),
    issuedDate: z.string().datetime().optional().nullable(),
    expirationDate: z.string().datetime().optional().nullable(),
  }),
  confidence: z.number().min(0).max(1).optional(),
  rawJson: z.any().optional(),
});

export async function extractCertificate(input: unknown): Promise<ActionResult<ExtractResult>> {
  return wrapAction(async () => {
    const user = await requireSession();
    const parsed = extractOneSchema.parse(input);
    const result = await extractCertificateFile(
      { certificateFileId: parsed.certificateFileId, blobPath: parsed.blobPath },
      {
        actor: { id: user.id, role: user.role },
        targetMemberId: parsed.targetMemberId,
        lang: parsed.lang,
      }
    );
    revalidateTracker(["/my-certifications"]);
    return result;
  });
}

export async function extractCertificatesBatch(input: unknown): Promise<ActionResult<ExtractResult[]>> {
  return wrapAction(async () => {
    const user = await requireSession();
    const parsed = extractBatchSchema.parse(input);
    const summary = await extractCertificateFiles(parsed.files, {
      actor: { id: user.id, role: user.role },
      targetMemberId: parsed.targetMemberId,
      lang: parsed.lang,
    });
    revalidateTracker(["/my-certifications"]);
    return summary.results;
  });
}

/**
 * Persist a PENDING MemberCertification from reviewed extraction fields
 * (the "Edit & Save" path for low-confidence results). Admins may create for
 * any member; members only for themselves.
 */
export async function createMemberCertificationFromExtraction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const user = await requireSession();
    const parsed = createFromExtractionSchema.parse(input);

    if (user.role !== "ADMIN" && parsed.memberId !== user.id) {
      throw new Error("Forbidden: not your certification");
    }

    const file = await prisma.certificateFile.findUnique({ where: { id: parsed.certificateFileId } });
    if (!file) throw new Error("Certificate file not found");

    const mc = await prisma.memberCertification.upsert({
      where: { memberId_certificationId: { memberId: parsed.memberId, certificationId: parsed.certificationId } },
      create: {
        memberId: parsed.memberId,
        certificationId: parsed.certificationId,
        status: "PLANNED",
        progressPercent: 0,
        verificationStatus: "PENDING",
        issuedDate: parsed.certificate.issuedDate ? new Date(parsed.certificate.issuedDate) : null,
        expirationDate: parsed.certificate.expirationDate ? new Date(parsed.certificate.expirationDate) : null,
        certificateNumber: parsed.certificate.certificateNumber ?? null,
        extractionSource: "MANUAL",
        extractionConfidence: parsed.confidence ?? null,
        extractionRaw: parsed.rawJson ?? undefined,
        extractedAt: new Date(),
      },
      update: {
        issuedDate: parsed.certificate.issuedDate ? new Date(parsed.certificate.issuedDate) : undefined,
        expirationDate: parsed.certificate.expirationDate ? new Date(parsed.certificate.expirationDate) : undefined,
        certificateNumber: parsed.certificate.certificateNumber ?? undefined,
        extractionSource: "MANUAL",
        extractionConfidence: parsed.confidence ?? undefined,
        extractionRaw: parsed.rawJson ?? undefined,
        extractedAt: new Date(),
      },
    });

    await prisma.certificateFile.update({
      where: { id: file.id },
      data: { memberCertificationId: mc.id },
    });

    await logAudit({
      actorId: user.id,
      action: "CREATE_MEMBERCERT_FROM_OCR",
      entityType: "MemberCertification",
      entityId: mc.id,
      details: { source: "MANUAL_REVIEW", certificationId: parsed.certificationId, memberId: parsed.memberId },
    });

    revalidateTracker(["/my-certifications"]);
    return { id: mc.id };
  });
}