// Affiche quelques alertes Wazuh récentes pour comprendre le format réel
// et ajuster l'extraction de l'endpoint.

import prisma from "../src/lib/prisma";

async function main() {
  const alerts = await prisma.securityAlert.findMany({
    where: { source: "wazuh_email" },
    orderBy: { receivedAt: "desc" },
    take: 3,
  });
  for (const a of alerts) {
    console.log("\n====", a.title, "====");
    console.log("endpoint:", a.endpoint);
    console.log("summary:", a.summary?.slice(0, 400));
    console.log("rawPayload:", JSON.stringify(a.rawPayload, null, 2).slice(0, 2000));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
