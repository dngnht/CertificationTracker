import { createHash } from "node:crypto";

/** SHA-256 hex digest of a buffer (CR-CERT-002: tamper-evident image evidence). */
export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}