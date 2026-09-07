"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { getOcrService } from "@/features/ocr/service";
import { config } from "@/features/config";
import { z } from "zod";

const importCertSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(100).optional().nullable(),
});

export interface ImportCertRow {
  code: string;
  name: string;
  provider?: string | null;
}

/**
 * Bulk-import certifications. Existing codes are skipped (never duplicated).
 * Returns counts for the admin UI.
 */
export async function importCertifications(input: unknown): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const rows = z.array(importCertSchema).parse(input);

    const existing = await prisma.certification.findMany({
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((c) => c.code));

    const toCreate: { code: string; name: string; provider: string }[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const code = row.code.toUpperCase();
      if (seen.has(code) || existingCodes.has(code)) {
        skipped.push(code);
        continue;
      }
      seen.add(code);
      existingCodes.add(code);
      toCreate.push({
        code,
        name: row.name,
        provider: row.provider?.trim() || "Other",
      });
    }

    if (toCreate.length > 0) {
      await prisma.certification.createMany({ data: toCreate });
      await logAudit({
        actorId: admin.id,
        action: "CREATE_CERTIFICATION",
        entityType: "Certification",
        details: { imported: toCreate.map((c) => c.code), skipped },
      });
    }

    revalidateTracker();
    return { imported: toCreate.length, skipped: skipped.length };
  });
}

/**
 * Run OCR on an uploaded image and return every certification code + name found.
 * Admin-only; used to pre-fill the import list from a screenshot/image.
 */
export async function extractCertListFromImage(input: unknown): Promise<ActionResult<{ certs: { code: string; name: string }[] }>> {
  return wrapAction(async () => {
    await requireAdmin();
    const parsed = z
      .object({ image: z.instanceof(Uint8Array).transform((b) => Buffer.from(b)) })
      .parse(input);
    const certs = await getOcrService().extractCertList(parsed.image, config.ocrDefaultLang);
    return { certs };
  });
}