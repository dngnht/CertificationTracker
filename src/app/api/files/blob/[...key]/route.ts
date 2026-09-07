import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Stream a locally-stored certificate file. Used only when
 * FILE_STORAGE=local (development). Access is restricted to the owning member
 * or an admin.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ key: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await ctx.params;
  const keyStr = key.join("/");

  const fileRecord = await prisma.certificateFile.findFirst({
    where: { blobUrl: keyStr },
    include: { memberCertification: { select: { memberId: true } } },
  });
  if (!fileRecord) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A file may not be linked to a member certification yet (OCR flow); in that
  // case only the uploader or an admin may view it.
  const ownerId = fileRecord.memberCertification?.memberId ?? fileRecord.uploadedById;
  if (ownerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseDir = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? "./storage/uploads");
  const fullPath = path.resolve(baseDir, keyStr);
  if (!fullPath.startsWith(baseDir + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const buffer = await readFile(fullPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": fileRecord.contentType,
        "Content-Disposition": `inline; filename="${fileRecord.fileName}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}