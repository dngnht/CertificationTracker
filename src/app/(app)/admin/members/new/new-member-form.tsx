"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createMember } from "@/features/departments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NewMemberForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [departmentPath, setDepartmentPath] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const res = await createMember({
      email,
      displayName,
      departmentPath: departmentPath.trim() || undefined,
      role,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Created ${res.data!.email}`);
      router.push("/admin/members");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Add member manually</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Email *">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@example.com"
            />
          </Field>
          <Field label="Display name">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alice Example"
            />
          </Field>
          <Field label="Department path">
            <Input
              value={departmentPath}
              onChange={(e) => setDepartmentPath(e.target.value)}
              placeholder="ORG/DIV-A/DEPT-1"
            />
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? "Creating…" : "Create member"}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">
          The member can log in with their company account later; the record is matched by email.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}