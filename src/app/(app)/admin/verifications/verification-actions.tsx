"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { verifyCertificate, rejectCertificate } from "@/features/files/actions";

export function VerifyActions({ memberCertificationId }: { memberCertificationId: string }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    const res = await verifyCertificate({ memberCertificationId });
    setBusy(false);
    if (res.ok) toast.success("Certificate verified");
    else toast.error(res.error);
  }

  async function reject() {
    if (!reason.trim()) return toast.error("Reason is required");
    setBusy(true);
    const res = await rejectCertificate({ memberCertificationId, reason });
    setBusy(false);
    if (res.ok) {
      toast.success("Rejected");
      setRejectOpen(false);
    } else toast.error(res.error);
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" onClick={approve} disabled={busy}>
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={busy}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Certificate</DialogTitle>
            <DialogDescription>The member will see the rejection reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rr">Reason</Label>
            <Textarea id="rr" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={reject} disabled={busy}>
              {busy ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}