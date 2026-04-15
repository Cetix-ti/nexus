/**
 * Reclasse les MonitoringAlert déjà en base selon les patterns de
 * notification (commentaires d'automatisation Atera, digests, etc.).
 * Les matches → messageKind = "NOTIFICATION". Le reste reste "ALERT".
 *
 * Run: npx tsx scripts/reclassify-monitoring-kind.ts
 * Dry : npx tsx scripts/reclassify-monitoring-kind.ts --dry
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus";
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const DRY = process.argv.includes("--dry");

function classifyMessageKind(subject: string, body: string): "ALERT" | "NOTIFICATION" {
  const s = subject.toLowerCase();
  const b = body.slice(0, 500).toLowerCase();
  const text = `${s}\n${b}`;

  if (
    /commentaires?\s+sur\s+les?\s+t[âa]ches?\s+d[’']?automatisation/i.test(text) ||
    /(it\s+)?automation\s+profile\s+comment/i.test(text) ||
    /task\s+comment/i.test(text) ||
    /a\s+comment(\s+has\s+been)?\s+(added|posted)\s+to/i.test(text)
  ) {
    return "NOTIFICATION";
  }
  if (
    /\(select\s+endpoint\s+manually\)/i.test(text) ||
    /it\s+automation\s+profile\b/i.test(text) ||
    /automation\s+profile\s+(was|has\s+been)\s+(updated|created|shared)/i.test(text)
  ) {
    return "NOTIFICATION";
  }
  if (
    /daily\s+(report|summary|digest)/i.test(text) ||
    /weekly\s+(report|summary|digest)/i.test(text) ||
    /r[ée]sum[ée]\s+(quotidien|hebdomadaire)/i.test(text)
  ) {
    return "NOTIFICATION";
  }
  if (
    /\b(welcome|bienvenue)\b/i.test(s) ||
    /\bnewsletter\b/i.test(s) ||
    /password\s+(reset|change)/i.test(s) ||
    /new\s+login\s+(detected|from)/i.test(s) ||
    /(account|compte)\s+(created|activated)/i.test(s)
  ) {
    return "NOTIFICATION";
  }
  return "ALERT";
}

async function main() {
  const rows = await prisma.monitoringAlert.findMany({
    select: { id: true, subject: true, body: true, messageKind: true },
  });
  console.log(`Total alerts in DB: ${rows.length}`);

  const updates: Array<{ id: string; from: string; subject: string }> = [];
  for (const r of rows) {
    const kind = classifyMessageKind(r.subject, r.body ?? "");
    if (kind !== r.messageKind) {
      updates.push({ id: r.id, from: r.messageKind, subject: r.subject });
    }
  }

  console.log(
    `${updates.length} alerts à reclasser (${DRY ? "DRY RUN" : "APPLY"}):\n`,
  );
  for (const u of updates.slice(0, 30)) {
    console.log(`  ${u.from} → NOTIFICATION  |  ${u.subject.slice(0, 80)}`);
  }
  if (updates.length > 30) console.log(`  ... et ${updates.length - 30} autres`);

  if (!DRY && updates.length > 0) {
    await prisma.monitoringAlert.updateMany({
      where: { id: { in: updates.map((u) => u.id) } },
      data: { messageKind: "NOTIFICATION" },
    });
    console.log(`\nReclassé ${updates.length} alertes.`);
  }

  // Stats finales
  const stats = await prisma.monitoringAlert.groupBy({
    by: ["messageKind"],
    _count: true,
  });
  console.log("\nRépartition par messageKind:");
  for (const s of stats) {
    console.log(`  ${s.messageKind}: ${s._count}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
