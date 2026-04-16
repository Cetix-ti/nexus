// ============================================================================
// PERSISTENCE INGEST ORCHESTRATOR
//
// Orchestre le pipeline complet pour un email syscollector :
//   1. Parse le sujet + body
//   2. Normalise le nom du soft
//   3. Résout l'organisation (via clientCode du hostname)
//   4. Cherche la whitelist (host → client → default)
//   5. Calcule la sévérité
//   6. Upsert SecurityAlert + SecurityIncident via correlator
//   7. Envoie l'email HTML aux destinataires configurés
//
// Retourne le IngestResult pour permettre à l'appelant de lier un messageId
// ou de logger. Non throw — les erreurs sont loggées.
// ============================================================================

import prisma from "@/lib/prisma";
import { parsePersistenceEmail } from "./parser";
import { normalizeSoftwareName } from "./normalize";
import { lookupPersistenceWhitelist } from "./whitelist";
import { computePersistenceSeverity } from "./severity";
import { sendPersistenceAlertEmail, type PersistenceEmailContext } from "./email";
import { ingestSecurityAlert, type IngestResult } from "../correlator";
import { resolveOrgByEndpoint, resolveOrgByText } from "../org-resolver";
import type { DecodedAlert } from "../types";

/**
 * Retourne null quand l'email ne matche pas le format persistence Wazuh
 * (subject invalide ou pas de soft extrait dans le body). L'appelant
 * peut alors tenter un décodeur plus générique.
 */
export async function ingestPersistenceEmail(opts: {
  subject: string;
  bodyPreview: string;
  messageId: string;
  receivedAt?: Date;
  /** Envoi notification email après ingestion (true par défaut). */
  sendEmail?: boolean;
}): Promise<IngestResult | null> {
  const parsed = parsePersistenceEmail({
    subject: opts.subject,
    bodyPreview: opts.bodyPreview,
  });
  if (!parsed) return null;
  if (!parsed.softwareName) return null;

  const softwareNormalized = normalizeSoftwareName(parsed.softwareName);

  // Résolution org : priorité au hostname (préfixe clientCode), fallback
  // sur scan complet du sujet/body (cas des hostnames custom).
  let organizationId: string | null = await resolveOrgByEndpoint(parsed.hostname);
  if (!organizationId) {
    organizationId = await resolveOrgByText(parsed.rawSubject, parsed.rawBodyPreview);
  }

  let organizationName: string | null = null;
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    organizationName = org?.name ?? null;
  }

  // Lookup whitelist
  const whitelist = await lookupPersistenceWhitelist({
    organizationId,
    hostname: parsed.hostname,
    softwareName: softwareNormalized,
  });
  const isWhitelisted = whitelist.level !== "none" && whitelist.allowed;

  const severity = computePersistenceSeverity({
    isWhitelisted,
    isServer: parsed.isServer,
    softwareNormalized,
  });

  // Corrélation : un incident par (org, endpoint, soft) — toutes les
  // détections successives du même soft sur le même poste s'agrègent.
  const orgKey = organizationId ?? "unknown";
  const endpointKey = parsed.hostname.toLowerCase() || "unknown";
  const softKey = softwareNormalized.toLowerCase();
  const correlationKey = `persistence:${orgKey}:${endpointKey}:${softKey}`;

  const versionSuffix = parsed.softwareVersion ? ` ${parsed.softwareVersion}` : "";
  const title = `${softwareNormalized}${versionSuffix} installé sur ${parsed.hostname}`;

  const summaryParts = [
    `Logiciel : ${parsed.softwareName}${versionSuffix}`,
    `Normalisé : ${softwareNormalized}`,
    `Poste : ${parsed.hostname}${parsed.ipAddress ? ` (${parsed.ipAddress})` : ""}`,
    `Règle Wazuh : ${parsed.ruleId} (niveau ${parsed.ruleLevel})`,
    `Whitelist : ${
      isWhitelisted
        ? `autorisé (${whitelist.level})${whitelist.notes ? ` — ${whitelist.notes}` : ""}`
        : whitelist.level === "none"
          ? "aucune règle trouvée"
          : `explicitement interdit (${whitelist.level})`
    }`,
  ];

  const decoded: DecodedAlert = {
    source: "wazuh_email",
    kind: "persistence_tool",
    severity,
    externalId: opts.messageId,
    organizationId,
    endpoint: parsed.hostname,
    software: softwareNormalized,
    title,
    summary: summaryParts.join("\n"),
    correlationKey,
    rawPayload: {
      subject: parsed.rawSubject,
      body: parsed.rawBodyPreview.slice(0, 4000),
      hostname: parsed.hostname,
      clientCode: parsed.clientCode,
      ipAddress: parsed.ipAddress,
      softwareName: parsed.softwareName,
      softwareNameNormalized: softwareNormalized,
      softwareVersion: parsed.softwareVersion,
      ruleId: parsed.ruleId,
      ruleLevel: parsed.ruleLevel,
      module: parsed.moduleName,
      ruleDescription: parsed.ruleDescription,
      isServer: parsed.isServer,
      whitelist,
    },
    occurredAt: opts.receivedAt,
    // On considère une alerte whitelisted comme "low priority" pour que
    // l'UI la relègue dans la section réduite par défaut.
    isLowPriority: isWhitelisted,
  };

  const ingestResult = await ingestSecurityAlert(decoded);
  if (!ingestResult) return null;

  // Envoi courriel — trois gates :
  //   1. L'appelant n'a pas explicitement désactivé l'envoi (sendEmail !== false)
  //   2. L'alerte est nouvelle (dédup par externalId — pas de spam sur répétition)
  //   3. L'alerte n'est PAS whitelistée — si le soft est autorisé, aucun
  //      email n'est envoyé. L'alerte reste persistée (info + isLowPriority)
  //      pour traçabilité, mais plus de notification.
  if (opts.sendEmail !== false && ingestResult.isNew && !isWhitelisted) {
    try {
      const emailCtx: PersistenceEmailContext = {
        hostname: parsed.hostname,
        clientCode: parsed.clientCode,
        clientName: organizationName ?? parsed.clientCode,
        ipAddress: parsed.ipAddress,
        softwareName: parsed.softwareName,
        softwareNameNormalized: softwareNormalized,
        softwareVersion: parsed.softwareVersion,
        severity,
        detectionTime: opts.receivedAt ?? new Date(),
        ruleId: parsed.ruleId,
        ruleLevel: parsed.ruleLevel,
        module: parsed.moduleName,
        rawSubject: parsed.rawSubject,
        rawDescription: parsed.ruleDescription,
        whitelistAllowed: isWhitelisted ? "yes" : whitelist.level === "none" ? "no" : "never",
        whitelistLevel: whitelist.level,
        whitelistNotes: whitelist.notes ?? "",
        alertId: ingestResult.alertId,
      };
      await sendPersistenceAlertEmail(emailCtx);
    } catch (err) {
      // Non bloquant — l'alerte est persistée même si l'email échoue.
      console.error("[persistence] sendPersistenceAlertEmail failed:", err);
    }
  }

  return ingestResult;
}
