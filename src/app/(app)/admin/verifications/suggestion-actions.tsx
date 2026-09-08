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
import {
  approveSuggestion,
  rejectSuggestion,
} from "@/features/suggestions/actions";

export function SuggestionActions({ suggestionId }: { suggestionId: string }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    const res = await approveSuggestion({ suggestionId });
    setBusy(false);
    if (res.ok) toast.success("Suggestion approved → added to catalog");
    else toast.error(res.error);
  }

  async function reject() {
    setBusy(true);
    const res = await rejectSuggestion({ suggestionId, rejectReason: reason || null });
    setBusy(false);
    if (res.ok) {
      toast.success("Suggestion rejected");
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
            <DialogTitle>Reject Suggestion</DialogTitle>
            <DialogDescription>Optionally record why this cert suggestion was declined.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sr">Reason</Label>
            <Textarea id="sr" value={reason} onChange={(e) => setReason(e.target.value)} />
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