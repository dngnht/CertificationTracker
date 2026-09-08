"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { extractCertificateFile, extractCertificateFiles, type ExtractResult } from "./extraction";
import { checkHolderMatch } from "./rules";
import { z } from "zod";
import { rankSimilar } from "@/features/certifications/similarity";

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

const newCertInputSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().min(1, "Name is required").max(200),
  provider: z.string().trim().max(100).optional().nullable(),
  verifyUrlPattern: z.string().trim().max(500).optional().nullable(),
});

const createFromExtractionSchema = z.object({
  certificateFileId: z.string().min(1),
  // Either an existing catalog cert, or (admin only) a brand-new cert.
  certificationId: z.string().min(1).optional(),
  newCert: newCertInputSchema.optional(),
  memberId: z.string().min(1),
  certificate: z.object({
    certificateNumber: z.string().trim().max(100).optional().nullable(),
    issuedDate: z.string().datetime().optional().nullable(),
    expirationDate: z.string().datetime().optional().nullable(),
    verifyUrl: z.string().trim().max(500).optional().nullable(),
  }),
  confidence: z.number().min(0).max(1).optional(),
  rawJson: z.any().optional(),
  // CR-CERT-003: tên holder đọc từ cert (bằng chứng) để lưu + đối chiếu member.
  holderNameOnCert: z.string().trim().max(200).optional().nullable(),
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

    // CR-CERT-002: expiry must be after issue date.
    if (
      parsed.certificate.issuedDate &&
      parsed.certificate.expirationDate &&
      new Date(parsed.certificate.expirationDate) <= new Date(parsed.certificate.issuedDate)
    ) {
      throw new Error("Ngày hết hạn phải sau ngày cấp.");
    }

    // Resolve the catalog cert: existing id, or create a new one (admin only).
    let certificationId = parsed.certificationId;
    if (parsed.newCert) {
      if (user.role !== "ADMIN") {
        throw new Error("Chỉ admin mới được tạo cert mới vào danh mục.");
      }
      const existing = await prisma.certification.findMany({
        select: { id: true, code: true, name: true, provider: true },
      });
      const similar = rankSimilar(
        `${parsed.newCert.code} ${parsed.newCert.name}`,
        existing,
        (c) => ({ code: c.code, name: c.name }),
        { threshold: 0.8, limit: 5 }
      );
      if (similar.length > 0) {
        throw new Error(
          `Cert tương tự đã tồn tại: ${similar.map((s) => s.item.code).join(", ")}. Hãy gán vào cert có sẵn.`
        );
      }
      const cert = await prisma.certification.create({
        data: {
          code: parsed.newCert.code,
          name: parsed.newCert.name,
          provider: parsed.newCert.provider ?? "Unknown",
          verifyUrlPattern: parsed.newCert.verifyUrlPattern ?? null,
        },
      });
      certificationId = cert.id;
      await logAudit({
        actorId: user.id,
        action: "CREATE_CERTIFICATION",
        entityType: "Certification",
        entityId: cert.id,
        details: { code: cert.code, source: "OCR_REVIEW_FORM" },
      });
    }
    if (!certificationId) throw new Error("Thiếu certification.");

    const file = await prisma.certificateFile.findUnique({ where: { id: parsed.certificateFileId } });
    if (!file) throw new Error("Certificate file not found");

    // CR-CERT-003: snapshot holder name + match verdict against the attributed member.
    const holderNameOnCert = parsed.holderNameOnCert ?? null;
    const member = await prisma.user.findUnique({
      where: { id: parsed.memberId },
      select: { displayName: true },
    });
    const { matched, warn } = checkHolderMatch(holderNameOnCert, member?.displayName);

    const mc = await prisma.memberCertification.upsert({
      where: { memberId_certificationId: { memberId: parsed.memberId, certificationId } },
      create: {
        memberId: parsed.memberId,
        certificationId,
        status: "PLANNED",
        progressPercent: 0,
        verificationStatus: "PENDING",
        holderNameOnCert,
        holderNameMatched: matched,
        issuedDate: parsed.certificate.issuedDate ? new Date(parsed.certificate.issuedDate) : null,
        expirationDate: parsed.certificate.expirationDate ? new Date(parsed.certificate.expirationDate) : null,
        certificateNumber: parsed.certificate.certificateNumber ?? null,
        verifyUrl: parsed.certificate.verifyUrl ?? null,
        extractionSource: "MANUAL",
        extractionConfidence: parsed.confidence ?? null,
        extractionRaw: parsed.rawJson ?? undefined,
        extractedAt: new Date(),
      },
      update: {
        holderNameOnCert,
        holderNameMatched: matched,
        issuedDate: parsed.certificate.issuedDate ? new Date(parsed.certificate.issuedDate) : undefined,
        expirationDate: parsed.certificate.expirationDate ? new Date(parsed.certificate.expirationDate) : undefined,
        certificateNumber: parsed.certificate.certificateNumber ?? undefined,
        verifyUrl: parsed.certificate.verifyUrl ?? undefined,
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
      action: "SUBMIT_CERTIFICATE",
      entityType: "MemberCertification",
      entityId: mc.id,
      details: {
        source: "MANUAL_REVIEW",
        certificationId,
        memberId: parsed.memberId,
        holderNameOnCert,
        holderNameMatched: matched,
      },
    });

    revalidateTracker(["/my-certifications"]);
    return { id: mc.id, warnNameMismatch: warn };
  });
}