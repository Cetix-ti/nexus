/**
 * Nettoie les doublons déjà présents en base :
 *   1. Pour chaque alertGroupKey, garde l'alerte la plus ANCIENNE ouverte,
 *      marque les autres (même groupe, non-résolu) comme IGNORED.
 *   2. Pour toute alerte résolue avec ticket non fermé, passe le ticket
 *      en RESOLVED.
 *   3. Rapporte combien de tickets monitoring polluent le dashboard principal.
 *
 * Run dry : npx tsx scripts/cleanup-monitoring-duplicates.ts --dry
 * Apply   : npx tsx scripts/cleanup-monitoring-duplicates.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus",
);
const prisma = new PrismaClient({ adapter });
const DRY = process.argv.includes("--dry");

async function main() {
  // 1) Dédoublonnage par alertGroupKey
  const open = await prisma.monitoringAlert.findMany({
    where: { isResolved: false, alertGroupKey: { not: null } },
    select: { id: true, alertGroupKey: true, receivedAt: true, ticketId: true, subject: true },
    orderBy: { receivedAt: "asc" },
  });

  const byGroup = new Map<string, typeof open>();
  for (const a of open) {
    if (!a.alertGroupKey) continue;
    const list = byGroup.get(a.alertGroupKey) ?? [];
    list.push(a);
    byGroup.set(a.alertGroupKey, list);
  }

  let dupAlerts = 0;
  let ticketsClosed = 0;
  for (const [key, list] of byGroup) {
    if (list.length <= 1) continue;
    // Garde le plus ancien, ferme le reste
    const [keep, ...dupes] = list;
    console.log(`\n[${key}] ${list.length} alertes — garde ${keep.id}, ferme ${dupes.length}`);
    for (const d of dupes) {
      dupAlerts++;
      if (!DRY) {
        await prisma.monitoringAlert.update({
          where: { id: d.id },
          data: { stage: "IGNORED", isResolved: true, resolvedAt: new Date() },
        });
        if (d.ticketId) {
          await prisma.ticket.update({
            where: { id: d.ticketId },
            data: { status: "CANCELLED", resolvedAt: new Date(), monitoringStage: "IGNORED" },
          });
          ticketsClosed++;
        }
      }
    }
  }

  // 2) Tickets orphelins : alerte résolue mais ticket actif
  const resolvedAlerts = await prisma.monitoringAlert.findMany({
    where: { isResolved: true, ticketId: { not: null } },
    select: { ticketId: true, resolvedAt: true },
  });
  const resolvedTicketIds = resolvedAlerts
    .map((a) => a.ticketId)
    .filter((x): x is string => !!x);

  const activeTickets = await prisma.ticket.findMany({
    where: {
      id: { in: resolvedTicketIds },
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
    select: { id: true, number: true },
  });

  console.log(
    `\n${activeTickets.length} tickets monitoring encore actifs malgré alerte résolue.`,
  );
  if (!DRY && activeTickets.length > 0) {
    await prisma.ticket.updateMany({
      where: { id: { in: activeTickets.map((t) => t.id) } },
      data: { status: "RESOLVED", resolvedAt: new Date(), monitoringStage: "RESOLVED" },
    });
    console.log(`  ✓ Résolus.`);
    ticketsClosed += activeTickets.length;
  }

  // 3) Statistiques finales
  const stats = await prisma.monitoringAlert.groupBy({
    by: ["stage"],
    where: { messageKind: "ALERT" },
    _count: true,
  });
  console.log("\nÉtat final des alertes ALERT:");
  for (const s of stats) console.log(`  ${s.stage}: ${s._count}`);

  const monitoringTickets = await prisma.ticket.count({
    where: {
      OR: [{ source: "MONITORING" }, { type: "ALERT" }],
    },
  });
  const activeMonitoringTickets = await prisma.ticket.count({
    where: {
      OR: [{ source: "MONITORING" }, { type: "ALERT" }],
      status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
    },
  });
  console.log(
    `\nTickets monitoring : ${monitoringTickets} total, ${activeMonitoringTickets} actifs.`,
  );

  console.log(
    `\nRésumé : ${dupAlerts} alertes dupliquées marquées IGNORED, ${ticketsClosed} tickets fermés (${DRY ? "DRY" : "APPLIED"}).`,
  );
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
