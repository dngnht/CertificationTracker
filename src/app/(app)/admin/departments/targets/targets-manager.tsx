"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertDeptTarget, deleteDeptTarget } from "@/features/dept-analytics/actions";

interface TargetRow {
  id: string;
  departmentId: string;
  departmentName: string;
  departmentPath: string;
  certificationId: string | null;
  certificationCode: string | null;
  certificationName: string | null;
  targetCount: number;
  dueDate: string | null;
  note: string | null;
}

interface Props {
  targets: TargetRow[];
  departments: { id: string; path: string; name: string }[];
  certifications: { id: string; code: string; name: string }[];
}

export function TargetsManager({ targets, departments, certifications }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [certificationId, setCertificationId] = useState("");
  const [targetCount, setTargetCount] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!departmentId) return toast.error("Chọn department.");
    const count = Number.parseInt(targetCount, 10);
    if (!Number.isFinite(count) || count < 1) return toast.error("Target count ≥ 1.");
    setBusy(true);
    const res = await upsertDeptTarget({
      departmentId,
      certificationId: certificationId || null,
      targetCount: count,
      dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
      note: note || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Đã lưu target.");
      setCertificationId("");
      setTargetCount("1");
      setDueDate("");
      setNote("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    const res = await deleteDeptTarget({ id });
    setBusy(false);
    if (res.ok) {
      toast.success("Đã xoá target.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dept Targets</h1>
        <p className="text-sm text-muted-foreground">
          Đặt mục tiêu số cert (VERIFIED) cho từng department.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tạo / cập nhật target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn department…" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.path} — {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cert (để trống = tổng số cert bất kỳ)</Label>
              <Select value={certificationId} onValueChange={setCertificationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tổng số cert bất kỳ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tổng số cert bất kỳ</SelectItem>
                  {certifications.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Target count (≥ 1)</Label>
              <Input
                type="number"
                min={1}
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due date (tuỳ chọn)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú…" />
          </div>
          <Button onClick={submit} disabled={busy}>
            Lưu target
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách target ({targets.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có target nào.</p>
          ) : (
            targets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {t.departmentName}{" "}
                    <span className="text-xs text-muted-foreground">({t.departmentPath})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.certificationCode ? `${t.certificationCode} — ${t.certificationName}` : "Tổng số cert bất kỳ"}
                    {" · "}target {t.targetCount}
                    {t.dueDate ? ` · hạn ${t.dueDate}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(t.id)}>
                  Xoá
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}