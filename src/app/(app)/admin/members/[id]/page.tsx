import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { enrichAssignments } from "@/features/assignments/effective";
import { getFileStorage } from "@/features/files/storage";
import { StatusBadge, TypeBadge, VerificationBadge } from "@/components/features/status-badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AssignCertificationButton, AssignmentActions } from "./member-actions";
import { OcrExtractPanel } from "@/components/features/ocr-extract-panel";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [member, certifications, roster] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            certification: { select: { code: true, name: true, provider: true } },
            member: { select: { id: true, displayName: true, email: true } },
            memberCert: { include: { files: true } },
          },
          orderBy: [{ type: "asc" }, { deadline: "asc" }],
        },
        // Tất cả cert đã đạt (VERIFIED) — kể cả không gắn assignment.
        memberCertifications: {
          where: { verificationStatus: "VERIFIED" },
          include: {
            certification: { select: { code: true, name: true, provider: true } },
            files: true,
          },
          orderBy: { issuedDate: "desc" },
        },
      },
    }),
    prisma.certification.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  if (!member) notFound();

  const enriched = enrichAssignments(member.assignments);
  const required = enriched.filter((a) => a.type === "REQUIRED");
  const recommended = enriched.filter((a) => a.type === "RECOMMENDED");

  // Tỉ lệ hoàn thành assignment (CR: plan completion).
  const totalAssignments = enriched.length;
  const completedAssignments = enriched.filter((a) => a.effectiveStatus === "COMPLETED").length;
  const assignmentCompletionRate = totalAssignments
    ? Math.round((completedAssignments / totalAssignments) * 100)
    : 0;

  const achievedCerts = member.memberCertifications ?? [];

  // Resolve download URLs for certificate files.
  const storage = getFileStorage();
  const fileUrls = new Map<string, string>();
  for (const a of enriched) {
    for (const f of a.memberCert?.files ?? []) {
      if (!fileUrls.has(f.id)) {
        fileUrls.set(f.id, await storage.getDownloadUrl(f.blobUrl));
      }
    }
  }
  for (const mc of achievedCerts) {
    for (const f of mc.files) {
      if (!fileUrls.has(f.id)) {
        fileUrls.set(f.id, await storage.getDownloadUrl(f.blobUrl));
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{member.displayName}</h1>
          <p className="text-sm text-muted-foreground">{member.email}</p>
        </div>
        <AssignCertificationButton
          memberId={member.id}
          certifications={certifications.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        />
      </div>

      <OcrExtractPanel
        adminMode
        targetMemberId={member.id}
        members={roster.map((m) => ({ id: m.id, displayName: m.displayName, email: m.email }))}
        certifications={certifications.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
      />

      {/* Summary: plan completion + achieved certs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan completion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {completedAssignments}
              <span className="text-sm font-normal text-muted-foreground"> / {totalAssignments} assignments</span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-blue-500" style={{ width: `${assignmentCompletionRate}%` }} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{assignmentCompletionRate}% hoàn thành</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certificates achieved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{achievedCerts.length}</p>
            <p className="text-sm text-muted-foreground">chứng chỉ đã VERIFIED</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalAssignments}</p>
            <p className="text-sm text-muted-foreground">
              {required.length} required · {recommended.length} recommended
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Certificates achieved (VERIFIED) — kể cả không gắn assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificates Achieved ({achievedCerts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {achievedCerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có chứng chỉ nào được xác minh (VERIFIED).</p>
          ) : (
            <div className="space-y-3">
              {achievedCerts.map((mc) => (
                <div key={mc.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {mc.certification.code}{" "}
                      <span className="text-muted-foreground">· {mc.certification.name}</span>
                    </div>
                    <VerificationBadge status={mc.verificationStatus} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{mc.certification.provider}</span>
                    {mc.issuedDate && <span>Issued: {mc.issuedDate.toLocaleDateString("en-GB")}</span>}
                    {mc.expirationDate && <span>Expires: {mc.expirationDate.toLocaleDateString("en-GB")}</span>}
                    {mc.certificateNumber && <span>#{mc.certificateNumber}</span>}
                    {mc.holderNameOnCert && <span>Holder: {mc.holderNameOnCert}</span>}
                  </div>
                  {(mc.files ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mc.files.map((f) => (
                        <Button key={f.id} asChild size="sm" variant="outline">
                          <a href={fileUrls.get(f.id)} target="_blank" rel="noreferrer">
                            View certificate ({f.fileName})
                          </a>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Required Certifications</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignmentRows assignments={required} fileUrls={fileUrls} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recommended Certifications</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignmentRows assignments={recommended} fileUrls={fileUrls} />
        </CardContent>
      </Card>
    </div>
  );
}

function AssignmentRows({
  assignments,
  fileUrls,
}: {
  assignments: ReturnType<typeof enrichAssignments>;
  fileUrls: Map<string, string>;
}) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">No assignments.</p>;
  }
  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <div key={a.id} className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {a.certification.code} <span className="text-muted-foreground">· {a.certification.name}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <TypeBadge type={a.type} />
                <StatusBadge status={a.effectiveStatus} />
                {a.deadline && (
                  <span>
                    Deadline:{" "}
                    {a.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
                {a.exemptionReason && <Badge variant="outline">Exempted: {a.exemptionReason}</Badge>}
              </div>
            </div>
            <div className="w-40">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{a.progressPercent}%</span>
              </div>
              <Progress value={a.progressPercent} />
            </div>
          </div>

          {a.memberCert && (
            <div className="mt-3 border-t pt-3 text-sm">
              <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                <span>
                  Learning status: <span className="font-medium">{a.memberCert.status.replace("_", " ")}</span>
                </span>
                <VerificationBadge status={a.memberCert.verificationStatus} />
                {a.memberCert.issuedDate && (
                  <span>Issued: {a.memberCert.issuedDate.toLocaleDateString("en-GB")}</span>
                )}
                {a.memberCert.expirationDate && (
                  <span>Expires: {a.memberCert.expirationDate.toLocaleDateString("en-GB")}</span>
                )}
                {a.memberCert.certificateNumber && <span>#{a.memberCert.certificateNumber}</span>}
              </div>
              {a.memberCert.rejectionReason && (
                <p className="mt-1 text-red-600">Rejected: {a.memberCert.rejectionReason}</p>
              )}
              {(a.memberCert.files ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.memberCert.files?.map((f) => (
                    <Button key={f.id} asChild size="sm" variant="outline">
                      <a href={fileUrls.get(f.id)} target="_blank" rel="noreferrer">
                        View certificate ({f.fileName})
                      </a>
                    </Button>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <AssignmentActions
                  assignmentId={a.id}
                  type={a.type}
                  deadline={a.deadline ? a.deadline.toISOString() : null}
                  effectiveStatus={a.effectiveStatus}
                  memberCertificationId={a.memberCert?.id ?? null}
                  verificationStatus={a.memberCert?.verificationStatus ?? null}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}