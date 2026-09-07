import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { config } from "@/features/config";
import { getFileStorage } from "@/features/files/storage";
import { getOcrService, type OcrExtractionResult } from "./service";
import { logAudit } from "@/features/audit/log";
import { shouldAutoCreate, normalizeCertCode, suggestedProgress } from "./rules";

export interface ExtractFileInput {
  certificateFileId: string;
  blobPath: string;
}

export interface ExtractActor {
  id: string;
  role: "MEMBER" | "ADMIN";
}

export interface ExtractOptions {
  actor: ExtractActor;
  targetMemberId?: string;
  lang?: string;
}

export interface ExtractResult {
  certificateFileId: string;
  match: {
    certificationCode: string | null;
    certificationId: string | null;
    memberName: string | null;
    memberEmail: string | null;
    memberId: string | null;
  };
  certificate: OcrExtractionResult["certificate"];
  suggested: OcrExtractionResult["suggested"];
  confidence: OcrExtractionResult["confidence"];
  warnings: string[];
  needsReview: boolean;
  createdMemberCertificationId: string | null;
}

export interface ExtractSummary {
  total: number;
  autoAcceptable: number;
  needsReview: number;
  failed: number;
  results: ExtractResult[];
}

/**
 * Run OCR on one uploaded certificate image, resolve catalog + roster matches,
 * and (when confident) persist a PENDING MemberCertification.
 *
 * OCR only suggests — it never sets verificationStatus = VERIFIED and never
 * triggers a gold award (those happen only on admin VERIFY).
 */
export async function extractCertificateFile(
  input: ExtractFileInput,
  opts: ExtractOptions
): Promise<ExtractResult> {
  const file = await prisma.certificateFile.findUnique({ where: { id: input.certificateFileId } });
  if (!file) throw new Error("Certificate file not found");

  // Authorization: a member may only extract files they uploaded (their own).
  if (opts.actor.role !== "ADMIN" && file.uploadedById !== opts.actor.id) {
    throw new Error("Forbidden: not your certificate file");
  }

  const bytes = await getFileStorage().download(input.blobPath);
  const lang = opts.lang ?? config.ocrDefaultLang;

  const raw: OcrExtractionResult = await getOcrService().extract(bytes, lang);

  // Resolve certification from catalog by code.
  const certificationId = await resolveCertificationId(raw.match.certificationCode);

  // Resolve member. Members can only attach to themselves; admins may target
  // a member explicitly (which wins over the OCR guess).
  let memberId: string | null = null;
  let memberEmail = raw.match.memberEmail;
  let memberName = raw.match.memberName;
  let warnings = [...raw.warnings];

  if (opts.actor.role === "MEMBER") {
    memberId = opts.actor.id;
  } else if (opts.targetMemberId) {
    memberId = opts.targetMemberId;
    if (raw.match.memberEmail) {
      const guessed = await prisma.user.findUnique({ where: { email: raw.match.memberEmail } });
      if (guessed && guessed.id !== opts.targetMemberId) {
        warnings.push("OCR-guessed member differs from the selected target member.");
      }
    }
  } else {
    const resolved = await resolveMemberId(raw.match.memberEmail, raw.match.memberName);
    memberId = resolved?.id ?? null;
    memberEmail = resolved?.email ?? memberEmail;
    memberName = resolved?.displayName ?? memberName;
  }

  const overall = raw.confidence.overall;
  const needsReview = !shouldAutoCreate({
    overall,
    needsReview: raw.confidence.needsReview,
    certificationId,
    memberId,
    threshold: config.ocrReviewThreshold,
  });

  let createdMemberCertificationId: string | null = null;

  if (!needsReview && certificationId && memberId) {
    createdMemberCertificationId = await persistPendingMemberCertification({
      memberId,
      certificationId,
      certificateFileId: file.id,
      raw,
      actorId: opts.actor.id,
    });
  } else {
    // Record the attempt for audit even when it needs review.
    await prisma.certificateExtraction.create({
      data: {
        certificateFileId: file.id,
        source: "OCR_EASYOCR",
        confidence: overall,
        needsReview: true,
        rawJson: raw as unknown as PrismaJson,
        createdById: opts.actor.id,
      },
    });
    await logAudit({
      actorId: opts.actor.id,
      action: "EXTRACT_CERTIFICATE",
      entityType: "CertificateFile",
      entityId: file.id,
      details: { needsReview: true, confidence: overall, warnings },
    });
  }

  return {
    certificateFileId: file.id,
    match: {
      certificationCode: raw.match.certificationCode,
      certificationId,
      memberName,
      memberEmail,
      memberId,
    },
    certificate: raw.certificate,
    suggested: raw.suggested,
    confidence: raw.confidence,
    warnings,
    needsReview,
    createdMemberCertificationId,
  };
}

