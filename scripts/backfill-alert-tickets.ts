/**
 * Crée un ticket pour chaque MonitoringAlert de type ALERT qui n'en a
 * pas encore. Les NOTIFICATION sont ignorées. Les alertes résolues sont
 * aussi passées (on crée un ticket fermé) pour garder la traçabilité.
 *
 * Run dry : npx tsx scripts/backfill-alert-tickets.ts --dry
 * Apply   : npx tsx scripts/backfill-alert-tickets.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus",
);
const prisma = new PrismaClient({ adapter });
const DRY = process.argv.includes("--dry");

async function main() {
  const syncAgent = await prisma.user.findFirst({
    where: {
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "TECHNICIAN"] },
      isActive: true,
    },
    select: { id: true, email: true },
  });
  if (!syncAgent) {
    console.error("Aucun agent actif trouvé.");
    return;
  }
  console.log(`Agent créateur : ${syncAgent.email}\n`);

  const alerts = await prisma.monitoringAlert.findMany({
    where: {
      messageKind: "ALERT",
      ticketId: null,
      organizationId: { not: null },
    },
    select: {
      id: true,
      organizationId: true,
      sourceType: true,
      severity: true,
      subject: true,
      body: true,
      senderEmail: true,
      receivedAt: true,
      isResolved: true,
    },
    orderBy: { receivedAt: "desc" },
  });

  console.log(`${alerts.length} alertes sans ticket.\n`);

  if (DRY) {
    for (const a of alerts.slice(0, 20)) {
      console.log(`  ${a.sourceType.padEnd(8)} [${a.severity.padEnd(8)}] ${a.subject.slice(0, 90)}`);
    }
    if (alerts.length > 20) console.log(`  ... et ${alerts.length - 20} autres`);
    console.log("\nDry run — rien écrit. Passer sans --dry pour appliquer.");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let failed = 0;

  for (const a of alerts) {
    if (!a.organizationId) continue;
    try {
      const ticket = await prisma.ticket.create({
        data: {
          organizationId: a.organizationId,
          creatorId: syncAgent.id,
          subject: `[Monitoring] ${a.subject}`,
          description:
            `Alerte ${a.sourceType.toUpperCase()} reçue le ${a.receivedAt.toLocaleString("fr-CA")}.\n\n` +
            `Expéditeur : ${a.senderEmail}\n\n` +
            (a.body ?? "").slice(0, 2000),
          status: a.isResolved ? "RESOLVED" : "NEW",
          priority:
            a.severity === "CRITICAL"
              ? "CRITICAL"
              : a.severity === "HIGH"
              ? "HIGH"
              : "MEDIUM",
          type: "ALERT",
          source: "MONITORING",
          monitoringStage: a.isResolved ? "RESOLVED" : "TRIAGE",
        },
        select: { id: true },
      });
      await prisma.monitoringAlert.update({
        where: { id: a.id },
        data: { ticketId: ticket.id },
      });
      created++;
      if (created % 20 === 0) console.log(`  ${created}/${alerts.length}...`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${a.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n✓ ${created} tickets créés, ${failed} échecs.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
