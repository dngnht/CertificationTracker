"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addToMyPlan } from "@/features/recommended/actions";

export function AddToPlanButton({ certCode }: { certCode: string }) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    const result = await addToMyPlan(certCode);
    setBusy(false);
    if (result.ok) toast.success("Added to your plan");
    else toast.error(result.error);
  }

  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      <Plus className="h-4 w-4" />
      {busy ? "Adding..." : "Add to my plan"}
    </Button>
  );
}