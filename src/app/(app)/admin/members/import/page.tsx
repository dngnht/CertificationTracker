import { requireAdmin } from "@/lib/authz";
import { ImportMembersForm } from "./import-members-form";

export const dynamic = "force-dynamic";

export default async function ImportMembersPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import members</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-add members and their 部署 (department) from a CSV file.
        </p>
      </div>
      <ImportMembersForm />
    </div>
  );
}