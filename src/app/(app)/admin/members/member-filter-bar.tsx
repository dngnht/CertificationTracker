"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  value: string;
  label: string;
}

export function MemberFilterBar({
  departments,
  current,
}: {
  departments: Option[];
  current: Record<string, string>;
}) {
  const router = useRouter();

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `/admin/members?${qs}` : "/admin/members");
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <Field label="Search">
        <Input
          defaultValue={current.q ?? ""}
          placeholder="Name…"
          className="w-44"
          onBlur={(e) => apply({ ...current, q: e.target.value })}
        />
      </Field>

      <Field label="Department">
        <Select
          value={current.dept ?? ""}
          onValueChange={(v) => apply({ ...current, dept: v })}
        >
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Compliance">
        <Select
          value={current.compliance ?? ""}
          onValueChange={(v) => apply({ ...current, compliance: v })}
        >
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="compliant">Compliant</SelectItem>
            <SelectItem value="non_compliant">Non-compliant</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Button variant="outline" onClick={() => router.push("/admin/members")}>
        Reset
      </Button>
    </div>
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