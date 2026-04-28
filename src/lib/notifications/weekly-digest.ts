// ============================================================================
// WEEKLY DIGEST — résumé hebdomadaire de la semaine écoulée.
//
// Déclenché chaque vendredi 17h00 par systemd timer (nexus-weekly-digest).
// Envoyé via le pipeline notifyUsers() classique pour respecter les
// préférences utilisateur (canNotify gate).
//
// Phase actuelle (avril 2026) : restreint à Bruno + Simon le temps de
// roder le contenu. Une fois validé, on remplace `WEEKLY_DIGEST_ALLOWED_FIRST_NAMES`
// par tous les agents actifs.
// ============================================================================

import prisma from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/notify";

/**
 * Pré-prod : on n'envoie le digest qu'à ces agents pour le moment.
 * Quand on sera prêt à généraliser, on inverse la condition (= TOUS les
 * agents actifs avec préférence email activée pour `weekly_digest`).
 */
const WEEKLY_DIGEST_ALLOWED_FIRST_NAMES = ["Bruno", "Simon"];

interface DigestStats {
  ticketsCreated: number;
  ticketsResolved: number;
  ticketsOverdue: number;
  hoursLogged: number;
  upcomingRenewals: number;
  upcomingOnSiteVisits: number;
}

async function computeDigestForUser(userId: string, since: Date, until: Date): Promise<DigestStats> {
  const [created, resolved, overdue, timeAgg, renewals, visits] = await Promise.all([
    prisma.ticket.count({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
        createdAt: { gte: since, lte: until },
      },
    }),
    prisma.ticket.count({
      where: {
        assigneeId: userId,
        status: "RESOLVED",
        resolvedAt: { gte: since, lte: until },
      },
    }),
    prisma.ticket.count({
      where: {
        assigneeId: userId,
        isOverdue: true,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "DELETED"] },
      },
    }),
    prisma.timeEntry.aggregate({
      where: { agentId: userId, startedAt: { gte: since, lte: until } },
      _sum: { durationMinutes: true },
    }),
    prisma.calendarEvent.count({
      where: {
        kind: "RENEWAL",
        status: "active",
        deletedAt: null,
        startsAt: { gte: until, lte: new Date(until.getTime() + 14 * 24 * 3600_000) },
        OR: [{ ownerId: userId }, { agents: { some: { userId } } }],
      },
    }),
    prisma.calendarEvent.count({
      where: {
        kind: "WORK_LOCATION",
        status: "active",
        deletedAt: null,
        startsAt: { gte: until, lte: new Date(until.getTime() + 7 * 24 * 3600_000) },
        agents: { some: { userId } },
      },
    }),
  ]);

  return {
    ticketsCreated: created,
    ticketsResolved: resolved,
    ticketsOverdue: overdue,
    hoursLogged: Math.round(((timeAgg._sum.durationMinutes ?? 0) / 60) * 10) / 10,
    upcomingRenewals: renewals,
    upcomingOnSiteVisits: visits,
  };
}

function fmtRange(since: Date, until: Date): string {
  const o = (d: Date) =>
    d.toLocaleDateString("fr-CA", { day: "numeric", month: "long" });
  return `${o(since)} – ${o(until)}`;
}

function sectionHeader(label: string, color: string): string {
  return `<div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.6px;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">${label}</div>`;
}

