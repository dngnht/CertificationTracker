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
import {
  suggestCertifications,
} from "@/features/certifications/actions";
import { suggestCertification } from "@/features/suggestions/actions";
import type { ExtractResult } from "@/features/ocr/extraction";
import { checkHolderMatch } from "@/features/ocr/rules";
import { similarityScore } from "@/features/certifications/similarity";

interface MemberOption {
  id: string;
  displayName: string;
  email: string;
}
interface CertOption {
  id: string;
  code: string;
  name: string;
  provider?: string | null;
}

/** Confidence below this is highlighted as "weak field" (CR-CERT-003). */
const FIELD_CONFIDENCE_THRESHOLD = 0.7;

function fieldWeak(conf?: number): boolean {
  return conf !== undefined && conf < FIELD_CONFIDENCE_THRESHOLD;
}

/**
 * Member gần nhất với tên holder đọc từ cert (dạng suggest). Dùng fuzzy so sánh,
 * trả về member có điểm cao nhất (kể cả dưới ngưỡng — để admin chọn nhanh).
 */
function closestMember(members: MemberOption[], holderName?: string | null): string {
  if (!holderName || members.length === 0) return "";
  let best = "";
  let bestScore = 0;
  for (const m of members) {
    const score = similarityScore(holderName, m.displayName);
    if (score > bestScore) {
      bestScore = score;
      best = m.id;
    }
  }
  return best;
}
interface CertOption {
  id: string;
  code: string;
  name: string;
  provider?: string | null;
}

type Mode = "assign" | "create" | "suggest";

interface EditState {
  mode: Mode;
  certId: string;
  query: string;
  suggestions: CertOption[];
  newCode: string;
  newName: string;
  newProvider: string;
  certNumber: string;
  issuedDate: string;
  expirationDate: string;
  verifyUrl: string;
  memberId: string;
}

const emptyEdit = (): EditState => ({
  mode: "assign",
  certId: "",
  query: "",
  suggestions: [],
  newCode: "",
  newName: "",
  newProvider: "",
  certNumber: "",
  issuedDate: "",
  expirationDate: "",
  verifyUrl: "",
  memberId: "",
});

/** Local-storage blob URL (dev default). Azure uses signed URLs via the server. */
function blobUrl(key: string): string {
  return `/api/files/blob/${encodeURIComponent(key)}`;
}

