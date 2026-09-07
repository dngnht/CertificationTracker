import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getUpcomingDeadlines } from "@/features/reports/queries";
import { config } from "@/features/config";
import { ReportTable } from "@/components/features/report-table";
import { ReportFilterBar } from "@/components/features/report-filter-bar";
import { Progress } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

export default async function UpcomingReportPage({
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

  const result = await getUpcomingDeadlines(
    {
      memberId: sp.memberId,
      certificationId: sp.certificationId,
      provider: sp.provider,
    },
    config.expiringSoonDays
  );

  const rows = result.items.map((a) => ({
    id: a.id,
    assignmentId: a.id,
    cells: {
      member: a.member.displayName,
      certification: `${a.certification.code} · ${a.certification.name}`,
      deadline: a.deadline
        ? a.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "—",
      daysLeft: <span className="font-semibold">{a.daysLeft}</span>,
      progress: (
        <div className="flex items-center gap-2">
          <Progress value={a.progressPercent} className="w-24" />
          <span className="text-xs text-muted-foreground">{a.progressPercent}%</span>
        </div>
      ),
    },
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upcoming Deadlines</h1>
        <p className="text-sm text-muted-foreground">
          Assignments with deadlines within the next {config.expiringSoonDays} days ({result.total}).
        </p>
      </div>

      <ReportFilterBar
        basePath="/admin/reports/upcoming"
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
          { key: "deadline", label: "Deadline" },
          { key: "daysLeft", label: "Days Left" },
          { key: "progress", label: "Progress" },
        ]}
        rows={rows}
      />
    </div>
  );
}