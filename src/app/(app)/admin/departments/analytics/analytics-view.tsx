"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TARGET_STATUS_STYLE } from "@/features/dept-analytics/compute";
import type {
  DeptStatNode,
  TargetProgressRow,
} from "@/features/dept-analytics/queries";

interface Props {
  stats: DeptStatNode[];
  targets: TargetProgressRow[];
  departments: { id: string; code: string; name: string; path: string }[];
  certifications: { id: string; code: string; name: string }[];
  rootPath: string;
  certFilter: string;
}

const STATUS_ORDER = ["COMPLETED", "ON_TRACK", "AT_RISK", "OVERDUE"] as const;

export function AnalyticsView({
  stats,
  targets,
  departments,
  certifications,
  rootPath,
  certFilter,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/admin/departments/analytics?${next.toString()}`);
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Flatten tree into rows respecting collapsed state.
  const rows = useMemo(() => {
    const out: { node: DeptStatNode; depth: number }[] = [];
    const walk = (nodes: DeptStatNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.children.length > 0 && !collapsed.has(n.id)) {
          walk(n.children, depth + 1);
        }
      }
    };
    walk(stats, 0);
    return out;
  }, [stats, collapsed]);

  // Bar chart data: top departments by achieved.
  const barData = useMemo(() => {
    const flattened: DeptStatNode[] = [];
    const walk = (nodes: DeptStatNode[]) => {
      for (const n of nodes) {
        flattened.push(n);
        walk(n.children);
      }
    };
    walk(stats);
    return flattened
      .filter((n) => n.achieved > 0 || n.inProgress > 0)
      .sort((a, b) => b.achieved - a.achieved)
      .slice(0, 10);
  }, [stats]);

  // Donut data: target status distribution.
  const donut = useMemo(() => {
    const counts: Record<string, number> = { COMPLETED: 0, ON_TRACK: 0, AT_RISK: 0, OVERDUE: 0 };
    for (const t of targets) counts[t.status] += 1;
    return STATUS_ORDER.map((s) => ({ status: s, count: counts[s] })).filter((d) => d.count > 0);
  }, [targets]);
  const donutTotal = donut.reduce((a, d) => a + d.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Department Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Cert statistics and target completion by 部署 (department).
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Department gốc</span>
            <Select value={rootPath} onValueChange={(v) => setParam("root", v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Toàn tổ chức" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Toàn tổ chức</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.path}>
                    {d.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Chứng chỉ</span>
            <Select value={certFilter} onValueChange={(v) => setParam("cert", v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Tất cả cert" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tất cả cert</SelectItem>
                {certifications.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tree table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cert theo department (gồm cây con)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
          ) : (
            rows.map(({ node, depth }) => (
              <div
                key={node.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40"
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
              >
                <div className="flex items-center gap-1 text-sm font-medium">
                  {node.children.length > 0 ? (
                    <button onClick={() => toggle(node.id)} className="text-muted-foreground">
                      {collapsed.has(node.id) ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <span>{node.name}</span>
                  <span className="text-xs text-muted-foreground">{node.code}</span>
                </div>
                <span className="text-xs text-muted-foreground">{node.memberCount} mem</span>
                <Badge variant="success">{node.achieved} đạt</Badge>
                <Badge variant="secondary">{node.inProgress} học</Badge>
                {node.expired > 0 ? (
                  <Badge variant="destructive">{node.expired} hết hạn</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">0 hết hạn</span>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top departments theo số cert đạt</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={barData} />
          </CardContent>
        </Card>

        {/* Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phân bố trạng thái target</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <DonutChart segments={donut} total={donutTotal} />
            <div className="space-y-2">
              {STATUS_ORDER.map((s) => {
                const st = TARGET_STATUS_STYLE[s];
                const count = donut.find((d) => d.status === s)?.count ?? 0;
                return (
                  <div key={s} className="flex items-center gap-2 text-sm">
                    <span className={`h-3 w-3 rounded-full ${st.bar}`} />
                    <span className="text-muted-foreground">{st.label}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Target progress cards */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Mục tiêu (Targets)</h2>
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có target nào.{" "}
            <a href="/admin/departments/targets" className="underline">
              Đặt target
            </a>
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {targets.map((t) => {
              const st = TARGET_STATUS_STYLE[t.status];
              return (
                <Card key={t.id} className={st.bg}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t.department.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.certification ? t.certification.code : "Tổng số cert bất kỳ"}
                        </p>
                      </div>
                      <Badge className={st.text}>{st.label}</Badge>
                    </div>
                    <p className="mt-3 text-2xl font-semibold">
                      {t.achieved}
                      <span className="text-sm font-normal text-muted-foreground"> / {t.targetCount}</span>
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10">
                      <div
                        className={`h-full ${st.bar}`}
                        style={{ width: `${Math.round(t.completionRate * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.round(t.completionRate * 100)}%
                      {t.dueDate ? ` · hạn ${t.dueDate.toLocaleDateString()}` : ""}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: DeptStatNode[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có dữ liệu cert.</p>;
  }
  const max = Math.max(...data.map((d) => d.achieved), 1);
  const barW = 520;
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-sm">
          <span className="w-40 truncate text-muted-foreground">{d.name}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="flex h-full items-center rounded bg-blue-500 px-1 text-xs text-white"
              style={{ width: `${Math.max(4, (d.achieved / max) * 100)}%` }}
            >
              {d.achieved}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({
  segments,
  total,
}: {
  segments: { status: string; count: number }[];
  total: number;
}) {
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có target.</p>;
  }
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors: Record<string, string> = {
    COMPLETED: "#22c55e",
    ON_TRACK: "#eab308",
    AT_RISK: "#f97316",
    OVERDUE: "#ef4444",
  };
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="22" />
      {segments.map((seg) => {
        const frac = seg.count / total;
        const dash = frac * circumference;
        const el = (
          <circle
            key={seg.status}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={colors[seg.status] ?? "#888"}
            strokeWidth="22"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 80 80)"
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
      <text x="80" y="80" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-xl font-semibold">
        {total}
      </text>
    </svg>
  );
}