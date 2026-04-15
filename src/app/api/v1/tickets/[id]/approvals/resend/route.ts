import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { sendEmail } from "@/lib/email/send";

/**
 * POST — relance les demandes d'approbation aux approbateurs en attente.
 * Réservé TECHNICIAN+ (un agent MSP).
 *
 * Retourne le nombre de courriels envoyés. Silencieux si SMTP n'est pas
 * configuré — le succès est logué dans une Activity ticket pour traçabilité.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      subject: true,
      description: true,
      organization: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const pending = await prisma.ticketApproval.findMany({
    where: { ticketId: id, status: "PENDING" },
    select: { id: true, approverEmail: true, approverName: true },
  });
  if (pending.length === 0) {
    return NextResponse.json(
      { error: "Aucune approbation en attente — rien à relancer" },
      { status: 400 },
    );
  }

  const subject = `Relance — Approbation demandée : ${ticket.subject}`;
  const ticketNumber = `INC-${1000 + ticket.number}`;
  const requesterName = ticket.requester
    ? `${ticket.requester.firstName} ${ticket.requester.lastName}`.trim()
    : "—";
  const orgName = ticket.organization?.name ?? "—";

  let sent = 0;
  let failures = 0;
  for (const a of pending) {
    if (!a.approverEmail) {
      failures++;
      continue;
    }
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;">
        <p style="font-size:15px;">Bonjour ${a.approverName || ""},</p>
        <p>Nous vous rappelons qu'une demande d'approbation est toujours en attente de votre décision :</p>
        <div style="border-left:3px solid #f59e0b;padding:12px 16px;background:#fffbeb;border-radius:0 6px 6px 0;margin:16px 0;">
          <p style="margin:0;font-weight:600;">${escapeHtml(ticket.subject)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">
            ${ticketNumber} · ${escapeHtml(orgName)} · Demandé par ${escapeHtml(requesterName)}
          </p>
        </div>
        <p>
          <a href="${process.env.NEXTAUTH_URL ?? ""}/portal/tickets/${ticket.id}"
             style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">
             Voir et décider
          </a>
        </p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
          Cette relance a été envoyée par ${me.firstName} ${me.lastName} depuis Nexus (Cetix MSP).
        </p>
      </div>
    `;
    const ok = await sendEmail(a.approverEmail, subject, html);
    if (ok) sent++;
    else failures++;
  }

  // Trace la relance dans l'activité du ticket.
  try {
    await prisma.activity.create({
      data: {
        ticketId: id,
        action: "approval_resent",
        userId: me.id,
        metadata: {
          recipientCount: pending.length,
          sent,
          failures,
        } as any,
      },
    });
  } catch {
    /* activity log non bloquant */
  }

  return NextResponse.json({
    success: true,
    message:
      failures === 0
        ? `Relance envoyée à ${sent} approbateur${sent > 1 ? "s" : ""}`
        : `Relance : ${sent} succès, ${failures} échec${failures > 1 ? "s" : ""} (vérifiez la config SMTP)`,
    sent,
    failures,
    total: pending.length,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
