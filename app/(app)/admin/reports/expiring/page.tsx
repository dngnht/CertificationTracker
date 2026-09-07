import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getExpiringCertificates } from "@/features/reports/queries";
import { config } from "@/features/config";
import { ReportTable } from "@/components/report-table";

export const dynamic = "force-dynamic";

export default async function ExpiringReportPage() {
  await requireAdmin();

  const result = await getExpiringCertificates(config.expiringSoonDays);

  const rows = result.items.map((c) => ({
    id: c.id,
    cells: {
      member: c.member.displayName,
      certification: `${c.certification.code} · ${c.certification.name}`,
      expiration: c.expirationDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      daysLeft: <span className="font-semibold text-amber-600">{c.daysLeft}</span>,
    },
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Expiring Certificates</h1>
        <p className="text-sm text-muted-foreground">
          Verified certificates expiring within the next {config.expiringSoonDays} days ({result.total}).
        </p>
      </div>

      <ReportTable
        columns={[
          { key: "member", label: "Member" },
          { key: "certification", label: "Certification" },
          { key: "expiration", label: "Expiration" },
          { key: "daysLeft", label: "Days Left" },
        ]}
        rows={rows}
      />
    </div>
  );
}