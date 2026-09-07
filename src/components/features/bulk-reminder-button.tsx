"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendReminders } from "@/features/reminders/actions";

export function BulkReminderButton({ assignmentIds }: { assignmentIds: string[] }) {
  const [busy, setBusy] = useState(false);

  async function send() {
    if (assignmentIds.length === 0) return toast.error("Select at least one row");
    setBusy(true);
    const result = await sendReminders({ assignmentIds });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data?.sent) toast.success(`Reminders sent to ${result.data.sent} assignment(s)`);
    if (result.data?.blocked) toast.warning(`${result.data.blocked} blocked (within 24h cooldown)`);
  }

  return (
    <Button onClick={send} disabled={busy}>
      <Bell className="h-4 w-4" />
      {busy ? "Sending..." : `Send Reminder (${assignmentIds.length})`}
    </Button>
  );
}