// Applique rétroactivement les mots-clés "downgrade" configurés dans
// security.wazuh aux alertes et incidents Wazuh déjà ingérés. Ré-exécuter
// après chaque changement de la liste de keywords côté Paramètres.

import prisma from "../src/lib/prisma";
import { getWazuhConfig } from "../src/lib/security-center/wazuh-client";

async function main() {
  const cfg = await getWazuhConfig();
  if (!cfg.downgradeKeywords || cfg.downgradeKeywords.length === 0) {
    console.log("Aucun mot-clé configuré — abandon.");
    return;
  }
  const keywords = cfg.downgradeKeywords.map((k) => k.toLowerCase());
  console.log(`Mots-clés downgrade : ${keywords.join(", ")}`);

  // On examine les alertes Wazuh (email + API) non déjà downgradées.
  // Pour chacune, on check titre + summary + rawPayload.body/description.
  const alerts = await prisma.securityAlert.findMany({
    where: { source: { startsWith: "wazuh" } },
    select: { id: true, title: true, summary: true, rawPayload: true, isLowPriority: true, incidentId: true },
  });
  console.log(`Alertes Wazuh à examiner : ${alerts.length}`);

  let alertsUpdated = 0;
  const affectedIncidents = new Set<string>();
  for (const a of alerts) {
    const body = (a.rawPayload as { body?: string; rule?: { description?: string } } | null) ?? {};
    const haystack = `${a.title ?? ""}\n${a.summary ?? ""}\n${body.body ?? ""}\n${body.rule?.description ?? ""}`.toLowerCase();
    const shouldBeLow = keywords.some((k) => haystack.includes(k));
    if (shouldBeLow !== a.isLowPriority) {
      await prisma.securityAlert.update({
        where: { id: a.id },
        data: { isLowPriority: shouldBeLow },
      });
      alertsUpdated++;
      if (a.incidentId) affectedIncidents.add(a.incidentId);
    }
  }

  // Recalcule isLowPriority sur les incidents touchés. Règle : un
  // incident est low-priority si TOUTES ses alertes le sont (on ne
  // rétrograde pas un incident qui a aussi reçu une alerte importante).
  let incidentsUpdated = 0;
  for (const incId of affectedIncidents) {
    const alerts = await prisma.securityAlert.findMany({
      where: { incidentId: incId },
      select: { isLowPriority: true },
    });
    if (alerts.length === 0) continue;
    const allLow = alerts.every((x) => x.isLowPriority);
    const current = await prisma.securityIncident.findUnique({
      where: { id: incId },
      select: { isLowPriority: true },
    });
    if (!current) continue;
    if (current.isLowPriority !== allLow) {
      await prisma.securityIncident.update({
        where: { id: incId },
        data: { isLowPriority: allLow },
      });
      incidentsUpdated++;
    }
  }

  console.log(`✓ ${alertsUpdated} alertes rétro-marquées, ${incidentsUpdated} incidents mis à jour.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
