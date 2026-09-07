import Link from "next/link";

import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { calculateCompliance } from "@/features/compliance/calculate";
import { listActiveDepartments } from "@/features/departments/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberFilterBar } from "./member-filter-bar";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ compliance?: string; q?: string; dept?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const [members, departments] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      include: {
        department: true,
        assignments: {
          include: {
            certification: { select: { code: true } },
            memberCert: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    listActiveDepartments(),
  ]);

  const rows = members.map((m) => {
    const compliance = calculateCompliance(m.assignments);
    return { ...m, compliance: compliance.status };
  });

  const filtered = rows.filter((r) => {
    if (sp.compliance === "compliant" && r.compliance !== "COMPLIANT") return false;
    if (sp.compliance === "non_compliant" && r.compliance !== "NON_COMPLIANT") return false;
    if (sp.q && !r.displayName.toLowerCase().includes(sp.q.toLowerCase())) return false;
    if (sp.dept && !r.department?.path.startsWith(sp.dept)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-muted-foreground">All active members and their compliance.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/members/import">Import CSV</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/members/new">Add member</Link>
          </Button>
        </div>
      </div>

      <MemberFilterBar
        departments={departments.map((d) => ({ value: d.path, label: d.path }))}
        current={{ compliance: sp.compliance ?? "", q: sp.q ?? "", dept: sp.dept ?? "" }}
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Compliance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{m.email}</TableCell>
                <TableCell className="text-muted-foreground">{m.department?.path ?? "—"}</TableCell>
                <TableCell>{m.assignments.filter((a) => a.type === "REQUIRED").length}</TableCell>
                <TableCell>
                  <Badge variant={m.compliance === "COMPLIANT" ? "success" : "destructive"}>
                    {m.compliance === "COMPLIANT" ? "Compliant" : "Non-compliant"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/members/${m.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}