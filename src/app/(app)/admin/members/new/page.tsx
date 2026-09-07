import { requireAdmin } from "@/lib/authz";
import { NewMemberForm } from "./new-member-form";

export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add member</h1>
        <p className="text-sm text-muted-foreground">Create a member record manually.</p>
      </div>
      <NewMemberForm />
    </div>
  );
}