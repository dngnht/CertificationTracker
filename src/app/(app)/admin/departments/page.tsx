import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { config } from "@/features/config";
import { getDepartmentTree, listDepartments } from "@/features/departments/queries";
import { DepartmentTree } from "./department-tree";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  await requireAdmin();
  if (!config.departmentsEnabled) redirect("/admin/dashboard");

  const [tree, all] = await Promise.all([getDepartmentTree(), listDepartments()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Departments</h1>
        <p className="text-sm text-muted-foreground">
          Manage the hierarchical 部署 (department) structure.
        </p>
      </div>

      <DepartmentTree tree={tree} all={all} />
    </div>
  );
}