import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getMissingAssignments } from "@/features/reports/queries";
import { listActiveDepartments } from "@/features/departments/queries";
import { ReportTable } from "@/components/features/report-table";
import { ReportFilterBar } from "@/components/features/report-filter-bar";
import { StatusBadge } from "@/components/features/status-badge";

export const dynamic = "force-dynamic";

export default async function MissingReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const [members, certifications, providers, departments] = await Promise.all([
    prisma.user.findMany({ select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.certification.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } }),
    prisma.certification.findMany({ select: { provider: true }, distinct: ["provider"] }),
    listActiveDepartments(),
  ]);

  const result = await getMissingAssignments({
    memberId: sp.memberId,
    certificationId: sp.certificationId,
    provider: sp.provider,
    deptPath: sp.dept,
  });

  const rows = result.items.map((a) => ({
    id: a.id,
    assignmentId: a.id,
    cells: {
      member: a.member.displayName,
      certification: `${a.certification.code} · ${a.certification.name}`,
      deadline: a.deadline
        ? a.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "—",
      status: <StatusBadge status={a.effectiveStatus} />,
    },
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Missing Certification Report</h1>
        <p className="text-sm text-muted-foreground">
          Required certifications that have not been started ({result.total}).
        </p>
      </div>

      <ReportFilterBar
        basePath="/admin/reports/missing"
        members={members.map((m) => ({ value: m.id, label: m.displayName }))}
        certifications={certifications.map((c) => ({ value: c.id, label: c.code }))}
        providers={providers.map((p) => ({ value: p.provider, label: p.provider }))}
        departments={departments.map((d) => ({ value: d.path, label: d.path }))}
        current={sp}
      />

      <ReportTable
        selectable
        columns={[
          { key: "member", label: "Member" },
          { key: "certification", label: "Certification" },
          { key: "deadline", label: "Deadline" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
      />
    </div>
  );
}