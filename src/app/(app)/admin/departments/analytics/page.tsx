import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { getDeptCertStats, getTargetProgressAll } from "@/features/dept-analytics/queries";
import { listActiveDepartments } from "@/features/departments/queries";
import { AnalyticsView } from "./analytics-view";

export const dynamic = "force-dynamic";

export default async function DeptAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; cert?: string }>;
}) {
  await requireAdmin();
  if (!config.deptAnalyticsEnabled) redirect("/admin/departments");

  const { root, cert } = await searchParams;

  const [stats, targets, departments, certifications] = await Promise.all([
    getDeptCertStats(root),
    getTargetProgressAll(),
    listActiveDepartments(),
    prisma.certification.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <AnalyticsView
      stats={stats}
      targets={targets}
      departments={departments}
      certifications={certifications}
      rootPath={root ?? ""}
      certFilter={cert ?? ""}
    />
  );
}