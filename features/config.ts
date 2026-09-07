/**
 * Centralised configuration read from environment variables.
 * Keeps business rules in one place and easy to test.
 */

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  expiringSoonDays: int(process.env.CERTIFICATION_EXPIRING_SOON_DAYS, 30),
  maxCertificateFileSizeMB: int(process.env.MAX_CERTIFICATE_FILE_SIZE_MB, 10),
  reminderCooldownHours: int(process.env.REMINDER_COOLDOWN_HOURS, 24),
  fileStorage: (process.env.FILE_STORAGE ?? "local") as "azure" | "local",
  notificationBackend: (process.env.NOTIFICATION_BACKEND ?? "console") as
    | "console"
    | "resend",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  emailFrom: process.env.EMAIL_FROM ?? "Certification Tracker <no-reply@example.com>",

  // Module A — AI Assist
  aiProvider: (process.env.AI_PROVIDER ?? "openai-compatible") as
    | "openai-compatible"
    | "azure-openai",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "gpt-4o-mini",
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  azureOpenaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "",
  azureOpenaiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
  azureOpenaiApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-06-01",
  aiMaxBulkMutation: int(process.env.AI_MAX_BULK_MUTATION, 200),
  aiConversationPersist: (process.env.AI_CONVERSATION_PERSIST ?? "true") === "true",

  // Module B — Gold
  goldClawbackOnExpire: (process.env.GOLD_CLAWBACK_ON_EXPIRE ?? "false") === "true",
  goldLeaderboardEnabled: (process.env.GOLD_LEADERBOARD_ENABLED ?? "true") === "true",

  // CR-OCR-01 — OCR extraction
  ocrEnabled: (process.env.FEATURE_OCR_EXTRACTION ?? "true") === "true",
  ocrEngine: (process.env.OCR_ENGINE ?? "stub") as "easyocr" | "stub",
  ocrDefaultLang: process.env.OCR_DEFAULT_LANG ?? "eng",
  ocrReviewThreshold: Number(process.env.OCR_REVIEW_THRESHOLD ?? "0.75"),
  ocrScriptPath: process.env.OCR_SCRIPT_PATH ?? "./scripts/cert_ocr/extract.py",
  ocrServiceUrl: process.env.OCR_SERVICE_URL ?? "",
};

export const MAX_CERTIFICATE_FILE_SIZE_BYTES = config.maxCertificateFileSizeMB * 1024 * 1024;

export const ALLOWED_CERTIFICATE_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const ALLOWED_CERTIFICATE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;