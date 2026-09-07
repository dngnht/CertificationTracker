"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { importMembersCsv, CSV_TEMPLATE } from "@/features/departments/import-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ImportMembersForm() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csv.trim()) return;
    setBusy(true);
    const res = await importMembersCsv({ csvText: csv });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data) {
      setResult(res.data);
      toast.success(`Imported: ${res.data.created} created, ${res.data.updated} updated`);
      router.refresh();
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "members-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Import members from CSV</span>
            <Button size="sm" variant="outline" onClick={downloadTemplate}>
              Download template
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <Textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={8}
              placeholder={"email,displayName,departmentPath,role\nalice@example.com,Alice Example,ORG/DIV-A/DEPT-1,MEMBER"}
              className="font-mono text-xs"
            />
            <Button type="submit" disabled={busy || !csv.trim()}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Header: <code>email,displayName,departmentPath,role</code>. Departments are created
            automatically. Members are matched by email (no duplicates).
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Created: <strong>{result.created}</strong> · Updated: <strong>{result.updated}</strong>
            </p>
            {result.errors.length > 0 && (
              <div>
                <p className="font-medium text-red-600">{result.errors.length} error(s):</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}