"use client";

import { useState } from "react";
import { toast } from "sonner";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  importCertifications,
  extractCertListFromImage,
} from "@/features/certifications/import-actions";

interface CertRow {
  code: string;
  name: string;
  provider: string;
}

function parseCsv(text: string): CertRow[] {
  const rows: CertRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 2) continue;
    const code = cols[0].toUpperCase();
    const name = cols[1];
    const provider = cols[2] || "Other";
    if (code && name) rows.push({ code, name, provider });
  }
  return rows;
}

export function ImportCertificationsDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // CSV tab
  const [csvText, setCsvText] = useState("");
  const [csvRows, setCsvRows] = useState<CertRow[]>([]);

  // Form tab
  const [rows, setRows] = useState<CertRow[]>([{ code: "", name: "", provider: "Other" }]);

  // Image tab
  const [image, setImage] = useState<File | null>(null);
  const [ocrRows, setOcrRows] = useState<CertRow[]>([]);

  function handleParseCsv() {
    const parsed = parseCsv(csvText);
    setCsvRows(parsed);
    if (parsed.length === 0) toast.error("No valid rows found (expected code,name[,provider])");
    else toast.success(`Parsed ${parsed.length} row(s)`);
  }

  function handleImageChange(file: File | null) {
    setImage(file);
    setOcrRows([]);
  }

  async function handleOcr() {
    if (!image) {
      toast.error("Select an image first");
      return;
    }
    setBusy(true);
    const buf = new Uint8Array(await image.arrayBuffer());
    const res = await extractCertListFromImage({ image: buf });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const certs = (res.data as { certs: { code: string; name: string }[] }).certs;
    setOcrRows(certs.map((c) => ({ code: c.code, name: c.name, provider: "Other" })));
    if (certs.length === 0) toast.error("No certification codes detected in the image");
    else toast.success(`Detected ${certs.length} certification(s)`);
  }

  function updateRow(i: number, field: keyof CertRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { code: "", name: "", provider: "Other" }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(list: CertRow[]) {
    const clean = list.filter((r) => r.code.trim() && r.name.trim());
    if (clean.length === 0) {
      toast.error("Nothing to import");
      return;
    }
    setBusy(true);
    const res = await importCertifications(clean);
    setBusy(false);
    if (res.ok) {
      const d = res.data as { imported: number; skipped: number };
      toast.success(`Imported ${d.imported}, skipped ${d.skipped}`);
      setOpen(false);
      setCsvText("");
      setCsvRows([]);
      setRows([{ code: "", name: "", provider: "Other" }]);
      setImage(null);
      setOcrRows([]);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Import Certifications</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Certifications</DialogTitle>
          <DialogDescription>
            Add recommended certifications via CSV, manual entry, or image OCR.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="csv">CSV</TabsTrigger>
            <TabsTrigger value="form">Manual</TabsTrigger>
            <TabsTrigger value="image">Image OCR</TabsTrigger>
          </TabsList>

          {/* CSV */}
          <TabsContent value="csv" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="csv">Paste CSV (code,name,provider)</Label>
              <Textarea
                id="csv"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"AZ-204,Microsoft Azure Developer Associate,Microsoft\nAWS-SAA,AWS Solutions Architect Associate,AWS"}
                rows={6}
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleParseCsv} disabled={busy}>
              Parse CSV
            </Button>
            {csvRows.length > 0 && (
              <div className="rounded-md border p-2 text-xs">
                <p className="mb-1 font-medium">{csvRows.length} row(s) ready to import</p>
                <Button type="button" size="sm" onClick={() => submit(csvRows)} disabled={busy}>
                  {busy ? "Importing..." : "Import"}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Manual */}
          <TabsContent value="form" className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.6fr_1fr_auto] gap-2 items-center">
                <Input
                  placeholder="Code"
                  value={row.code}
                  onChange={(e) => updateRow(i, "code", e.target.value)}
                />
                <Input
                  placeholder="Name"
                  value={row.name}
                  onChange={(e) => updateRow(i, "name", e.target.value)}
                />
                <Input
                  placeholder="Provider"
                  value={row.provider}
                  onChange={(e) => updateRow(i, "provider", e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Remove row">
                  ×
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={addRow} disabled={busy}>
                + Add row
              </Button>
              <Button type="button" onClick={() => submit(rows)} disabled={busy}>
                {busy ? "Importing..." : "Import"}
              </Button>
            </div>
          </TabsContent>

          {/* Image OCR */}
          <TabsContent value="image" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="image">Upload image</Label>
              <Input
                id="image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleOcr} disabled={busy || !image}>
              {busy ? "Extracting..." : "Extract certifications"}
            </Button>
            {ocrRows.length > 0 && (
              <div className="rounded-md border p-2 text-xs">
                <p className="mb-1 font-medium">{ocrRows.length} detected</p>
                <ul className="mb-2 max-h-40 overflow-auto space-y-0.5">
                  {ocrRows.map((r, i) => (
                    <li key={i}>
                      <span className="font-semibold">{r.code}</span> — {r.name}
                    </li>
                  ))}
                </ul>
                <Button type="button" size="sm" onClick={() => submit(ocrRows)} disabled={busy}>
                  {busy ? "Importing..." : "Import all"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}