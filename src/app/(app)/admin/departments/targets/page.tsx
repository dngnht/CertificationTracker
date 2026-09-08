import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { listTargets } from "@/features/dept-analytics/queries";
import { listActiveDepartments } from "@/features/departments/queries";
import { TargetsManager } from "./targets-manager";

export const dynamic = "force-dynamic";

export default async function DeptTargetsPage() {
  await requireAdmin();
  if (!config.deptAnalyticsEnabled) redirect("/admin/departments");

  const [targets, departments, certifications] = await Promise.all([
    listTargets(),
    listActiveDepartments(),
    prisma.certification.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <TargetsManager
      targets={targets.map((t) => ({
        id: t.id,
        departmentId: t.departmentId,
        departmentName: t.department.name,
        departmentPath: t.department.path,
        certificationId: t.certificationId,
        certificationCode: t.certification?.code ?? null,
        certificationName: t.certification?.name ?? null,
        targetCount: t.targetCount,
        dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
        note: t.note,
      }))}
      departments={departments.map((d) => ({ id: d.id, path: d.path, name: d.name }))}
      certifications={certifications.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
    />
  );
}