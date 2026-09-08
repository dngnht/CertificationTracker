import { z } from "zod";

/** Zod input cho CRUD target (CR-DEPT-02). */
export const TargetInputSchema = z.object({
  departmentId: z.string().min(1),
  certificationId: z.string().min(1).optional().nullable(),
  targetCount: z.number().int().min(1),
  dueDate: z.string().datetime().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export type TargetInput = z.infer<typeof TargetInputSchema>;

export const DeleteTargetInputSchema = z.object({
  id: z.string().min(1),
});

export type DeleteTargetInput = z.infer<typeof DeleteTargetInputSchema>;