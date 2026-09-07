"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkReminderButton } from "@/components/bulk-reminder-button";

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportRow {
  id: string;
  assignmentId?: string;
  cells: Record<string, React.ReactNode>;
}

export function ReportTable({
  columns,
  rows,
  selectable = false,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  selectable?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectableIds = rows.filter((r) => r.assignmentId).map((r) => r.assignmentId!) as string[];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const allSelected = selectableIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedAssignmentIds = rows
    .filter((r) => r.assignmentId && selected.has(r.assignmentId))
    .map((r) => r.assignmentId!);

  return (
    <div className="space-y-3">
      {selectable && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{selectedAssignmentIds.length} selected</span>
          <BulkReminderButton assignmentIds={selectedAssignmentIds} />
        </div>
      )}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="py-8 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {selectable && (
                    <TableCell>
                      {row.assignmentId && (
                        <Checkbox checked={selected.has(row.assignmentId)} onCheckedChange={() => toggle(row.assignmentId!)} />
                      )}
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key}>{row.cells[c.key]}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}