function statRow(label: string, value: number | string, hint?: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#475569;">${label}</td>
    <td style="padding:8px 0;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${value}${hint ? ` <span style="font-size:11px;color:#94a3b8;font-weight:400;">${hint}</span>` : ""}</td>
  </tr>`;
}

/**
 * Construit le résumé pour un utilisateur précis et l'envoie via notifyUsers
 * (en passant par notifyUsers même pour 1 user, on bénéficie du gate
 * canNotify standard et de la cohérence du pipeline).
 */
export async function sendWeeklyDigestForUser(userId: string, since: Date, until: Date): Promise<void> {
  const stats = await computeDigestForUser(userId, since, until);
  const range = fmtRange(since, until);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  const agentName = user ? `${user.firstName} ${user.lastName}`.trim() : "";

  const summaryTable = `
    <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
      ${sectionHeader("Cette semaine", "#0f172a")}
      ${statRow("Tickets traités (créés/assignés)", stats.ticketsCreated)}
      ${statRow("Tickets résolus", stats.ticketsResolved)}
      ${statRow("Heures saisies", `${stats.hoursLogged} h`)}
      ${sectionHeader("État courant", "#0891b2")}
      ${statRow("Tickets en retard", stats.ticketsOverdue, stats.ticketsOverdue > 0 ? "⚠" : "")}
      ${sectionHeader("À venir", "#7c3aed")}
      ${statRow("Renouvellements (14 prochains jours)", stats.upcomingRenewals)}
      ${statRow("Visites sur place planifiées (7 j)", stats.upcomingOnSiteVisits)}
    </table>
  `;

  // Payload pour la substitution {{var}} dans le template DB
  // weekly_digest. Couvre toutes les variables documentées dans le
  // catalogue (variable-catalog.ts) pour cet event.
  const appUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://nexus.cetix.ca";
  const emailPayload: Record<string, string> = {
    app_url: appUrl,
    company_name: process.env.COMPANY_NAME ?? "Cetix Informatique",
    now: new Date().toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" }),
    agent_name: agentName,
    week_range: range,
    tickets_created: String(stats.ticketsCreated),
    tickets_resolved: String(stats.ticketsResolved),
    tickets_overdue: String(stats.ticketsOverdue),
    hours_logged: String(stats.hoursLogged),
    upcoming_renewals: String(stats.upcomingRenewals),
    upcoming_visits: String(stats.upcomingOnSiteVisits),
  };

  await notifyUsers([userId], "weekly_digest", {
    title: `Résumé hebdomadaire — ${range}`,
    body: `${stats.ticketsResolved} résolus · ${stats.hoursLogged} h saisies · ${stats.ticketsOverdue} en retard`,
    link: "/dashboard",
    emailSubject: `Votre semaine — ${range}`,
    emailPayload,
    email: {
      preheader: `${stats.ticketsResolved} résolus · ${stats.hoursLogged} h · ${stats.ticketsOverdue} en retard`,
      title: `Votre semaine en un coup d'œil`,
      intro: range,
      body: summaryTable,
      ctaUrl: "/dashboard",
      ctaLabel: "Ouvrir le tableau de bord",
    },
  });
}

/**
 * Entrée principale du worker. Calcule la fenêtre 7 jours glissants
 * et dispatche un digest par agent autorisé.
 */
export async function runWeeklyDigest(now: Date = new Date()): Promise<{
  recipients: number;
  sent: string[];
  skipped: string[];
}> {
  // Fenêtre rolling 7 jours : `now - 7 jours` → `now`.
  //
  // Avant : on prenait "lundi 00h00 de la semaine en cours → now". Sur le
  // run cron du vendredi 17h ça donne lun-ven (correct), mais sur un
  // déclenchement manuel un lundi matin la fenêtre dégénère à "lundi 00h
  // → lundi 09h" → l'objet email affichait "27 avril – 27 avril". Le
  // rolling 7 jours est lisible quel que soit le moment du déclenchement
  // et reste intuitif vendredi 17h (= lun précédent → ven 17h).
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600_000);

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      firstName: { in: WEEKLY_DIGEST_ALLOWED_FIRST_NAMES },
    },
    select: { id: true, firstName: true, lastName: true },
  });

  const sent: string[] = [];
  const skipped: string[] = [];
  for (const u of recipients) {
    try {
      await sendWeeklyDigestForUser(u.id, weekStart, now);
      sent.push(`${u.firstName} ${u.lastName}`);
    } catch (err) {
      console.warn(`[weekly-digest] échec pour ${u.firstName} ${u.lastName}:`, err);
      skipped.push(`${u.firstName} ${u.lastName}`);
    }
  }

  return { recipients: recipients.length, sent, skipped };
}
