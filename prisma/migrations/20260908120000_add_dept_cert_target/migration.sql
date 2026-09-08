-- CreateTable
CREATE TABLE "DepartmentCertTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "certificationId" TEXT,
    "targetCount" INTEGER NOT NULL,
    "dueDate" DATETIME,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepartmentCertTarget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentCertTarget_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentCertTarget_departmentId_certificationId_key" ON "DepartmentCertTarget"("departmentId", "certificationId");

-- CreateIndex
CREATE INDEX "DepartmentCertTarget_departmentId_idx" ON "DepartmentCertTarget"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentCertTarget_certificationId_idx" ON "DepartmentCertTarget"("certificationId");

-- CreateIndex
CREATE INDEX "DepartmentCertTarget_dueDate_idx" ON "DepartmentCertTarget"("dueDate");