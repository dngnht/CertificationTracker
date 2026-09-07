"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkAssignCertification } from "@/features/assignments/actions";

interface Certification {
  id: string;
  code: string;
  name: string;
  provider: string;
}
interface Member {
  id: string;
  displayName: string;
  email: string;
}

export function AssignForm({
  certifications,
  members,
  assignedKeys,
}: {
  certifications: Certification[];
  members: Member[];
  assignedKeys: Set<string>;
}) {
  const [certificationId, setCertificationId] = useState("");
  const [type, setType] = useState<"REQUIRED" | "RECOMMENDED">("REQUIRED");
  const [deadline, setDeadline] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const selectedCert = certifications.find((c) => c.id === certificationId);

  const eligibleMembers = members.map((m) => ({
    ...m,
    alreadyAssigned: selectedCert ? assignedKeys.has(`${m.id}:${selectedCert.id}`) : false,
  }));

  function toggleMember(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllEligible() {
    const ids = eligibleMembers.filter((m) => !m.alreadyAssigned).map((m) => m.id);
    setSelected(new Set(ids));
  }

  async function handleSubmit() {
    if (!certificationId) return toast.error("Select a certification");
    if (selected.size === 0) return toast.error("Select at least one member");
    setBusy(true);
    const result = await bulkAssignCertification({
      certificationId,
      memberIds: [...selected],
      type,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data) {
      toast.success(
        `Created ${result.data.created} assignment(s)${result.data.skipped ? `, skipped ${result.data.skipped} duplicate(s)` : ""}`
      );
      setSelected(new Set());
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Certification</Label>
            <Select value={certificationId} onValueChange={setCertificationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a certification" />
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
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} disabled={busy} className="w-full">
            {busy ? "Assigning..." : `Assign to ${selected.size} member(s)`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Members</CardTitle>
          <Button variant="outline" size="sm" onClick={selectAllEligible}>
            Select all eligible
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {eligibleMembers.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={selected.has(m.id)}
                  onCheckedChange={() => toggleMember(m.id)}
                  disabled={m.alreadyAssigned}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{m.displayName}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
                {m.alreadyAssigned && (
                  <span className="text-xs text-muted-foreground">Already assigned</span>
                )}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}