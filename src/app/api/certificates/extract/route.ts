import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isOcrEnabled } from "@/features/ocr/service";
import { extractCertificateFiles } from "@/features/ocr/extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/certificates/extract
 *
 * Body: { files: [{ certificateFileId, blobPath }], targetMemberId?, lang? }
 *
 * Runs OCR on each uploaded certificate image, resolves catalog + roster
 * matches, and (when confident) persists a PENDING MemberCertification.
 * Never auto-verifies and never triggers a gold award.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOcrEnabled()) {
    return NextResponse.json({ error: "OCR extraction is disabled." }, { status: 423 });
  }

  let body: { files?: { certificateFileId: string; blobPath: string }[]; targetMemberId?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > 20) {
    return NextResponse.json({ error: "Too many files (max 20 per request)" }, { status: 429 });
  }

  const summary = await extractCertificateFiles(files, {
    actor: { id: session.user.id, role: session.user.role },
    targetMemberId: body.targetMemberId,
    lang: body.lang,
  });

  return NextResponse.json({ summary });
}