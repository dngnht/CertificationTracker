"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { sendReminderSchema } from "@/features/schemas";
import { canSendReminder } from "@/features/reminders/rules";
import { getNotificationService } from "@/features/reminders/notification";
import { getEffectiveStatus } from "@/features/assignments/status";
import { config } from "@/features/config";

export interface ReminderSummary {
  sent: number;
  blocked: number;
  blockedDetails: { assignmentId: string; reason: string }[];
}

/**
 * Send reminders for one or more assignments. Each recipient gets an
 * individual email. Duplicate sends within the cooldown are blocked unless
 * `force` is set.
 */
export async function sendReminders(
  input: unknown
): Promise<ActionResult<ReminderSummary>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = sendReminderSchema.parse(input);

    const assignments = await prisma.certificationAssignment.findMany({
      where: { id: { in: parsed.assignmentIds } },
      include: {
        certification: { select: { code: true, name: true } },
        member: { select: { id: true, email: true, displayName: true } },
        memberCert: true,
      },
    });

    const notification = getNotificationService();
    const sent: string[] = [];
    const blockedDetails: ReminderSummary["blockedDetails"] = [];

    for (const assignment of assignments) {
      const rule = canSendReminder({
        lastReminderAt: assignment.lastReminderAt,
        cooldownHours: config.reminderCooldownHours,
        force: parsed.force,
      });

      if (!rule.allowed) {
        blockedDetails.push({
          assignmentId: assignment.id,
          reason: "Reminder already sent within the last 24 hours.",
        });
        continue;
      }

      const status = getEffectiveStatus(assignment, assignment.memberCert);
      const progressPercent = assignment.memberCert?.progressPercent ?? 0;

      await notification.sendCertificationReminder({
        to: assignment.member.email,
        toName: assignment.member.displayName,
        certificationCode: assignment.certification.code,
        certificationName: assignment.certification.name,
        deadline: assignment.deadline,
        status,
        progressPercent,
        appUrl: config.appUrl,
      });

      await prisma.$transaction([
        prisma.certificationAssignment.update({
          where: { id: assignment.id },
          data: {
            lastReminderAt: new Date(),
            reminderCount: { increment: 1 },
          },
        }),
        prisma.reminderLog.create({
          data: {
            memberId: assignment.memberId,
            assignmentId: assignment.id,
            sentById: admin.id,
          },
        }),
      ]);

      sent.push(assignment.id);
    }

    if (sent.length > 0) {
      await logAudit({
        actorId: admin.id,
        action: "SEND_REMINDER",
        entityType: "CertificationAssignment",
        details: { assignmentIds: sent, forced: parsed.force },
      });
    }

    revalidateTracker();
    return {
      sent: sent.length,
      blocked: blockedDetails.length,
      blockedDetails,
    };
  });
}