"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Plus, ShieldAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkAssignCertification, updateAssignment, exemptAssignment } from "@/features/assignments/actions";
import { verifyCertificate, rejectCertificate } from "@/features/files/actions";
import { sendReminders } from "@/features/reminders/actions";

interface CertificationOption {
  id: string;
  code: string;
  name: string;
}

export function AssignCertificationButton({
  memberId,
  certifications,
}: {
  memberId: string;
  certifications: CertificationOption[];
}) {
  const [open, setOpen] = useState(false);
  const [certificationId, setCertificationId] = useState("");
  const [type, setType] = useState<"REQUIRED" | "RECOMMENDED">("REQUIRED");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!certificationId) return toast.error("Select a certification");
    setBusy(true);
    const result = await bulkAssignCertification({
      certificationId,
      memberIds: [memberId],
      type,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setBusy(false);
    if (result.ok) {
      toast.success("Assigned");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Assign Certification
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Certification</DialogTitle>
          <DialogDescription>Create an assignment for this member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Certification</Label>
            <Select value={certificationId} onValueChange={setCertificationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {certifications.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "REQUIRED" | "RECOMMENDED")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REQUIRED">Required</SelectItem>
                <SelectItem value="RECOMMENDED">Recommended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AssignmentActionsProps {
  assignmentId: string;
  type: "REQUIRED" | "RECOMMENDED";
  deadline: string | null;
  effectiveStatus: string;
  memberCertificationId: string | null;
  verificationStatus: string | null;
}

export function AssignmentActions(props: AssignmentActionsProps) {
  const { assignmentId, effectiveStatus, memberCertificationId, verificationStatus } = props;

  const canVerify =
    memberCertificationId && verificationStatus === "PENDING";
  const canReject = memberCertificationId && verificationStatus === "PENDING";

  return (
    <div className="flex flex-wrap gap-1.5">
      <EditAssignmentDialog {...props} />
      <ExemptDialog assignmentId={assignmentId} />
      {canVerify && (
        <Button size="sm" variant="outline" onClick={() => runVerify(memberCertificationId!)}>
          <Check className="h-4 w-4" /> Verify
        </Button>
      )}
      {canReject && <RejectDialog memberCertificationId={memberCertificationId!} />}
      <Button
        size="sm"
        variant="outline"
        onClick={() => runReminder([assignmentId])}
        disabled={effectiveStatus === "COMPLETED" || effectiveStatus === "EXEMPTED"}
      >
        <Bell className="h-4 w-4" /> Remind
      </Button>
    </div>
  );
}

function EditAssignmentDialog({
  assignmentId,
  type,
  deadline,
}: {
  assignmentId: string;
  type: "REQUIRED" | "RECOMMENDED";
  deadline: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [newType, setNewType] = useState(type);
  const [newDeadline, setNewDeadline] = useState(deadline ? deadline.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await updateAssignment({
      assignmentId,
      type: newType,
      deadline: newDeadline ? new Date(newDeadline).toISOString() : null,
    });
    setBusy(false);
    if (result.ok) {
      toast.success("Updated");
      setOpen(false);
    } else toast.error(result.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as "REQUIRED" | "RECOMMENDED")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REQUIRED">Required</SelectItem>
                <SelectItem value="RECOMMENDED">Recommended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dl">Deadline</Label>
            <Input id="dl" type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExemptDialog({ assignmentId }: { assignmentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return toast.error("Reason is required");
    setBusy(true);
    const result = await exemptAssignment({ assignmentId, reason });
    setBusy(false);
    if (result.ok) {
      toast.success("Exempted");
      setOpen(false);
    } else toast.error(result.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ShieldAlert className="h-4 w-4" /> Exempt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exempt Assignment</DialogTitle>
          <DialogDescription>Exempted assignments do not count against compliance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Role no longer requires this certification" />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving..." : "Exempt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ memberCertificationId }: { memberCertificationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return toast.error("Reason is required");
    setBusy(true);
    const result = await rejectCertificate({ memberCertificationId, reason });
    setBusy(false);
    if (result.ok) {
      toast.success("Rejected");
      setOpen(false);
    } else toast.error(result.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <X className="h-4 w-4" /> Reject
        </Button>
      </DialogTrigger>
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
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Rejecting..." : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function runVerify(memberCertificationId: string) {
  const result = await verifyCertificate({ memberCertificationId });
  if (result.ok) toast.success("Certificate verified");
  else toast.error(result.error);
}

async function runReminder(assignmentIds: string[]) {
  const result = await sendReminders({ assignmentIds });
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.data?.sent) toast.success(`Reminder sent to ${result.data.sent} assignment(s)`);
  if (result.data?.blocked) toast.warning(`${result.data.blocked} blocked (within 24h cooldown)`);
}

export { runReminder };