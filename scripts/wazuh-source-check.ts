// Vérifie d'où viennent les alertes Wazuh actuellement ingérées.
import prisma from "../src/lib/prisma";

async function main() {
  // 1. Config API
  const apiCfg = await prisma.tenantSetting.findUnique({
    where: { key: "security.wazuh" },
  });
  console.log("=== Config API Wazuh ===");
  console.log(apiCfg?.value ? JSON.stringify(apiCfg.value, null, 2) : "(aucune config stockée)");

  // 2. Config email security folders
  const monitCfg = await prisma.tenantSetting.findUnique({
    where: { key: "monitoring.email" },
  });
  const mv = (monitCfg?.value as { mailbox?: string; securityFolders?: string[] } | null) ?? {};
  console.log("\n=== Config email (securityFolders) ===");
  console.log(`Mailbox : ${mv.mailbox ?? "(non configurée)"}`);
  console.log(`Security folders : ${JSON.stringify(mv.securityFolders ?? [])}`);

  // 3. Compte par source
  const bySource = await prisma.securityAlert.groupBy({
    by: ["source"],
    _count: { _all: true },
    orderBy: { _count: { source: "desc" } },
  });
  console.log("\n=== Alertes ingérées par source ===");
  for (const s of bySource) console.log(`  ${s.source}: ${s._count._all}`);

  // 4. Dernières 3 alertes Wazuh — date et source
  const recent = await prisma.securityAlert.findMany({
    where: { source: { startsWith: "wazuh" } },
    orderBy: { receivedAt: "desc" },
    take: 3,
    select: { source: true, title: true, receivedAt: true, endpoint: true },
  });
  console.log("\n=== 3 dernières alertes Wazuh ===");
  for (const r of recent) {
    console.log(
      `  [${r.source}] ${r.receivedAt.toISOString().slice(0, 19)}Z endpoint=${r.endpoint ?? "?"} · ${r.title.slice(0, 60)}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
