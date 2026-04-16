// Ré-extrait l'endpoint (et remappe l'organisation) pour les alertes
// Wazuh déjà en DB dont endpoint == null. Utilise le décodeur Wazuh à
// jour sur le rawPayload.body stocké.
//
// Met à jour l'alerte ET l'incident parent (endpoint, organizationId,
// correlationKey — mais on NE MODIFIE PAS correlationKey pour ne pas
// casser les groupements existants ; on met juste à jour l'info
// d'affichage).

import prisma from "../src/lib/prisma";
import { decodeWazuhEmail } from "../src/lib/security-center/decoders/wazuh";

async function main() {
  const alerts = await prisma.securityAlert.findMany({
    where: {
      source: "wazuh_email",
      OR: [{ endpoint: null }, { organizationId: null }],
    },
    select: { id: true, rawPayload: true, incidentId: true, externalId: true, title: true, receivedAt: true },
  });
  console.log(`Alertes à ré-examiner : ${alerts.length}`);

  let updatedAlerts = 0;
  const incidentsToUpdate = new Map<string, { endpoint?: string | null; organizationId?: string | null }>();

  for (const a of alerts) {
    const payload = a.rawPayload as { subject?: string; body?: string } | null;
    if (!payload?.body) continue;
    const decoded = await decodeWazuhEmail({
      subject: payload.subject ?? a.title,
      bodyPlain: payload.body,
      fromEmail: "",
      messageId: a.externalId ?? a.id,
      receivedAt: a.receivedAt,
    });
    if (!decoded) continue;
    const patch: Record<string, unknown> = {};
    if (decoded.endpoint) patch.endpoint = decoded.endpoint;
    if (decoded.organizationId) patch.organizationId = decoded.organizationId;
    if (Object.keys(patch).length === 0) continue;

    await prisma.securityAlert.update({ where: { id: a.id }, data: patch });
    updatedAlerts++;
    if (a.incidentId) {
      const existing = incidentsToUpdate.get(a.incidentId) ?? {};
      incidentsToUpdate.set(a.incidentId, {
        endpoint: existing.endpoint ?? decoded.endpoint ?? null,
        organizationId: existing.organizationId ?? decoded.organizationId ?? null,
      });
    }
  }

  let updatedIncidents = 0;
  for (const [id, patch] of incidentsToUpdate) {
    const data: Record<string, unknown> = {};
    if (patch.endpoint) data.endpoint = patch.endpoint;
    if (patch.organizationId) data.organizationId = patch.organizationId;
    if (Object.keys(data).length === 0) continue;
    await prisma.securityIncident.update({ where: { id }, data });
    updatedIncidents++;
  }

  console.log(`✓ ${updatedAlerts} alertes + ${updatedIncidents} incidents mis à jour.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
