import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getOverdueAssignments } from "@/features/reports/queries";
import { ReportTable } from "@/components/report-table";
import { ReportFilterBar } from "@/components/report-filter-bar";
import { StatusBadge, TypeBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

export default async function OverdueReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const [members, certifications, providers] = await Promise.all([
    prisma.user.findMany({ select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.certification.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } }),
    prisma.certification.findMany({ select: { provider: true }, distinct: ["provider"] }),
  ]);

  const result = await getOverdueAssignments({
    memberId: sp.memberId,
    certificationId: sp.certificationId,
    provider: sp.provider,
    type: sp.type as "REQUIRED" | "RECOMMENDED" | undefined,
    minDaysOverdue: sp.minDaysOverdue ? Number(sp.minDaysOverdue) : undefined,
  });

  const rows = result.items.map((a) => ({
    id: a.id,
    assignmentId: a.id,
    cells: {
      member: a.member.displayName,
      certification: `${a.certification.code} · ${a.certification.name}`,
      type: <TypeBadge type={a.type} />,
      deadline: a.deadline
        ? a.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "—",
      daysOverdue: <span className="font-semibold text-red-600">{a.daysOverdue}</span>,
      progress: (
        <div className="flex items-center gap-2">
          <Progress value={a.progressPercent} className="w-24" />
          <span className="text-xs text-muted-foreground">{a.progressPercent}%</span>
        </div>
      ),
      status: <StatusBadge status={a.effectiveStatus} />,
    },
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overdue Report</h1>
        <p className="text-sm text-muted-foreground">
          Assignments past their deadline and not yet satisfied ({result.total}).
        </p>
      </div>

      <ReportFilterBar
        basePath="/admin/reports/overdue"
        members={members.map((m) => ({ value: m.id, label: m.displayName }))}
        certifications={certifications.map((c) => ({ value: c.id, label: c.code }))}
        providers={providers.map((p) => ({ value: p.provider, label: p.provider }))}
        current={sp}
      />

      <ReportTable
        selectable
        columns={[
          { key: "member", label: "Member" },
          { key: "certification", label: "Certification" },
          { key: "type", label: "Type" },
          { key: "deadline", label: "Deadline" },
          { key: "daysOverdue", label: "Days Overdue" },
          { key: "progress", label: "Progress" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
      />
    </div>
  );
}