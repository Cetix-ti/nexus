import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { dispatchTicketReminder } from "@/lib/notifications/dispatch";

/**
 * POST /api/v1/reminders/process
 * Cron job: finds due reminders and fires a ticket_reminder notification
 * via the central dispatcher (respecte les prefs + template Nexus unifié).
 * Idempotent — chaque reminder n'est traité qu'une fois (notifiedAt set).
 * Appelé aux ~5 min.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    /* authenticated via cron secret */
  } else {
    const { getCurrentUser, hasMinimumRole } = await import("@/lib/auth-utils");
    const me = await getCurrentUser();
    if (!me || !hasMinimumRole(me.role, "MSP_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const dueReminders = await prisma.ticketReminder.findMany({
      where: { remindAt: { lte: new Date() }, notifiedAt: null },
      include: {
        ticket: { select: { id: true } },
        user: { select: { id: true } },
      },
      take: 100,
    });

    let notified = 0;
    for (const r of dueReminders) {
      // Le dispatcher central gère l'in-app + l'email branded + le
      // respect des préférences utilisateur "ticket_reminder".
      await dispatchTicketReminder(r.ticket.id, r.user.id, r.note ?? undefined);
      await prisma.ticketReminder.update({
        where: { id: r.id },
        data: { notifiedAt: new Date() },
      });
      notified++;
    }

    return NextResponse.json({
      success: true,
      processed: notified,
      pending: dueReminders.length - notified,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
