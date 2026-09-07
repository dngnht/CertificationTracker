/**
 * Notification abstraction. Certification business logic depends only on this
 * interface, so the delivery mechanism (email, Teams, in-app) can be swapped
 * without touching assignment logic.
 */

export interface ReminderInput {
  to: string; // recipient email
  toName: string;
  certificationCode: string;
  certificationName: string;
  deadline: Date | null;
  status: string;
  progressPercent: number;
  appUrl: string;
}

export interface NotificationService {
  sendCertificationReminder(input: ReminderInput): Promise<void>;
}

/** Dev implementation: logs the reminder to the server console. */
export class ConsoleNotificationService implements NotificationService {
  async sendCertificationReminder(input: ReminderInput): Promise<void> {
    const lines = [
      `[REMINDER] To: ${input.toName} <${input.to}>`,
      `  Certification: ${input.certificationCode} - ${input.certificationName}`,
      `  Deadline: ${input.deadline ? input.deadline.toISOString() : "none"}`,
      `  Status: ${input.status}`,
      `  Progress: ${input.progressPercent}%`,
      `  Link: ${input.appUrl}/dashboard`,
    ];
    console.info(lines.join("\n"));
  }
}

/** Production implementation using the Resend transactional email API. */
export class ResendNotificationService implements NotificationService {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async sendCertificationReminder(input: ReminderInput): Promise<void> {
    const deadlineText = input.deadline
      ? input.deadline.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "No deadline";

    const subject = `Reminder: ${input.certificationCode} - ${input.certificationName}`;

    const text = [
      `Hi ${input.toName},`,
      ``,
      `This is a reminder about your certification plan.`,
      ``,
      `Certification: ${input.certificationCode} - ${input.certificationName}`,
      `Deadline: ${deadlineText}`,
      `Current status: ${input.status}`,
      `Progress: ${input.progressPercent}%`,
      ``,
      `Open the tracker to review: ${input.appUrl}/dashboard`,
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend email failed (${response.status}): ${body}`);
    }
  }
}

let cached: NotificationService | null = null;

/** Return the configured notification service (singleton). */
export function getNotificationService(): NotificationService {
  if (cached) return cached;

  if (process.env.NOTIFICATION_BACKEND === "resend") {
    const apiKey = process.env.EMAIL_PROVIDER_API_KEY ?? "";
    const from = process.env.EMAIL_FROM ?? "Certification Tracker <no-reply@example.com>";
    cached = new ResendNotificationService(apiKey, from);
  } else {
    cached = new ConsoleNotificationService();
  }
  return cached;
}