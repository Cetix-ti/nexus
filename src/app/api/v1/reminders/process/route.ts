import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";

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

      // 2. Send email notification
      const emailSent = await sendEmail(
        reminder.user.email,
        `Rappel — Ticket #${reminder.ticket.number} : ${reminder.ticket.subject}`,
        `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="color: #1e293b; font-size: 18px; margin-bottom: 8px;">Rappel de ticket</h2>
            <p style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
              Bonjour ${reminder.user.firstName},
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="color: #334155; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">
                #${reminder.ticket.number} — ${reminder.ticket.subject}
              </p>
              ${reminder.note ? `<p style="color: #64748b; font-size: 13px; margin: 8px 0 0 0; font-style: italic;">${reminder.note}</p>` : ""}
            </div>
            <p style="color: #64748b; font-size: 13px;">
              Ce rappel a été configuré pour vous notifier aujourd'hui. Le ticket est maintenant de retour dans vos listes actives.
            </p>
          </div>
        `,
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
