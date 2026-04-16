// ============================================================================
// SECURITY CORRELATOR — agrège plusieurs DecodedAlert en un SecurityIncident.
//
// Règle de base : on upsert `SecurityAlert` (unique sur source+externalId),
// puis on upsert `SecurityIncident` sur `correlationKey`. L'occurrenceCount
// incrémente à chaque nouvelle alerte ; le `lastSeenAt` est mis à jour ;
// la sévérité max est conservée (critical > high > warning > info).
//
// Idempotent : ré-ingestion d'un même externalId ne crée pas de doublon
// (upsert via la contrainte unique composée), et n'incrémente pas non plus
// l'occurrenceCount.
// ============================================================================

import prisma from "@/lib/prisma";
import type { DecodedAlert, SecuritySeverity } from "./types";

const SEVERITY_RANK: Record<SecuritySeverity, number> = {
  info: 0,
  warning: 1,
  high: 2,
  critical: 3,
};

function maxSeverity(
  a?: SecuritySeverity | null,
  b?: SecuritySeverity | null,
): SecuritySeverity | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export interface IngestResult {
  alertId: string;
  incidentId: string;
  /** `true` si l'alerte externalId était nouvelle (premier ingest). */
  isNew: boolean;
}

/**
 * Point d'entrée unique — accepte une DecodedAlert, écrit/retrouve l'alerte
 * brute et l'incident corrélé, et renvoie leurs ids. Jamais throw (les
 * erreurs sont loggées ; on retourne null).
 */
export async function ingestSecurityAlert(
  decoded: DecodedAlert,
): Promise<IngestResult | null> {
  try {
    // 1. Upsert SecurityAlert (dédup par source+externalId si présent).
    //    Si pas d'externalId, on crée tel quel — moins idempotent mais
    //    acceptable pour les sources qui n'ont pas d'id stable.
    let alert = null as Awaited<ReturnType<typeof prisma.securityAlert.findFirst>>;
    if (decoded.externalId) {
      alert = await prisma.securityAlert.findUnique({
        where: { source_externalId: { source: decoded.source, externalId: decoded.externalId } },
      });
    }
    const isNew = !alert;

    if (!alert) {
      alert = await prisma.securityAlert.create({
        data: {
          source: decoded.source,
          kind: decoded.kind,
          severity: decoded.severity ?? null,
          externalId: decoded.externalId ?? null,
          organizationId: decoded.organizationId ?? null,
          endpoint: decoded.endpoint ?? null,
          userPrincipal: decoded.userPrincipal ?? null,
          title: decoded.title,
          summary: decoded.summary ?? null,
          rawPayload: (decoded.rawPayload ?? null) as never,
          correlationKey: decoded.correlationKey,
          receivedAt: decoded.occurredAt ?? new Date(),
          isLowPriority: !!decoded.isLowPriority,
        },
      });
    }

    // 2. Upsert SecurityIncident (unique sur correlationKey).
    const existingIncident = await prisma.securityIncident.findUnique({
      where: { correlationKey: decoded.correlationKey },
    });

    let incident = existingIncident;
    if (!incident) {
      incident = await prisma.securityIncident.create({
        data: {
          source: decoded.source,
          kind: decoded.kind,
          severity: decoded.severity ?? null,
          organizationId: decoded.organizationId ?? null,
          endpoint: decoded.endpoint ?? null,
          userPrincipal: decoded.userPrincipal ?? null,
          software: decoded.software ?? null,
          cveId: decoded.cveId ?? null,
          title: decoded.title,
          summary: decoded.summary ?? null,
          correlationKey: decoded.correlationKey,
          occurrenceCount: 1,
          firstSeenAt: alert.receivedAt,
          lastSeenAt: alert.receivedAt,
          metadata: null as never,
          isLowPriority: !!decoded.isLowPriority,
        },
      });
    } else if (isNew && existingIncident) {
      // Nouvelle alerte pour un incident existant → incrémente le compteur,
      // remonte la sévérité si la nouvelle est plus élevée.
      const prev = existingIncident;
      const nextSeverity = maxSeverity(
        (prev.severity as SecuritySeverity | null) ?? null,
        decoded.severity ?? null,
      );
      incident = await prisma.securityIncident.update({
        where: { id: prev.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: alert.receivedAt,
          severity: nextSeverity,
          // Si l'incident était fermé mais qu'une nouvelle alerte arrive,
          // on le rouvre automatiquement — un lockout qui recommence doit
          // attirer l'attention.
          ...(prev.status === "resolved" || prev.status === "closed"
            ? { status: "open" }
            : {}),
        },
      });
    }

    // 3. Lie l'alerte à son incident (seulement si pas déjà liée).
    if (alert.incidentId !== incident.id) {
      await prisma.securityAlert.update({
        where: { id: alert.id },
        data: { incidentId: incident.id },
      });
    }

    return { alertId: alert.id, incidentId: incident.id, isNew };
  } catch (err) {
    console.error("[security-correlator] ingestion failed:", err);
    return null;
  }
}