export function OcrExtractPanel({
  adminMode = false,
  members = [],
  certifications = [],
  targetMemberId,
  currentUserId,
  currentUserName,
}: {
  adminMode?: boolean;
  members?: MemberOption[];
  certifications?: CertOption[];
  targetMemberId?: string;
  currentUserId?: string;
  currentUserName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ExtractResult[]>([]);
  const [blobPaths, setBlobPaths] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<{ auto: number; review: number; failed: number } | null>(null);
  const [editState, setEditState] = useState<Record<string, EditState>>({});

  const setEdit = (id: string, patch: Partial<EditState>) =>
    setEditState((s) => ({ ...s, [id]: { ...(s[id] ?? emptyEdit()), ...patch } }));

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setResults([]);
    setBlobPaths({});
    setEditState({});
    setSummary(null);
    try {
      const files: { certificateFileId: string; blobPath: string }[] = [];
      const paths: Record<string, string> = {};
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
          paths[complete.data.certificateFileId] = complete.data.blobPath;
        }
      }

      if (files.length === 0) {
        toast.error("No images were uploaded successfully.");
        return;
      }

      const res = await extractCertificatesBatch({
        files,
        // Admin không chỉ định member trước upload — để OCR resolve/suggest member.
        targetMemberId: adminMode ? undefined : (targetMemberId ?? undefined),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const list = res.data ?? [];
      setResults(list);
      setBlobPaths(paths);
      setEditState(
        Object.fromEntries(
          list.map((r) => [
            r.certificateFileId,
            {
              ...emptyEdit(),
              // CR-CERT-003: attributed member defaults to the server-resolved OCR
              // match (hoặc member gần nhất). Admin override qua listbox khi low confidence.
              memberId: adminMode
                ? (r.match.memberId || closestMember(members, r.match.memberName) || "")
                : (currentUserId ?? r.match.memberId ?? ""),
              certNumber: r.certificate.certificateNumber ?? "",
              issuedDate: r.certificate.issuedDate ? r.certificate.issuedDate.slice(0, 10) : "",
              expirationDate: r.certificate.expirationDate ? r.certificate.expirationDate.slice(0, 10) : "",
            },
          ])
        )
      );
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

  async function runSuggest(r: ExtractResult, query: string) {
    if (!query.trim()) return;
    const res = await suggestCertifications({ query, limit: 5 });
    if (res.ok) setEdit(r.certificateFileId, { suggestions: res.data ?? [] });
  }

  async function saveReviewed(r: ExtractResult) {
    const edit = editState[r.certificateFileId];
    if (!edit) return;

    // Suggest path (regular user proposing a new cert) — no MemberCertification yet.
    if (edit.mode === "suggest") {
      if (!edit.newCode || !edit.newName) return toast.error("Nhập mã và tên cert.");
      const res = await suggestCertification({
        code: edit.newCode || null,
        name: edit.newName,
        provider: edit.newProvider || null,
      });
      if (res.ok) toast.success("Đã gửi đề xuất cert mới chờ admin duyệt.");
      else toast.error(res.error);
      return;
    }

    // Create path (admin only) — create cert then submit.
    if (edit.mode === "create") {
      if (!edit.newCode || !edit.newName) return toast.error("Nhập mã và tên cert.");
      const res = await createMemberCertificationFromExtraction({
        certificateFileId: r.certificateFileId,
        memberId: adminMode
          ? (edit.memberId || closestMember(members, r.match.memberName) || targetMemberId || "")
          : (targetMemberId ?? currentUserId ?? r.match.memberId ?? ""),
        newCert: {
          code: edit.newCode,
          name: edit.newName,
          provider: edit.newProvider || null,
        },
        certificate: {
          certificateNumber: edit.certNumber || null,
          issuedDate: edit.issuedDate ? new Date(edit.issuedDate).toISOString() : null,
          expirationDate: edit.expirationDate ? new Date(edit.expirationDate).toISOString() : null,
          verifyUrl: edit.verifyUrl || null,
        },
        confidence: r.confidence.overall,
        holderNameOnCert: r.match.memberName ?? null,
      });
      if (res.ok) toast.success("Đã tạo cert mới và lưu pending.");
      else toast.error(res.error);
      return;
    }

    // Assign path.
    const certId = edit.certId || r.match.certificationId || "";
    if (!certId) return toast.error("Chọn cert cần gán (hoặc chọn tạo mới).");

    const result = await createMemberCertificationFromExtraction({
      certificateFileId: r.certificateFileId,
      certificationId: certId,
      memberId: adminMode
        ? (edit.memberId || closestMember(members, r.match.memberName) || targetMemberId || "")
        : (targetMemberId ?? currentUserId ?? r.match.memberId ?? ""),
      certificate: {
        certificateNumber: edit.certNumber || null,
        issuedDate: edit.issuedDate ? new Date(edit.issuedDate).toISOString() : null,
        expirationDate: edit.expirationDate ? new Date(edit.expirationDate).toISOString() : null,
        verifyUrl: edit.verifyUrl || null,
      },
      confidence: r.confidence.overall,
      holderNameOnCert: r.match.memberName ?? null,
    });
    if (result.ok) toast.success("Đã lưu pending chờ verify.");
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
          Upload certificate image(s). The system extracts the fields and shows a review form —
          nothing is saved until you confirm. OCR never auto-approves.
        </p>

        {adminMode && (
          <p className="text-xs text-muted-foreground">
            Member sẽ được gợi ý từ kết quả OCR. Nếu confidence thấp, bạn có thể chọn lại member.
          </p>
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
            <Badge variant="success">{summary.auto} ready to review</Badge>
            <Badge variant="warning">{summary.review} low confidence</Badge>
            {summary.failed > 0 && <Badge variant="destructive">{summary.failed} failed</Badge>}
          </div>
        )}

        {results.map((r) => {
          const edit = editState[r.certificateFileId] ?? emptyEdit();
          const lowConfidence = r.needsReview || r.confidence.overall < 0.7;
          const imgSrc = blobPaths[r.certificateFileId] ? blobUrl(blobPaths[r.certificateFileId]) : null;
          const matchedCert = certifications.find((c) => c.id === edit.certId);

          // CR-CERT-003: attributed member (per-result, admin overridable) + mismatch verdict.
          const attributedMemberName = adminMode
            ? (members.find((m) => m.id === edit.memberId)?.displayName ?? "")
            : (currentUserName ?? "");
          const holderMatch = checkHolderMatch(r.match.memberName, attributedMemberName || null);
          // Chỉ hiện listbox chọn member khi confidence thấp (hoặc chưa resolve được member).
          const showMemberPicker = adminMode && (lowConfidence || !edit.memberId);

          return (
            <div key={r.certificateFileId} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {matchedCert ? `${matchedCert.code} · ${matchedCert.name}` : (r.match.certificationCode ?? "Unknown certification")}
                </span>
                <Badge variant={lowConfidence ? "warning" : "success"}>
                  {lowConfidence ? "Low confidence — review" : "Ready to save"}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Left: original image */}
                <div>
                  {imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgSrc} alt="Original certificate" className="max-h-64 w-full rounded-md border object-contain" />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
                      No image
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>Confidence:</span>
                    <Badge variant={r.confidence.overall >= 0.7 ? "success" : "warning"}>
                      {Math.round(r.confidence.overall * 100)}%
                    </Badge>
                    {r.warnings.map((w, i) => (
                      <span key={i} className="text-amber-600">{w}</span>
                    ))}
                  </div>
                </div>

                {/* Right: editable fields */}
                <div className="space-y-3">
                  {/* CR-CERT-003: NGƯỜI ĐẠT CHỨNG CHỈ (HOLDER) — đặt trên Master data */}
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Người đạt chứng chỉ (Holder)
                    </p>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Tên trên chứng chỉ (OCR):</span>{" "}
                        <span className={fieldWeak(r.fieldConfidence?.memberName) ? "font-medium text-amber-600" : "font-medium"}>
                          {r.match.memberName ?? "—"}
                        </span>
                        {r.fieldConfidence?.memberName != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            [conf {Math.round(r.fieldConfidence.memberName * 100)}%]
                          </span>
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Gán cho member:</span>{" "}
                        {showMemberPicker ? (
                          <Select
                            value={edit.memberId}
                            onValueChange={(v) => setEdit(r.certificateFileId, { memberId: v })}
                          >
                            <SelectTrigger className="mt-1 w-full">
                              <SelectValue placeholder="Chọn member…" />
                            </SelectTrigger>
                            <SelectContent>
                              {members.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.displayName} — {m.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="font-medium">{attributedMemberName || "—"}</span>
                        )}
                      </p>
                      {holderMatch.warn && (
                        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                          ⚠️ Tên trên cert ({r.match.memberName}) khác với member được gán ({attributedMemberName}) — kiểm tra lại.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Master data (read-only when bound) */}
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Master data
                    </p>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-muted-foreground">Code (OCR):</span>{" "}
                        <span className={fieldWeak(r.fieldConfidence?.certificationCode) ? "font-medium text-amber-600" : "font-medium"}>
                          {r.match.certificationCode ?? "—"}
                        </span>
                        {r.fieldConfidence?.certificationCode != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            [conf {Math.round(r.fieldConfidence.certificationCode * 100)}%]
                          </span>
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Name (OCR):</span>{" "}
                        <span className={fieldWeak(r.fieldConfidence?.certificationName) ? "font-medium text-amber-600" : "font-medium"}>
                          {r.match.certificationName ?? "—"}
                        </span>
                        {r.fieldConfidence?.certificationName != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            [conf {Math.round(r.fieldConfidence.certificationName * 100)}%]
                          </span>
                        )}
                      </p>
                      {matchedCert ? (
                        <div className="space-y-1 border-t pt-1">
                          <p><span className="text-muted-foreground">Code (danh mục):</span> {matchedCert.code}</p>
                          <p><span className="text-muted-foreground">Name (danh mục):</span> {matchedCert.name}</p>
                          <p><span className="text-muted-foreground">Provider:</span> {matchedCert.provider ?? "—"}</p>
                          <p className="text-xs text-emerald-600">Read-only — lấy từ danh mục cert chuẩn.</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Chưa gán cert. Chọn một lựa chọn bên dưới.</p>
                      )}
                    </div>
                  </div>

                  {/* Instance data */}
                  <div className={`rounded-md border p-3 ${lowConfidence ? "border-amber-400 bg-amber-50/40" : ""}`}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Instance data
                    </p>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">
                          Credential ID (số hiệu chứng chỉ)
                          {r.fieldConfidence?.certificateNumber != null && (
                            <span className={fieldWeak(r.fieldConfidence.certificateNumber) ? "ml-2 text-amber-600" : "ml-2 text-muted-foreground"}>
                              [conf {Math.round(r.fieldConfidence.certificateNumber * 100)}%]
                            </span>
                          )}
                        </Label>
                        <Input
                          className={fieldWeak(r.fieldConfidence?.certificateNumber) ? "border-amber-400" : ""}
                          value={edit.certNumber}
                          placeholder={r.certificate.certificateNumber ?? "VD: AZ204-123456"}
                          onChange={(e) => setEdit(r.certificateFileId, { certNumber: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">
                            Issue date
                            {r.fieldConfidence?.issueDate != null && (
                              <span className={fieldWeak(r.fieldConfidence.issueDate) ? "ml-2 text-amber-600" : "ml-2 text-muted-foreground"}>
                                [conf {Math.round(r.fieldConfidence.issueDate * 100)}%]
                              </span>
                            )}
                          </Label>
                          <Input
                            className={fieldWeak(r.fieldConfidence?.issueDate) ? "border-amber-400" : ""}
                            type="date"
                            value={edit.issuedDate}
                            onChange={(e) => setEdit(r.certificateFileId, { issuedDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">
                            Expiry date
                            {r.fieldConfidence?.expirationDate != null && (
                              <span className={fieldWeak(r.fieldConfidence.expirationDate) ? "ml-2 text-amber-600" : "ml-2 text-muted-foreground"}>
                                [conf {Math.round(r.fieldConfidence.expirationDate * 100)}%]
                              </span>
                            )}
                          </Label>
                          <Input
                            className={fieldWeak(r.fieldConfidence?.expirationDate) ? "border-amber-400" : ""}
                            type="date"
                            value={edit.expirationDate}
                            onChange={(e) => setEdit(r.certificateFileId, { expirationDate: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Verify URL (link tra cứu công khai)</Label>
                        <Input
                          value={edit.verifyUrl}
                          placeholder="https://www.credly.com/badges/..."
                          onChange={(e) => setEdit(r.certificateFileId, { verifyUrl: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Catalog resolution choices */}
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cert trong danh mục
                    </p>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={edit.mode === "assign"}
                          onChange={() => setEdit(r.certificateFileId, { mode: "assign" })}
                        />
                        Gán vào cert đã có
                      </label>
                      {edit.mode === "assign" && (
                        <div className="space-y-2 pl-6">
                          <div className="flex gap-2">
                            <Input
                              value={edit.query}
                              placeholder="Tìm cert (fuzzy)..."
                              onChange={(e) => setEdit(r.certificateFileId, { query: e.target.value })}
                            />
                            <Button size="sm" variant="outline" onClick={() => runSuggest(r, edit.query)}>
                              Search
                            </Button>
                          </div>
                          {edit.suggestions.length > 0 && (
                            <Select
                              value={edit.certId}
                              onValueChange={(v) => setEdit(r.certificateFileId, { certId: v })}
                            >
                              <SelectTrigger><SelectValue placeholder="Chọn cert" /></SelectTrigger>
                              <SelectContent>
                                {edit.suggestions.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {!edit.certId && r.match.certificationId && (
                            <Button size="sm" variant="ghost" onClick={() => setEdit(r.certificateFileId, { certId: r.match.certificationId! })}>
                              Dùng kết quả OCR: {r.match.certificationCode}
                            </Button>
                          )}
                        </div>
                      )}

                      {adminMode && (
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={edit.mode === "create"}
                            onChange={() => setEdit(r.certificateFileId, { mode: "create" })}
                          />
                          Tạo cert mới vào danh mục (admin)
                        </label>
                      )}
                      {!adminMode && (
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={edit.mode === "suggest"}
                            onChange={() => setEdit(r.certificateFileId, { mode: "suggest" })}
                          />
                          Đề xuất cert mới chờ duyệt
                        </label>
                      )}

                      {(edit.mode === "create" || edit.mode === "suggest") && (
                        <div className="space-y-2 pl-6">
                          <Input
                            value={edit.newCode}
                            placeholder="Mã cert (VD: AWS-SAA-C03)"
                            onChange={(e) => setEdit(r.certificateFileId, { newCode: e.target.value })}
                          />
                          <Input
                            value={edit.newName}
                            placeholder="Tên cert"
                            onChange={(e) => setEdit(r.certificateFileId, { newName: e.target.value })}
                          />
                          <Input
                            value={edit.newProvider}
                            placeholder="Nhà cấp (issuer)"
                            onChange={(e) => setEdit(r.certificateFileId, { newProvider: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <Button size="sm" onClick={() => saveReviewed(r)}>
                    {edit.mode === "suggest" ? "Gửi đề xuất" : "Save as Pending"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}