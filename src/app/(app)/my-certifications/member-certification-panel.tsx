"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  updateOwnProgress,
  updateCertificateInfo,
} from "@/features/progress/actions";
import {
  prepareCertificateUpload,
  completeCertificateUpload,
  deleteCertificate,
} from "@/features/files/actions";

interface PanelProps {
  memberCertificationId: string;
  status: string;
  progressPercent: number;
  targetExamDate: string | null;
  issuedDate: string | null;
  expirationDate: string | null;
  certificateNumber: string | null;
  verificationStatus: string;
  files: { id: string; fileName: string; contentType: string; url: string }[];
}

const STATUS_OPTIONS = ["PLANNED", "LEARNING", "EXAM_SCHEDULED", "CERTIFIED", "FAILED"];

export function MemberCertificationPanel(props: PanelProps) {
  const [status, setStatus] = useState(props.status);
  const [progress, setProgress] = useState(props.progressPercent);
  const [examDate, setExamDate] = useState(props.targetExamDate ? props.targetExamDate.slice(0, 10) : "");
  const [issuedDate, setIssuedDate] = useState(props.issuedDate ? props.issuedDate.slice(0, 10) : "");
  const [expirationDate, setExpirationDate] = useState(props.expirationDate ? props.expirationDate.slice(0, 10) : "");
  const [certNumber, setCertNumber] = useState(props.certificateNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveProgress() {
    setBusy(true);
    const result = await updateOwnProgress({
      memberCertificationId: props.memberCertificationId,
      status,
      progressPercent: progress,
      targetExamDate: examDate ? new Date(examDate).toISOString() : null,
    });
    setBusy(false);
    if (result.ok) toast.success("Progress updated");
    else toast.error(result.error);
  }

  async function saveCertificateInfo() {
    setBusy(true);
    const result = await updateCertificateInfo({
      memberCertificationId: props.memberCertificationId,
      issuedDate: issuedDate ? new Date(issuedDate).toISOString() : null,
      expirationDate: expirationDate ? new Date(expirationDate).toISOString() : null,
      certificateNumber: certNumber || null,
    });
    setBusy(false);
    if (result.ok) toast.success("Certificate info saved");
    else toast.error(result.error);
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const prep = await prepareCertificateUpload({
        memberCertificationId: props.memberCertificationId,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!prep.ok) {
        toast.error(prep.error);
        return;
      }
      const { key, descriptor } = prep.data!;

      if (descriptor.method === "PUT") {
        await fetch(descriptor.url, {
          method: "PUT",
          headers: { ...descriptor.headers },
          body: file,
        });
      } else {
        const fd = new FormData();
        fd.append("key", key);
        fd.append("file", file);
        await fetch(descriptor.url, { method: "POST", body: fd });
      }

      const complete = await completeCertificateUpload({
        memberCertificationId: props.memberCertificationId,
        key,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (complete.ok) toast.success("Certificate uploaded for verification");
      else toast.error(complete.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeFile(fileId: string) {
    const result = await deleteCertificate(fileId);
    if (result.ok) toast.success("File deleted");
    else toast.error(result.error);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="progress">Progress (%)</Label>
          <Input
            id="progress"
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value))))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exam">Target Exam Date</Label>
          <Input id="exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
      </div>
      <Button onClick={saveProgress} disabled={busy} size="sm">
        {busy ? "Saving..." : "Save Progress"}
      </Button>

      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">Certificate Information</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="issued">Issued Date</Label>
            <Input id="issued" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires">Expiration Date</Label>
            <Input id="expires" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="certnum">Certificate Number</Label>
            <Input id="certnum" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
          </div>
        </div>
        <Button onClick={saveCertificateInfo} disabled={busy} size="sm" className="mt-3" variant="outline">
          Save Certificate Info
        </Button>
      </div>

      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">Certificate File</p>
        <div className="flex flex-wrap gap-2">
          {props.files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <a href={f.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {f.fileName}
              </a>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(f.id)} aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={uploading || props.verificationStatus === "VERIFIED"}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload Certificate"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          PDF, JPG, PNG up to 10 MB. Once uploaded it will be reviewed by an admin.
        </p>
      </div>
    </div>
  );
}