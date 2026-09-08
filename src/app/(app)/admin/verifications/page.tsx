import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getFileStorage } from "@/features/files/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerifyActions } from "./verification-actions";
import { SuggestionActions } from "./suggestion-actions";

export const dynamic = "force-dynamic";

export default async function VerificationsPage() {
  await requireAdmin();

  const pending = await prisma.memberCertification.findMany({
    where: { verificationStatus: "PENDING" },
    include: {
      member: { select: { id: true, displayName: true, email: true } },
      certification: { select: { code: true, name: true, provider: true } },
      files: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  const storage = getFileStorage();
  const fileUrls = new Map<string, string>();
  for (const mc of pending) {
    for (const f of mc.files) {
      if (!fileUrls.has(f.id)) fileUrls.set(f.id, await storage.getDownloadUrl(f.blobUrl));
    }
  }

  const suggestions = await prisma.certificationSuggestion.findMany({
    where: { status: "PENDING" },
    include: { suggestedBy: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pending Verifications</h1>
        <p className="text-sm text-muted-foreground">
          Review the original image beside the extracted data, then approve or reject.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No certificates awaiting verification.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((mc) => {
            const file = mc.files[0];
            return (
              <Card key={mc.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>
                      {mc.certification.code} <span className="font-normal text-muted-foreground">· {mc.certification.name}</span>
                    </span>
                    <Badge variant="warning">PENDING</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      {file && fileUrls.get(file.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fileUrls.get(file.id)}
                          alt={file.fileName}
                          className="max-h-64 w-full rounded-md border object-contain"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
                          No image uploaded
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Member:</span> {mc.member.displayName} ({mc.member.email})
                      </p>
                      {mc.holderNameOnCert && (
                        <p>
                          <span className="text-muted-foreground">Tên trên cert (OCR):</span> {mc.holderNameOnCert}
                          {mc.holderNameMatched === false && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                              ⚠️ khác với member được gán
                            </span>
                          )}
                        </p>
                      )}
                      <p>
                        <span className="text-muted-foreground">Provider:</span> {mc.certification.provider}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Credential ID:</span> {mc.certificateNumber ?? "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Verify URL:</span>{" "}
                        {mc.verifyUrl ? (
                          <a href={mc.verifyUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                            {mc.verifyUrl}
                          </a>
                        ) : (
                          "—"
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Issued:</span> {mc.issuedDate ? mc.issuedDate.toLocaleDateString("en-GB") : "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Expires:</span> {mc.expirationDate ? mc.expirationDate.toLocaleDateString("en-GB") : "—"}
                      </p>
                      {mc.extractionConfidence != null && (
                        <p>
                          <span className="text-muted-foreground">OCR confidence:</span>{" "}
                          {Math.round(mc.extractionConfidence * 100)}%
                        </p>
                      )}
                      <div className="pt-2">
                        <VerifyActions memberCertificationId={mc.id} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-xl font-semibold">Pending Cert Suggestions</h2>
        {suggestions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No cert suggestions awaiting review.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="text-sm">
                    <p className="font-medium">{s.code} · {s.name}</p>
                    <p className="text-muted-foreground">
                      Provider: {s.provider ?? "—"} · Suggested by {s.suggestedBy.displayName} ({s.suggestedBy.email})
                    </p>
                  </div>
                  <SuggestionActions suggestionId={s.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}