async function resolveCertificationId(code: string | null): Promise<string | null> {
  if (!code) return null;
  const normalized = normalizeCertCode(code);
  const all = await prisma.certification.findMany({ select: { id: true, code: true } });
  const hit = all.find((c) => normalizeCertCode(c.code) === normalized);
  return hit?.id ?? null;
}

async function resolveMemberId(email: string | null, name: string | null) {
  if (email) {
    const needle = email.toLowerCase();
    const byEmail = await prisma.user.findFirst({
      where: { email: { equals: needle } },
      select: { id: true, email: true, displayName: true },
    });
    if (byEmail) return byEmail;
  }
  if (name) {
    const needle = name.toLowerCase();
    const byName = await prisma.user.findFirst({
      where: { displayName: { equals: needle } },
      select: { id: true, email: true, displayName: true },
    });
    if (byName) return byName;
  }
  return null;
}

async function persistPendingMemberCertification(input: {
  memberId: string;
  certificationId: string;
  certificateFileId: string;
  raw: OcrExtractionResult;
  actorId: string;
}): Promise<string> {
  const { memberId, certificationId, certificateFileId, raw, actorId } = input;

  const progressPercent = suggestedProgress(raw.suggested.status, raw.suggested.progressPercent);

  const mc = await prisma.memberCertification.upsert({
    where: { memberId_certificationId: { memberId, certificationId } },
    create: {
      memberId,
      certificationId,
      status: raw.suggested.status,
      progressPercent,
      verificationStatus: "PENDING",
      issuedDate: raw.certificate.issuedDate ? new Date(raw.certificate.issuedDate) : null,
      expirationDate: raw.certificate.expirationDate ? new Date(raw.certificate.expirationDate) : null,
      certificateNumber: raw.certificate.certificateNumber ?? null,
      extractionSource: "OCR_EASYOCR",
      extractionConfidence: raw.confidence.overall,
      extractionRaw: raw as unknown as PrismaJson,
      extractedAt: new Date(),
    },
    update: {
      status: raw.suggested.status,
      progressPercent,
      // Never overwrite a VERIFIED/REJECTED state from OCR.
      ...(raw.suggested.status === "CERTIFIED" ? { verificationStatus: "PENDING" as const } : {}),
      issuedDate: raw.certificate.issuedDate ? new Date(raw.certificate.issuedDate) : undefined,
      expirationDate: raw.certificate.expirationDate ? new Date(raw.certificate.expirationDate) : undefined,
      certificateNumber: raw.certificate.certificateNumber ?? undefined,
      extractionSource: "OCR_EASYOCR",
      extractionConfidence: raw.confidence.overall,
      extractionRaw: raw as unknown as PrismaJson,
      extractedAt: new Date(),
    },
  });

  // Link the uploaded file to the member certification.
  await prisma.certificateFile.update({
    where: { id: certificateFileId },
    data: { memberCertificationId: mc.id },
  });

  await prisma.certificateExtraction.create({
    data: {
      certificateFileId,
      memberCertificationId: mc.id,
      source: "OCR_EASYOCR",
      confidence: raw.confidence.overall,
      needsReview: false,
      rawJson: raw as unknown as PrismaJson,
      createdById: actorId,
    },
  });

  await logAudit({
    actorId,
    action: "CREATE_MEMBERCERT_FROM_OCR",
    entityType: "MemberCertification",
    entityId: mc.id,
    details: { certificationId, memberId, confidence: raw.confidence.overall },
  });

  return mc.id;
}

/**
 * Run extraction over a batch of files. Each file is independent — one failure
 * does not abort the rest.
 */
export async function extractCertificateFiles(
  files: ExtractFileInput[],
  opts: ExtractOptions
): Promise<ExtractSummary> {
  const results: ExtractResult[] = [];
  let autoAcceptable = 0;
  let needsReview = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const result = await extractCertificateFile(file, opts);
      results.push(result);
      if (result.needsReview) needsReview++;
      else autoAcceptable++;
    } catch (err) {
      failed++;
      results.push({
        certificateFileId: file.certificateFileId,
        match: { certificationCode: null, certificationId: null, memberName: null, memberEmail: null, memberId: null },
        certificate: { certificateNumber: null, issuedDate: null, expirationDate: null },
        suggested: { status: "PLANNED", progressPercent: 0, verificationStatus: "PENDING" },
        confidence: { ocr: 0, overall: 0, needsReview: true },
        warnings: [err instanceof Error ? err.message : "Extraction failed"],
        needsReview: true,
        createdMemberCertificationId: null,
      });
    }
  }

  return { total: files.length, autoAcceptable, needsReview, failed, results };
}

type PrismaJson = Prisma.InputJsonValue;