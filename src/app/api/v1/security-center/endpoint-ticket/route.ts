// POST /api/v1/security-center/endpoint-ticket
//
// Crée un ticket unique qui regroupe TOUTES les alertes d'un endpoint
// (CVE, persistence_tool, comportement suspect, etc.). Description =
// synthèse par kind + liste détaillée des incidents avec timestamps.
//
// Body : { organizationId: string, endpoint: string,
//          incidentIds: string[], subject?: string, priority?: string }
//
// Les incidents passés se voient assigner ticketId → le bouton "Créer
// ticket" individuel sur chaque incident redirige désormais vers le
// ticket groupé. Statut des incidents passe à "investigating".

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { createTicket } from "@/lib/tickets/service";

const SEVERITY_PRIORITY: Record<string, string> = {
  critical: "high",
  high: "medium",
  warning: "low",
  info: "low",
};
const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  warning: 1,
  high: 2,
  critical: 3,
};
const KIND_LABEL: Record<string, string> = {
  cve: "Vulnérabilité CVE",
  persistence_tool: "Logiciel de persistance",
  suspicious_behavior: "Comportement suspect",
  malware: "Malware",
  ransomware: "Rançongiciel",
  critical_incident: "Incident critique",
  account_lockout: "Verrouillage de compte",
  inactive_account: "Compte inactif",
};

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        organizationId?: string;
        endpoint?: string;
        incidentIds?: string[];
        subject?: string;
        priority?: string;
      }
    | null;

  if (!body?.organizationId) {
    return NextResponse.json({ error: "organizationId requis" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint requis" }, { status: 400 });
  }
  if (!Array.isArray(body.incidentIds) || body.incidentIds.length === 0) {
    return NextResponse.json({ error: "incidentIds requis (non vide)" }, { status: 400 });
  }

  const incidents = await prisma.securityIncident.findMany({
    where: {
      id: { in: body.incidentIds },
      organizationId: body.organizationId,
    },
    include: {
      alerts: {
        orderBy: { receivedAt: "desc" },
        take: 5,
        select: { id: true, receivedAt: true, severity: true, title: true },
      },
    },
  });

  if (incidents.length === 0) {
    return NextResponse.json({ error: "Aucun incident trouvé" }, { status: 404 });
  }

  const alreadyTicketed = incidents.filter((i) => i.ticketId);
  if (alreadyTicketed.length === incidents.length && alreadyTicketed.every((i) => i.ticketId === alreadyTicketed[0].ticketId)) {
    // Tous ces incidents ont déjà le même ticket — renvoie-le.
    return NextResponse.json(
      { ticketId: alreadyTicketed[0].ticketId, alreadyExisted: true },
      { status: 200 },
    );
  }

  // Sévérité max pour dériver la priorité
  let maxSev: string | null = null;
  let maxRank = -1;
  for (const i of incidents) {
    if (!i.severity) continue;
    const r = SEVERITY_RANK[i.severity] ?? 0;
    if (r > maxRank) {
      maxRank = r;
      maxSev = i.severity;
    }
  }
  const priority =
    body.priority ?? (maxSev ? SEVERITY_PRIORITY[maxSev] ?? "low" : "low");

  // Agrège par kind pour la synthèse
  const byKind = new Map<string, typeof incidents>();
  for (const i of incidents) {
    if (!byKind.has(i.kind)) byKind.set(i.kind, []);
    byKind.get(i.kind)!.push(i);
  }

  const summaryLines: string[] = [];
  summaryLines.push(`${incidents.length} incident(s) de sécurité sur ${body.endpoint}`);
  summaryLines.push("");
  summaryLines.push("Répartition :");
  for (const [kind, list] of byKind) {
    summaryLines.push(`  • ${KIND_LABEL[kind] ?? kind} : ${list.length}`);
  }

  summaryLines.push("");
  summaryLines.push("─".repeat(60));
  summaryLines.push("");

  // Détails par incident, groupés par kind
  for (const [kind, list] of byKind) {
    summaryLines.push(`### ${KIND_LABEL[kind] ?? kind}`);
    summaryLines.push("");
    for (const i of list) {
      const sev = i.severity ? `[${i.severity.toUpperCase()}] ` : "";
      summaryLines.push(`• ${sev}${i.title}`);
      if (i.cveId) summaryLines.push(`  CVE : ${i.cveId}`);
      if (i.software) summaryLines.push(`  Logiciel : ${i.software}`);
      summaryLines.push(
        `  Occurrences : ${i.occurrenceCount} · Première : ${i.firstSeenAt.toLocaleString("fr-CA")} · Dernière : ${i.lastSeenAt.toLocaleString("fr-CA")}`,
      );
      if (i.summary) {
        const snippet = i.summary.replace(/\s+/g, " ").slice(0, 300);
        summaryLines.push(`  ${snippet}${i.summary.length > 300 ? "…" : ""}`);
      }
      summaryLines.push("");
    }
  }

  const subject =
    body.subject?.trim() ||
    `[Sécurité] ${incidents.length} incident(s) sur ${body.endpoint}`;

  const ticket = await createTicket({
    organizationId: body.organizationId,
    subject,
    description: summaryLines.join("\n"),
    status: "new",
    priority,
    type: "incident",
    source: "automation",
    creatorId: me.id,
    isInternal: false,
  });

  // Lie tous les incidents au nouveau ticket + passe en investigating.
  await prisma.securityIncident.updateMany({
    where: {
      id: { in: incidents.map((i) => i.id) },
      ticketId: null, // n'écrase pas un ticket existant
    },
    data: {
      ticketId: ticket.id,
      status: "investigating",
    },
  });

  return NextResponse.json(ticket, { status: 201 });
}
