import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { CertificationForm } from "./certification-form";
import { CertificationTable } from "./certification-table";
import { ImportCertificationsDialog } from "./import-certifications-dialog";

export const dynamic = "force-dynamic";

export default async function CertificationsPage() {
  await requireAdmin();
  const certifications = await prisma.certification.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Certifications</h1>
          <p className="text-sm text-muted-foreground">Manage the certification catalog.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportCertificationsDialog />
          <CertificationForm />
        </div>
      </div>
      <CertificationTable certifications={certifications} />
    </div>
  );
}