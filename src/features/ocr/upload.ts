"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, getCurrentUser } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { getFileStorage, buildStorageKey } from "@/features/files/storage";
import { MAX_CERTIFICATE_FILE_SIZE_BYTES } from "@/features/config";
import { sha256Hex } from "@/features/files/hash";

const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;

/**
 * Step 1: prepare an OCR image upload. Unlike the certificate upload flow, no
 * MemberCertification needs to exist yet — the file is created standalone and
 * linked after extraction.
 */
export async function prepareOcrImageUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ key: string; descriptor: import("@/features/files/storage").UploadDescriptor }>> {
  return wrapAction(async () => {
    const user = await requireSession();
    if (!IMAGE_CONTENT_TYPES.includes(input.contentType as never)) {
      throw new Error("OCR supports PNG or JPEG images only.");
    }
    if (input.sizeBytes > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
      throw new Error("File exceeds the maximum allowed size.");
    }
    const key = buildStorageKey("ocr", input.fileName);
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
 * Step 2: record the uploaded image metadata. Returns the certificateFileId
 * and blobPath needed to call the extract endpoint.
 */
export async function completeOcrImageUpload(input: {
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ certificateFileId: string; blobPath: string }>> {
  return wrapAction(async () => {
    const user = await requireSession();
    if (!(await getCurrentUser())) {
      throw new Error("Session is stale. Please sign out and sign in again.");
    }
    // CR-CERT-002: SHA-256 of the uploaded image for tamper-evidence.
    const imageHash = sha256Hex(await getFileStorage().download(input.key));
    const file = await prisma.certificateFile.create({
      data: {
        memberCertificationId: null,
        blobUrl: input.key,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        imageHash,
        uploadedById: user.id,
      },
    });
    revalidateTracker(["/my-certifications"]);
    return { certificateFileId: file.id, blobPath: input.key };
  });
}