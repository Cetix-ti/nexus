import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildBrandedEmailHtml } from "@/lib/email/branded-template";

/**
 * POST /api/v1/reminders/process
 * Cron job: finds due reminders, creates in-app notifications, sends emails.
 * Should be called every ~5 minutes.
 */
export async function POST(req: Request) {
  // Auth: cron secret or admin session
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Authenticated via cron secret
  } else {
    const { getCurrentUser, hasMinimumRole } = await import("@/lib/auth-utils");
    const me = await getCurrentUser();
    if (!me || !hasMinimumRole(me.role, "MSP_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Find all due reminders that haven't been notified yet
    const dueReminders = await prisma.ticketReminder.findMany({
      where: {
        remindAt: { lte: new Date() },
        notifiedAt: null,
      },
      include: {
        ticket: { select: { id: true, number: true, subject: true, status: true } },
        user: { select: { id: true, email: true, firstName: true } },
      },
      take: 100, // safety limit per batch
    });

    let notified = 0;
    let emailed = 0;

    for (const reminder of dueReminders) {
      // 1. Create in-app notification
      await prisma.notification.create({
        data: {
          userId: reminder.user.id,
          type: "reminder",
          title: `Rappel : ${reminder.ticket.subject}`,
          body: reminder.note || `Le ticket #${reminder.ticket.number} requiert votre attention.`,
          link: `/tickets/${reminder.ticket.id}`,
          metadata: {
            ticketId: reminder.ticket.id,
            ticketNumber: reminder.ticket.number,
            reminderId: reminder.id,
          },
        },
      });

      // 2. Send email notification (using branded template)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const reminderHtml = buildBrandedEmailHtml({
        headerGradient: "linear-gradient(135deg,#7C3AED 0%,#A78BFA 100%)",
        preheader: `Rappel : ticket #${reminder.ticket.number}`,
        title: `Rappel de ticket`,
        subtitle: `#${reminder.ticket.number} — ${reminder.ticket.subject}`,
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65;">
            Bonjour ${reminder.user.firstName},
          </p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;font-size:14px;color:#334155;line-height:1.65;margin-bottom:16px;">
            <p style="margin:0;font-weight:600;">#${reminder.ticket.number} — ${reminder.ticket.subject}</p>
            ${reminder.note ? `<p style="margin:8px 0 0;color:#64748B;font-style:italic;">${reminder.note}</p>` : ""}
          </div>
          <p style="margin:0;font-size:13px;color:#64748B;">
            Ce rappel a &eacute;t&eacute; configur&eacute; pour vous notifier aujourd'hui.
          </p>
        `,
        ctaUrl: `${appUrl}/tickets/${reminder.ticket.id}`,
        ctaLabel: "Voir le billet",
        ctaColor: "#7C3AED",
      });
      const emailSent = await sendEmail(
        reminder.user.email,
        `Rappel — Ticket #${reminder.ticket.number} : ${reminder.ticket.subject}`,
        reminderHtml,
      );

      if (emailSent) emailed++;

      // 3. Mark as notified
      await prisma.ticketReminder.update({
        where: { id: reminder.id },
        data: { notifiedAt: new Date() },
      });

      notified++;
    }

    return NextResponse.json({
      success: true,
      processed: notified,
      emailed,
      pending: dueReminders.length - notified,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
