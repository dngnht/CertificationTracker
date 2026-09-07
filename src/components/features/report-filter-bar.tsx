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

export function ReportFilterBar({
  basePath,
  members,
  certifications,
  providers,
  departments,
  current,
}: {
  basePath: string;
  members: Option[];
  certifications: Option[];
  providers: Option[];
  departments?: Option[];
  current: Record<string, string>;
}) {
  const router = useRouter();

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <Field label="Member">
        <Select value={current.memberId ?? ""} onValueChange={(v) => apply({ ...current, memberId: v })}>
          <Trigger />
          <SelectContent>
            <SelectItem value="">All members</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {departments && departments.length > 0 && (
        <Field label="Department">
          <Select value={current.dept ?? ""} onValueChange={(v) => apply({ ...current, dept: v })}>
            <Trigger />
            <SelectContent>
              <SelectItem value="">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label="Certification">
        <Select value={current.certificationId ?? ""} onValueChange={(v) => apply({ ...current, certificationId: v })}>
          <Trigger />
          <SelectContent>
            <SelectItem value="">All certifications</SelectItem>
            {certifications.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Provider">
        <Select value={current.provider ?? ""} onValueChange={(v) => apply({ ...current, provider: v })}>
          <Trigger />
          <SelectContent>
            <SelectItem value="">All providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Type">
        <Select value={current.type ?? ""} onValueChange={(v) => apply({ ...current, type: v })}>
          <Trigger />
          <SelectContent>
            <SelectItem value="">All types</SelectItem>
            <SelectItem value="REQUIRED">Required</SelectItem>
            <SelectItem value="RECOMMENDED">Recommended</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Min days overdue">
        <Input
          type="number"
          min={0}
          defaultValue={current.minDaysOverdue ?? ""}
          onBlur={(e) => apply({ ...current, minDaysOverdue: e.target.value })}
          className="w-32"
        />
      </Field>

      <Button variant="outline" onClick={() => router.push(basePath)}>
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

function Trigger() {
  return <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>;
}