-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entraObjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "description" TEXT,
    "validityMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRecommendedFeatured" BOOLEAN NOT NULL DEFAULT false,
    "goldReward" INTEGER NOT NULL DEFAULT 0,
    "recommendedNote" TEXT,
    "featuredAt" DATETIME,
    "featuredById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CertificationAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "certificationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT,
    "lastReminderAt" DATETIME,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "exemptedAt" DATETIME,
    "exemptedById" TEXT,
    "exemptionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CertificationAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CertificationAssignment_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CertificationAssignment_exemptedById_fkey" FOREIGN KEY ("exemptedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberCertification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "certificationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "targetExamDate" DATETIME,
    "issuedDate" DATETIME,
    "expirationDate" DATETIME,
    "certificateNumber" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "notes" TEXT,
    "assignmentId" TEXT,
    "extractionSource" TEXT,
    "extractionConfidence" REAL,
    "extractionRaw" JSONB,
    "extractedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemberCertification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberCertification_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberCertification_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CertificationAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberCertificationId" TEXT,
    "blobUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificateFile_memberCertificationId_fkey" FOREIGN KEY ("memberCertificationId") REFERENCES "MemberCertification" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CertificateFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReminderLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CertificationAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReminderLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoldTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "certificationId" TEXT,
    "sourceKey" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoldTransaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoldTransaction_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GoldTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateExtraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certificateFileId" TEXT NOT NULL,
    "memberCertificationId" TEXT,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "needsReview" BOOLEAN NOT NULL,
    "rawJson" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificateExtraction_certificateFileId_fkey" FOREIGN KEY ("certificateFileId") REFERENCES "CertificateFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Certification_code_key" ON "Certification"("code");

-- CreateIndex
CREATE INDEX "Certification_isRecommendedFeatured_idx" ON "Certification"("isRecommendedFeatured");

-- CreateIndex
CREATE INDEX "CertificationAssignment_memberId_idx" ON "CertificationAssignment"("memberId");

-- CreateIndex
CREATE INDEX "CertificationAssignment_certificationId_idx" ON "CertificationAssignment"("certificationId");

-- CreateIndex
CREATE INDEX "CertificationAssignment_deadline_idx" ON "CertificationAssignment"("deadline");

-- CreateIndex
CREATE INDEX "CertificationAssignment_status_idx" ON "CertificationAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CertificationAssignment_memberId_certificationId_key" ON "CertificationAssignment"("memberId", "certificationId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCertification_assignmentId_key" ON "MemberCertification"("assignmentId");

-- CreateIndex
CREATE INDEX "MemberCertification_memberId_idx" ON "MemberCertification"("memberId");

-- CreateIndex
CREATE INDEX "MemberCertification_certificationId_idx" ON "MemberCertification"("certificationId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCertification_memberId_certificationId_key" ON "MemberCertification"("memberId", "certificationId");

-- CreateIndex
CREATE INDEX "CertificateFile_memberCertificationId_idx" ON "CertificateFile"("memberCertificationId");

-- CreateIndex
CREATE INDEX "ReminderLog_memberId_idx" ON "ReminderLog"("memberId");

-- CreateIndex
CREATE INDEX "ReminderLog_assignmentId_idx" ON "ReminderLog"("assignmentId");

-- CreateIndex
CREATE INDEX "ReminderLog_createdAt_idx" ON "ReminderLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoldTransaction_sourceKey_key" ON "GoldTransaction"("sourceKey");

-- CreateIndex
CREATE INDEX "GoldTransaction_memberId_idx" ON "GoldTransaction"("memberId");

-- CreateIndex
CREATE INDEX "GoldTransaction_certificationId_idx" ON "GoldTransaction"("certificationId");

-- CreateIndex
CREATE INDEX "GoldTransaction_createdAt_idx" ON "GoldTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_idx" ON "AiMessage"("conversationId");

-- CreateIndex
CREATE INDEX "CertificateExtraction_certificateFileId_idx" ON "CertificateExtraction"("certificateFileId");

-- CreateIndex
CREATE INDEX "CertificateExtraction_memberCertificationId_idx" ON "CertificateExtraction"("memberCertificationId");
