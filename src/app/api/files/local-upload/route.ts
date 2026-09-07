import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@/lib/auth";
import { MAX_CERTIFICATE_FILE_SIZE_BYTES, ALLOWED_CERTIFICATE_CONTENT_TYPES } from "@/features/config";

export const runtime = "nodejs";

/**
 * Local-development upload endpoint. In production (FILE_STORAGE=azure) the
 * browser uploads straight to Azure Blob via SAS and this route is unused.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const key = formData.get("key");
  const file = formData.get("file");

  if (typeof key !== "string" || !key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_CERTIFICATE_CONTENT_TYPES.includes(file.type as never)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }
  if (file.size > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const baseDir = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? "./storage/uploads");
  const fullPath = path.resolve(baseDir, key);
  // Prevent path traversal.
  if (!fullPath.startsWith(baseDir + path.sep)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return NextResponse.json({ ok: true });
}