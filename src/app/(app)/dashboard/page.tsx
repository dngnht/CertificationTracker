import { redirect } from "next/navigation";

import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getMemberDashboardData } from "@/features/dashboard/queries";
import { goldBalance } from "@/features/gold/award";
import { StatusBadge, TypeBadge } from "@/components/features/status-badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireSession();
  if (user.role === "ADMIN") redirect("/admin/dashboard");

  const data = await getMemberDashboardData(user.id);
  const gold = await goldBalance(prisma, user.id);

  const cards = [
    { label: "Required", value: data.summary.required, tone: "text-foreground" },
    { label: "Completed", value: data.summary.completed, tone: "text-emerald-600" },
    { label: "In Progress", value: data.summary.inProgress, tone: "text-sky-600" },
    { label: "Overdue", value: data.summary.overdue, tone: "text-red-600" },
    { label: "Recommended", value: data.summary.recommended, tone: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Certification Plan</h1>
        <p className="text-sm text-muted-foreground">
          {data.compliance.compliant
            ? "You are compliant with all required certifications."
            : `${data.compliance.missingCount} required certification(s) outstanding.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className={`text-2xl font-bold ${c.tone}`}>{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-500">{gold}</p>
            <p className="text-sm text-muted-foreground">Gold</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Certification Plan</CardTitle>
          <CardDescription>Your assigned certifications and progress.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certification</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.certification.code}</div>
                    <div className="text-xs text-muted-foreground">{a.certification.name}</div>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={a.type} />
                  </TableCell>
                  <TableCell>
                    {a.deadline
                      ? a.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.effectiveStatus} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={a.progressPercent} className="flex-1" />
                      <span className="w-9 text-right text-xs text-muted-foreground">
                        {a.progressPercent}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}