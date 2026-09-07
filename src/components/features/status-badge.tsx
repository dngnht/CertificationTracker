import { Badge } from "@/components/ui/badge";
import type { EffectiveAssignmentStatus } from "@/features/assignments/status";

export const STATUS_LABELS: Record<EffectiveAssignmentStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  EXEMPTED: "Exempted",
  CERTIFICATE_EXPIRED: "Certificate Expired",
};

const STATUS_VARIANTS: Record<
  EffectiveAssignmentStatus,
  "muted" | "info" | "success" | "destructive" | "warning" | "outline"
> = {
  NOT_STARTED: "muted",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  OVERDUE: "destructive",
  EXEMPTED: "outline",
  CERTIFICATE_EXPIRED: "warning",
};

export function StatusBadge({ status }: { status: EffectiveAssignmentStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export const TYPE_LABELS: Record<"REQUIRED" | "RECOMMENDED", string> = {
  REQUIRED: "Required",
  RECOMMENDED: "Recommended",
};

export function TypeBadge({ type }: { type: "REQUIRED" | "RECOMMENDED" }) {
  return (
    <Badge variant={type === "REQUIRED" ? "default" : "secondary"}>
      {TYPE_LABELS[type]}
    </Badge>
  );
}

export const VERIFICATION_LABELS: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export function VerificationBadge({ status }: { status: string }) {
  const variant =
    status === "VERIFIED" ? "success" : status === "REJECTED" ? "destructive" : "warning";
  return <Badge variant={variant as "success" | "destructive" | "warning"}>{VERIFICATION_LABELS[status] ?? status}</Badge>;
}