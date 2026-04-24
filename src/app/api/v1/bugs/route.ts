// Bug reports — liste + création.
// Création : ouvert à tout user authentifié (agent). Le reporter est auto.
// Liste : tous les bugs visibles aux agents. Les clients portail n'ont pas
// accès à cette route.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import { sendNewBugEmail } from "@/lib/bugs/notifications";
import { notifyUser, notifyUsers } from "@/lib/notifications/notify";
import type { BugSeverity, BugStatus } from "@prisma/client";

const SEVERITY_LABELS: Record<BugSeverity, string> = {
  LOW: "mineur",
  MEDIUM: "moyen",
  HIGH: "majeur",
  CRITICAL: "critique",
};

const SEVERITIES: BugSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: BugStatus[] = ["NEW", "TRIAGED", "APPROVED_FOR_FIX", "FIX_IN_PROGRESS", "FIX_PROPOSED", "FIXED", "REJECTED", "DUPLICATE"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const where: Record<string, unknown> = {};
  if (status && STATUSES.includes(status as BugStatus)) where.status = status;
  if (severity && SEVERITIES.includes(severity as BugSeverity)) where.severity = severity;

  const items = await prisma.bugReport.findMany({
    where,
    include: {
      reporter: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { comments: true, fixAttempts: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  if (!title || !description) {
    return NextResponse.json({ error: "title et description requis" }, { status: 400 });
  }
  const severity: BugSeverity = SEVERITIES.includes(body?.severity) ? body.severity : "MEDIUM";

  const created = await prisma.bugReport.create({
    data: {
      title: title.slice(0, 200),
      description: description.slice(0, 10_000),
      stepsToReproduce: body?.stepsToReproduce ? String(body.stepsToReproduce).slice(0, 5000) : null,
      severity,
      status: "NEW",
      reporterUserId: me.id,
      reporterEmail: me.email,
      contextUrl: body?.contextUrl ? String(body.contextUrl).slice(0, 500) : null,
      contextMeta: body?.contextMeta ?? null,
      screenshots: Array.isArray(body?.screenshots) ? body.screenshots.slice(0, 5) : null,
      linkedTicketId: body?.linkedTicketId || null,
    },
  });
  // Email dédié (avec boutons approve/reject one-click) — non-bloquant.
  void sendNewBugEmail(created.id).catch((e) => console.error("[bugs] sendNewBugEmail failed", e));

  // In-app : notifier tous les admins (hors reporter) pour triage,
  // + accusé de réception au reporter. Le dispatcher central respecte
  // les préférences par-event.
  void (async () => {
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] }, isActive: true },
        select: { id: true },
      });
      const adminIds = admins.map((a) => a.id);
      const detailLink = `/admin/bugs/${created.id}`;
      const sevLabel = SEVERITY_LABELS[severity];
      const reporterName = `${me.firstName} ${me.lastName}`.trim() || me.email;

      await notifyUsers(
        adminIds,
        "bug_reported",
        {
          title: `Bug ${sevLabel} signalé`,
          body: `${reporterName} · ${created.title}`,
          link: detailLink,
          metadata: { bugId: created.id, severity, reporterUserId: me.id },
          emailSubject: `[Bug ${severity}] ${created.title}`,
          email: {
            title: `Bug ${sevLabel} signalé`,
            intro: `${reporterName} vient de signaler un bug depuis ${created.contextUrl ?? "Nexus"}.`,
            metadata: [
              { label: "Sévérité", value: sevLabel },
              { label: "Reporter", value: reporterName },
              ...(created.contextUrl ? [{ label: "Page", value: created.contextUrl }] : []),
            ],
            body: created.description.slice(0, 500) + (created.description.length > 500 ? "…" : ""),
            ctaUrl: detailLink,
            ctaLabel: "Voir le bug",
          },
        },
        me.id,
      );

      await notifyUser(me.id, "bug_reported_ack", {
        title: "Bug enregistré",
        body: created.title,
        link: detailLink,
        metadata: { bugId: created.id, severity },
        emailSubject: `Bug enregistré : ${created.title}`,
        email: {
          title: "Bug enregistré",
          intro: "Merci ! Ton signalement a été transmis aux admins pour triage.",
          metadata: [{ label: "Sévérité", value: sevLabel }],
          body: created.description.slice(0, 300),
          ctaUrl: detailLink,
          ctaLabel: "Suivre l'avancement",
        },
      });
    } catch (e) {
      console.error("[bugs] in-app notify failed", e);
    }
  })();

  return NextResponse.json(created, { status: 201 });
}
