import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AssignForm } from "./assign-form";

export const dynamic = "force-dynamic";

export default async function CertificationPlanPage() {
  await requireAdmin();

  const [certifications, members, existingAssignments] = await Promise.all([
    prisma.certification.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.certificationAssignment.findMany({
      select: { memberId: true, certificationId: true },
    }),
  ]);

  const assignedKeys = new Set(
    existingAssignments.map((a) => `${a.memberId}:${a.certificationId}`)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Certification Plan</h1>
        <p className="text-sm text-muted-foreground">
          Assign a certification to one or more members (Required or Recommended).
        </p>
      </div>
      <AssignForm
        certifications={certifications}
        members={members}
        assignedKeys={assignedKeys}
      />
    </div>
  );
}