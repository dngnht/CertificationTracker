import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, unlink, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { config } from "@/features/config";

/**
 * OCR extraction contract (Appendix A of CR-OCR-01).
 */
export interface OcrMatch {
  certificationCode: string | null;
  certificationName: string | null;
  provider: string | null;
  memberName: string | null;
  memberEmail: string | null;
}

export interface OcrCertificate {
  certificateNumber: string | null;
  issuedDate: string | null;
  expirationDate: string | null;
}

export interface OcrSuggested {
  status: "PLANNED" | "LEARNING" | "EXAM_SCHEDULED" | "CERTIFIED" | "FAILED";
  progressPercent: number;
  verificationStatus: "PENDING";
}

export interface OcrConfidence {
  ocr: number;
  overall: number;
  needsReview: boolean;
}

/** Per-field OCR confidence (CR-CERT-003) so the UI can highlight weak fields. */
export interface OcrFieldConfidence {
  certificationCode: number;
  certificationName: number;
  provider: number;
  memberName: number;
  memberEmail: number;
  issueDate: number;
  expirationDate: number;
  certificateNumber: number;
}

export interface OcrExtractionResult {
  match: OcrMatch;
  certificate: OcrCertificate;
  suggested: OcrSuggested;
  confidence: OcrConfidence;
  fieldConfidence: OcrFieldConfidence;
  warnings: string[];
}

export interface OcrService {
  extract(image: Buffer, lang: string): Promise<OcrExtractionResult>;
  /** Extract a list of certification codes + names from an image (admin import). */
  extractCertList(image: Buffer, lang: string): Promise<{ code: string; name: string }[]>;
}

/** Deterministic stub for development and tests when EasyOCR is unavailable. */
export class StubOcrService implements OcrService {
  async extract(_image: Buffer, _lang: string): Promise<OcrExtractionResult> {
    return {
      match: {
        certificationCode: "AZ-204",
        certificationName: "Microsoft Azure Developer Associate",
        provider: "Microsoft",
        memberName: "John Doe",
        memberEmail: "john@company.com",
      },
      certificate: {
        certificateNumber: "AZ204-STUB-001",
        issuedDate: "2026-01-15",
        expirationDate: "2028-01-15",
      },
      suggested: { status: "CERTIFIED", progressPercent: 100, verificationStatus: "PENDING" },
      confidence: { ocr: 0.92, overall: 0.94, needsReview: false },
      fieldConfidence: {
        certificationCode: 0.95,
        certificationName: 0.9,
        provider: 0.85,
        memberName: 0.9,
        memberEmail: 0.8,
        issueDate: 0.75,
        expirationDate: 0.7,
        certificateNumber: 0.88,
      },
      warnings: [],
    };
  }

  async extractCertList(_image: Buffer, _lang: string): Promise<{ code: string; name: string }[]> {
    return [
      { code: "AZ-204", name: "Microsoft Azure Developer Associate" },
      { code: "AWS-SAA", name: "AWS Certified Solutions Architect - Associate" },
    ];
  }
}

/**
 * EasyOCR via subprocess (option B). Calls the self-contained Python
 * extractor (`scripts/cert_ocr/extract.py`), which writes full JSON results to
 * an `--out` file. We read that file and return the first result's payload.
 */
export class EasyOcrService implements OcrService {
  async extract(image: Buffer, lang: string): Promise<OcrExtractionResult> {
    const tmpDir = os.tmpdir();
    const imgPath = path.join(tmpDir, `ocr-${randomUUID()}.png`);
    const outPath = path.join(tmpDir, `ocr-${randomUUID()}.json`);
    await writeFile(imgPath, image);

    try {
      await runPython([
        config.ocrScriptPath,
        imgPath,
        "--lang",
        lang,
        "--out",
        outPath,
      ]);
      const raw = JSON.parse(await readFile(outPath, "utf-8"));
      const first = raw?.results?.[0];
      if (!first) throw new Error("OCR service returned no results.");
      if (first.ok === false) {
        throw new Error(first.error ?? "OCR extraction failed.");
      }
      return normalizeResult(first.update_payload ?? first);
    } finally {
      await Promise.all([unlink(imgPath), unlink(outPath)]).catch(() => {});
    }
  }

  async extractCertList(image: Buffer, lang: string): Promise<{ code: string; name: string }[]> {
    const tmpDir = os.tmpdir();
    const imgPath = path.join(tmpDir, `ocrlist-${randomUUID()}.png`);
    const outPath = path.join(tmpDir, `ocrlist-${randomUUID()}.json`);
    await writeFile(imgPath, image);

    try {
      await runPython([
        config.ocrScriptPath,
        imgPath,
        "--lang",
        lang,
        "--list-certs",
        "--out",
        outPath,
      ]);
      const raw = JSON.parse(await readFile(outPath, "utf-8"));
      const certs = Array.isArray(raw?.certs) ? raw.certs : [];
      return certs
        .map((c: any) => ({
          code: typeof c?.code === "string" ? c.code.trim() : "",
          name: typeof c?.name === "string" ? c.name.trim() : "",
        }))
        .filter((c: { code: string; name: string }) => c.code.length > 0);
    } finally {
      await Promise.all([unlink(imgPath), unlink(outPath)]).catch(() => {});
    }
  }
}

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.OCR_PYTHON_BIN ?? "/opt/ocr-venv/bin/python3";
    const proc = spawn(pythonBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err) => reject(new Error(`Failed to launch OCR service: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`OCR service exited with code ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

function normalizeResult(raw: any): OcrExtractionResult {
  const conf = raw?.confidence ?? {};
  return {
    match: {
      certificationCode: raw?.match?.certificationCode ?? null,
      certificationName: raw?.match?.certificationName ?? null,
      provider: raw?.match?.provider ?? null,
      memberName: raw?.match?.memberName ?? null,
      memberEmail: raw?.match?.memberEmail ?? null,
    },
    certificate: {
      certificateNumber: raw?.certificate?.certificateNumber ?? null,
      issuedDate: raw?.certificate?.issuedDate ?? null,
      expirationDate: raw?.certificate?.expirationDate ?? null,
    },
    suggested: {
      status: raw?.suggested?.status ?? "PLANNED",
      progressPercent: raw?.suggested?.progressPercent ?? 0,
      verificationStatus: "PENDING",
    },
    confidence: {
      ocr: Number(conf?.ocr ?? 0),
      overall: Number(conf?.overall ?? 0),
      needsReview: Boolean(conf?.needsReview ?? false),
    },
    fieldConfidence: normalizeFieldConfidence(raw?.fields),
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(String) : [],
  };
}

function normalizeFieldConfidence(fields: any): OcrFieldConfidence {
  const num = (v: any): number => Number(v ?? 0);
  return {
    certificationCode: num(fields?.certificationCode),
    certificationName: num(fields?.certificationName),
    provider: num(fields?.provider),
    memberName: num(fields?.memberName),
    memberEmail: num(fields?.memberEmail),
    issueDate: num(fields?.issueDate),
    expirationDate: num(fields?.expirationDate),
    certificateNumber: num(fields?.certificateNumber),
  };
}

let cached: OcrService | null = null;

export function getOcrService(): OcrService {
  if (cached) return cached;
  cached = config.ocrEngine === "easyocr" ? new EasyOcrService() : new StubOcrService();
  return cached;
}

export function isOcrEnabled(): boolean {
  return config.ocrEnabled;
}