// One-off — re-résout l'organisation pour les alertes/incidents de
// persistence qui sont actuellement orphelins (organizationId=null).
// Utile après avoir étendu la regex d'extraction de clientCode ou après
// avoir ajouté un alias/clientCode sur une organisation existante.
//
// Ne touche pas aux alertes déjà mappées — idempotent.

import prisma from "@/lib/prisma";
import {
  resolveOrgByEndpoint,
  resolveOrgByEndpointPattern,
  resolveOrgByText,
  resolveOrgByHostOrIp,
} from "@/lib/security-center/org-resolver";

async function main() {
  const unmapped = await prisma.securityAlert.findMany({
    where: {
      kind: "persistence_tool",
      organizationId: null,
    },
    select: {
      id: true,
      endpoint: true,
      title: true,
      summary: true,
      rawPayload: true,
      incidentId: true,
      correlationKey: true,
    },
  });

  console.log(`${unmapped.length} alertes persistence sans organisation à retenter.`);
  let fixed = 0;

  for (const a of unmapped) {
    const payload = (a.rawPayload ?? {}) as Record<string, unknown>;
    const subject = String(payload.subject ?? a.title ?? "");
    const body = String(payload.body ?? a.summary ?? "");

    const ip = String((payload.ipAddress as string) ?? "").trim() || null;
    let orgId: string | null = null;
    if (a.endpoint) orgId = await resolveOrgByEndpoint(a.endpoint);
    if (!orgId && a.endpoint) orgId = await resolveOrgByEndpointPattern(a.endpoint);
    if (!orgId) orgId = await resolveOrgByText(subject, body);
    if (!orgId && (a.endpoint || ip)) {
      orgId = await resolveOrgByHostOrIp(a.endpoint, ip);
    }

    if (!orgId) continue;

    // Reconstruit la clé de corrélation avec l'org (l'ancienne contenait "unknown")
    const endpointKey = (a.endpoint ?? "unknown").toLowerCase();
    const softRaw = String(payload.softwareNameNormalized ?? payload.softwareName ?? "unknown").toLowerCase();
    const newKey = `persistence:${orgId}:${endpointKey}:${softRaw}`;

    await prisma.securityAlert.update({
      where: { id: a.id },
      data: { organizationId: orgId, correlationKey: newKey },
    });

    if (a.incidentId) {
      // Cherche si un incident matche déjà la nouvelle clé. Si oui on
      // rattache l'alerte à cet incident existant ; sinon on met à jour
      // l'incident actuel avec le nouvel orgId + clé.
      const existingMatch = await prisma.securityIncident.findUnique({
        where: { correlationKey: newKey },
      });
      if (existingMatch && existingMatch.id !== a.incidentId) {
        await prisma.securityAlert.update({
          where: { id: a.id },
          data: { incidentId: existingMatch.id },
        });
        await prisma.securityIncident.update({
          where: { id: existingMatch.id },
          data: { occurrenceCount: { increment: 1 } },
        });
      } else {
        await prisma.securityIncident.update({
          where: { id: a.incidentId },
          data: { organizationId: orgId, correlationKey: newKey },
        }).catch(() => { /* conflict de clé — ignore */ });
      }
    }

    fixed++;
    console.log(`  ${a.endpoint} → org ${orgId}`);
  }

  console.log(`\n${fixed} alertes re-mappées.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
