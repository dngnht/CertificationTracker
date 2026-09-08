import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { listMembersInDeptTree } from "@/features/departments/queries";
import { getDeptTargetProgress } from "@/features/dept-analytics/queries";
import { TARGET_STATUS_STYLE } from "@/features/dept-analytics/compute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  if (!config.departmentsEnabled) redirect("/admin/dashboard");
  const { id } = await params;

  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) notFound();

  const members = await listMembersInDeptTree(dept.path);
  const targetProgress = await getDeptTargetProgress(id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{dept.name}</h1>
        <p className="text-sm text-muted-foreground">
          {dept.path} · depth {dept.depth} · {dept.isActive ? "active" : "disabled"}
        </p>
      </div>

      {config.deptAnalyticsEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cert & Targets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {targetProgress.targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có target cho department này.{" "}
                <Link href="/admin/departments/targets" className="underline">
                  Đặt target
                </Link>
              </p>
            ) : (
              targetProgress.targets.map((t) => {
                const st = TARGET_STATUS_STYLE[t.status];
                return (
                  <div key={t.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {t.certificationCode ? `${t.certificationCode} — ${t.certificationName}` : "Tổng số cert bất kỳ"}
                      </p>
                      <Badge className={st.text}>{st.label}</Badge>
                    </div>
                    <p className="mt-2 text-lg font-semibold">
                      {t.achieved}
                      <span className="text-sm font-normal text-muted-foreground"> / {t.targetCount}</span>
                    </p>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10">
                      <div
                        className={`h-full ${st.bar}`}
                        style={{ width: `${Math.round(t.completionRate * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.round(t.completionRate * 100)}%
                      {t.dueDate ? ` · hạn ${t.dueDate.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Members in this department and sub-departments ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell className="text-muted-foreground">{m.department?.path}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/members/${m.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}