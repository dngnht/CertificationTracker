"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ScanLine, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  prepareOcrImageUpload,
  completeOcrImageUpload,
} from "@/features/ocr/upload";
import {
  extractCertificatesBatch,
  createMemberCertificationFromExtraction,
} from "@/features/ocr/actions";
import type { ExtractResult } from "@/features/ocr/extraction";

interface MemberOption {
  id: string;
  displayName: string;
  email: string;
}
interface CertOption {
  id: string;
  code: string;
  name: string;
}

export function OcrExtractPanel({
  adminMode = false,
  members = [],
  certifications = [],
  targetMemberId,
}: {
  adminMode?: boolean;
  members?: MemberOption[];
  certifications?: CertOption[];
  targetMemberId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ExtractResult[]>([]);
  const [summary, setSummary] = useState<{ auto: number; review: number; failed: number } | null>(null);
  const [selectedMember, setSelectedMember] = useState(targetMemberId ?? "");
  const [editState, setEditState] = useState<Record<string, { certId: string; memberId: string }>>({});

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setResults([]);
    setSummary(null);
    try {
      const files: { certificateFileId: string; blobPath: string }[] = [];
      for (const file of Array.from(fileList)) {
        const prep = await prepareOcrImageUpload({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });
        if (!prep.ok) {
          toast.error(`${file.name}: ${prep.error}`);
          continue;
        }
        const { key, descriptor } = prep.data!;
        if (descriptor.method === "PUT") {
          await fetch(descriptor.url, { method: "PUT", headers: { ...descriptor.headers }, body: file });
        } else {
          const fd = new FormData();
          fd.append("key", key);
          fd.append("file", file);
          await fetch(descriptor.url, { method: "POST", body: fd });
        }
        const complete = await completeOcrImageUpload({
          key,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });
        if (!complete.ok) {
          toast.error(`${file.name}: ${complete.error}`);
          continue;
        }
        if (complete.data) {
          files.push(complete.data);
        }
      }

      if (files.length === 0) {
        toast.error("No images were uploaded successfully.");
        return;
      }

      const res = await extractCertificatesBatch({
        files,
        targetMemberId: adminMode && selectedMember ? selectedMember : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const list = res.data ?? [];
      setResults(list);
      setSummary({
        auto: list.filter((r) => !r.needsReview).length,
        review: list.filter((r) => r.needsReview).length,
        failed: list.filter((r) => r.warnings.length > 0 && r.confidence.overall === 0).length,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveReviewed(r: ExtractResult) {
    const edit = editState[r.certificateFileId];
    const certId = edit?.certId ?? r.match.certificationId ?? "";
    const memberId = adminMode ? (edit?.memberId ?? r.match.memberId ?? "") : "";
    if (!certId) return toast.error("Select a certification");
    if (adminMode && !memberId) return toast.error("Select a member");

    const result = await createMemberCertificationFromExtraction({
      certificateFileId: r.certificateFileId,
      certificationId: certId,
      memberId: adminMode ? memberId : r.match.memberId ?? targetMemberId ?? "",
      certificate: {
        certificateNumber: r.certificate.certificateNumber,
        issuedDate: r.certificate.issuedDate ? new Date(r.certificate.issuedDate).toISOString() : null,
        expirationDate: r.certificate.expirationDate ? new Date(r.certificate.expirationDate).toISOString() : null,
      },
      confidence: r.confidence.overall,
    });
    if (result.ok) toast.success("Saved as pending for verification");
    else toast.error(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLine className="h-4 w-4" /> Extract from Image
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload certificate image(s). The system extracts the fields automatically and saves a
          PENDING record for admin verification. OCR never auto-approves.
        </p>

        {adminMode && (
          <div className="space-y-2">
            <Label>Member (for this upload)</Label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName} — {m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" />
          {busy ? "Processing..." : "Upload image(s) to extract"}
        </Button>

        {summary && (
          <div className="flex gap-2 text-sm">
            <Badge variant="success">{summary.auto} auto-saved</Badge>
            <Badge variant="warning">{summary.review} need review</Badge>
            {summary.failed > 0 && <Badge variant="destructive">{summary.failed} failed</Badge>}
          </div>
        )}

        {results.map((r) => (
          <div key={r.certificateFileId} className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">
                {r.match.certificationCode ?? "Unknown certification"}
              </span>
              <Badge variant={r.needsReview ? "warning" : "success"}>
                {r.needsReview ? "Needs review" : "Saved as pending"}
              </Badge>
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <span>Member: {r.match.memberName ?? r.match.memberEmail ?? "—"}</span>
              <span>Cert #: {r.certificate.certificateNumber ?? "—"}</span>
              <span>Issued: {r.certificate.issuedDate ?? "—"}</span>
              <span>Expires: {r.certificate.expirationDate ?? "—"}</span>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs">
              <span>Confidence:</span>
              <Badge variant={r.confidence.overall >= 0.75 ? "success" : "warning"}>
                {Math.round(r.confidence.overall * 100)}%
              </Badge>
              {r.warnings.map((w, i) => (
                <span key={i} className="text-amber-600">{w}</span>
              ))}
            </div>

            {r.needsReview && (
              <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Certification</Label>
                    <Select
                      value={editState[r.certificateFileId]?.certId ?? r.match.certificationId ?? ""}
                      onValueChange={(v) =>
                        setEditState((s) => ({ ...s, [r.certificateFileId]: { ...(s[r.certificateFileId] ?? {}), certId: v } }))
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Pick a certification" /></SelectTrigger>
                      <SelectContent>
                        {certifications.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {adminMode && (
                    <div className="space-y-1">
                      <Label className="text-xs">Member</Label>
                      <Select
                        value={editState[r.certificateFileId]?.memberId ?? r.match.memberId ?? ""}
                        onValueChange={(v) =>
                          setEditState((s) => ({ ...s, [r.certificateFileId]: { ...(s[r.certificateFileId] ?? {}), memberId: v } }))
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button size="sm" onClick={() => saveReviewed(r)}>
                  Save as Pending
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}