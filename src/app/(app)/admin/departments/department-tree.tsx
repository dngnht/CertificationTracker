"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { DeptTreeNode } from "@/features/departments/queries";
import { createDepartment, disableDepartment, renameDepartment } from "@/features/departments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FlatDept {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
}

export function DepartmentTree({
  tree,
  all,
}: {
  tree: DeptTreeNode[];
  all: FlatDept[];
}) {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;
    setBusy(true);
    const res = await createDepartment({ path, name });
    setBusy(false);
    if (res.ok) {
      toast.success(`Created ${res.data!.path}`);
      setPath("");
      setName("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function onDisable(id: string, deptName: string) {
    if (!confirm(`Disable department "${deptName}"?`)) return;
    const res = await disableDepartment({ id });
    if (res.ok) toast.success("Disabled");
    else toast.error(res.error);
    router.refresh();
  }

  async function onRename(id: string, current: string) {
    const name = prompt("New display name:", current);
    if (!name?.trim() || name.trim() === current) return;
    const res = await renameDepartment({ id, name });
    if (res.ok) toast.success("Renamed");
    else toast.error(res.error);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Structure</CardTitle>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No departments yet. Create one using the form.
            </p>
          ) : (
            <ul className="space-y-1">
              {tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  onDisable={onDisable}
                  onRename={onRename}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create department</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Path (e.g. ORG/DIV-A/DEPT-1)
              </span>
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="ORG/DIV-A/DEPT-1"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Display name (optional)
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Department 1"
              />
            </div>
            <Button type="submit" disabled={busy || !path.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4">
            <span className="text-xs font-medium text-muted-foreground">All departments</span>
            <ul className="mt-2 space-y-1 text-sm">
              {all.map((d) => (
                <li key={d.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{d.path}</span>
                  {!d.isActive && <Badge variant="outline">disabled</Badge>}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TreeNode({
  node,
  onDisable,
  onRename,
}: {
  node: DeptTreeNode;
  onDisable: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  return (
    <li>
      <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
        <span className="text-muted-foreground">{"—".repeat(node.depth)}</span>
        <button
          className="font-medium hover:underline"
          onClick={() => onRename(node.id, node.name)}
          title="Rename"
        >
          {node.name}
        </button>
        <span className="text-xs text-muted-foreground">{node.path}</span>
        <Badge variant="secondary">{node.memberCount} members</Badge>
        <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDisable(node.id, node.name)}
          >
            Disable
          </Button>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul className="ml-4 space-y-1">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} onDisable={onDisable} onRename={onRename} />
          ))}
        </ul>
      )}
    </li>
  );
}