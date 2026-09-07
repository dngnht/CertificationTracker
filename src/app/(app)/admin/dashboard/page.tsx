import Link from "next/link";

import { requireAdmin } from "@/lib/authz";
import { getAdminDashboardData } from "@/features/dashboard/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/components/features/status-badge";
import type { EffectiveAssignmentStatus } from "@/features/assignments/status";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#10b981",
  IN_PROGRESS: "#0ea5e9",
  NOT_STARTED: "#94a3b8",
  OVERDUE: "#ef4444",
  EXEMPTED: "#64748b",
  CERTIFICATE_EXPIRED: "#f59e0b",
};

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  void admin;
  const data = await getAdminDashboardData();

  const cards = [
    { label: "Members", value: data.totals.members },
    { label: "Required Assignments", value: data.totals.requiredAssignments },
    { label: "Completed", value: data.totals.completed },
    { label: "In Progress", value: data.totals.inProgress },
    { label: "Not Started", value: data.totals.notStarted },
    { label: "Overdue", value: data.totals.overdue },
    { label: "Expiring Soon", value: data.totals.expiringSoon },
    { label: "Pending Verification", value: data.totals.pendingVerification },
  ];

  const statusEntries = Object.entries(data.statusDistribution).filter(([, v]) => v > 0);
  const totalStatus = statusEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Organization-wide certification status.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Compliance */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compliance Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.compliance.rate}%</p>
            <p className="text-sm text-muted-foreground">
              {data.compliance.compliantMembers} / {data.compliance.totalMembers} members compliant
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${data.compliance.rate}%` }}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/members?compliance=compliant">
                  Compliant ({data.compliance.compliantMembers})
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/members?compliance=non_compliant">
                  Non-compliant ({data.compliance.nonCompliantMembers})
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Assignment status donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative h-28 w-28">
                <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
                  {statusEntries.map(([status, value], i) => {
                    const offset = statusEntries
                      .slice(0, i)
                      .reduce((s, [, v]) => s + (v / totalStatus) * 251.2, 0);
                    const len = (value / totalStatus) * 251.2;
                    return (
                      <circle
                        key={status}
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="none"
                        stroke={STATUS_COLORS[status]}
                        strokeWidth="4"
                        strokeDasharray={`${len} ${251.2 - len}`}
                        strokeDashoffset={-offset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                  {totalStatus}
                </div>
              </div>
              <div className="space-y-1 text-sm">
                {statusEntries.map(([status, value]) => (
                  <div key={status} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[status] }}
                    />
                    <span className="text-muted-foreground">
                      {STATUS_LABELS[status as EffectiveAssignmentStatus]}
                    </span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Required vs Recommended */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Required vs Recommended</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Bar label="Required" value={data.requiredVsRecommended.required} color="#2563eb" />
            <Bar label="Recommended" value={data.requiredVsRecommended.recommended} color="#a855f7" />
            <div className="pt-2">
              <p className="mb-2 text-sm font-medium text-muted-foreground">By Provider</p>
              <div className="space-y-2">
                {data.byProvider.map((p) => (
                  <div key={p.provider} className="flex items-center justify-between text-sm">
                    <span>{p.provider}</span>
                    <Badge variant="secondary">{p.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Needs Attention</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/reports/overdue">View overdue report</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.needsAttention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
          ) : (
            <div className="divide-y">
              {data.needsAttention.map((a) => (
                <div key={a.assignmentId} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">
                      {a.memberName} · {a.certificationCode}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {a.effectiveStatus === "OVERDUE" || a.effectiveStatus === "CERTIFICATE_EXPIRED"
                        ? `${a.daysOverdue} days overdue`
                        : a.effectiveStatus === "NOT_STARTED"
                          ? "Not started"
                          : a.daysLeft !== null
                            ? `Deadline in ${a.daysLeft} days`
                            : ""}{" "}
                      · {a.progressPercent}% progress
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/members/${a.memberId}`}>View</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const max = 500;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}