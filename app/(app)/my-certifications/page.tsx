import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getFileStorage } from "@/features/files/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VerificationBadge } from "@/components/status-badge";
import { MemberCertificationPanel } from "./member-certification-panel";
import { OcrExtractPanel } from "@/components/ocr-extract-panel";

export const dynamic = "force-dynamic";

const CERT_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  LEARNING: "Learning",
  EXAM_SCHEDULED: "Exam Scheduled",
  CERTIFIED: "Certified",
  FAILED: "Failed",
};

export default async function MyCertificationsPage() {
  const user = await requireSession();

  const memberCerts = await prisma.memberCertification.findMany({
    where: { memberId: user.id },
    include: {
      certification: { select: { code: true, name: true, provider: true } },
      files: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const storage = getFileStorage();
  const fileUrls = new Map<string, string>();
  for (const mc of memberCerts) {
    for (const f of mc.files) {
      if (!fileUrls.has(f.id)) fileUrls.set(f.id, await storage.getDownloadUrl(f.blobUrl));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Certifications</h1>
        <p className="text-sm text-muted-foreground">
          Track your learning progress and upload certificates for verification.
        </p>
      </div>

      <OcrExtractPanel />

      {memberCerts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No certifications assigned yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {memberCerts.map((mc) => (
            <Card key={mc.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {mc.certification.code}{" "}
                      <span className="font-normal text-muted-foreground">· {mc.certification.name}</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{mc.certification.provider}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{CERT_STATUS_LABELS[mc.status]}</Badge>
                    <VerificationBadge status={mc.verificationStatus} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{mc.progressPercent}%</span>
                  </div>
                  <Progress value={mc.progressPercent} />
                </div>

                {mc.rejectionReason && (
                  <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                    Certificate rejected: {mc.rejectionReason}
                  </p>
                )}

                <MemberCertificationPanel
                  memberCertificationId={mc.id}
                  status={mc.status}
                  progressPercent={mc.progressPercent}
                  targetExamDate={mc.targetExamDate ? mc.targetExamDate.toISOString() : null}
                  issuedDate={mc.issuedDate ? mc.issuedDate.toISOString() : null}
                  expirationDate={mc.expirationDate ? mc.expirationDate.toISOString() : null}
                  certificateNumber={mc.certificateNumber}
                  verificationStatus={mc.verificationStatus}
                  files={mc.files.map((f) => ({
                    id: f.id,
                    fileName: f.fileName,
                    contentType: f.contentType,
                    url: fileUrls.get(f.id) ?? "",
                  }))}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}