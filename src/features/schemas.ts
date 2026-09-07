import { z } from "zod";

export const createCertificationSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().min(1, "Name is required").max(200),
  provider: z.string().trim().min(1, "Provider is required").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  validityMonths: z.number().int().positive().max(240).optional().nullable(),
  goldReward: z.number().int().min(0).max(1_000_000).optional().nullable(),
  isRecommendedFeatured: z.boolean().optional(),
  recommendedNote: z.string().trim().max(500).optional().nullable(),
});

export const updateCertificationSchema = createCertificationSchema.partial().extend({
  id: z.string().min(1),
});

export const assignCertificationSchema = z.object({
  certificationId: z.string().min(1),
  memberIds: z.array(z.string().min(1)).min(1, "Select at least one member"),
  type: z.enum(["REQUIRED", "RECOMMENDED"]),
  deadline: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  type: z.enum(["REQUIRED", "RECOMMENDED"]).optional(),
  deadline: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const exemptAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

export const updateMemberCertificationSchema = z.object({
  memberCertificationId: z.string().min(1),
  status: z.enum(["PLANNED", "LEARNING", "EXAM_SCHEDULED", "CERTIFIED", "FAILED"]).optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  targetExamDate: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const completeCertificateInfoSchema = z.object({
  memberCertificationId: z.string().min(1),
  issuedDate: z.string().datetime().optional().nullable(),
  expirationDate: z.string().datetime().optional().nullable(),
  certificateNumber: z.string().trim().max(100).optional().nullable(),
});

export const verifyCertificateSchema = z.object({
  memberCertificationId: z.string().min(1),
});

export const rejectCertificateSchema = z.object({
  memberCertificationId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

export const sendReminderSchema = z.object({
  assignmentIds: z.array(z.string().min(1)).min(1, "Select at least one assignment"),
  force: z.boolean().optional().default(false),
});