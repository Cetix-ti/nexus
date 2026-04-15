import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg(process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus");
const prisma = new PrismaClient({ adapter });
async function main() {
  const count = await prisma.timeEntry.count();
  const last = await prisma.timeEntry.findMany({
    orderBy: { createdAt: "desc" }, take: 5,
    select: { id: true, ticketId: true, agentId: true, durationMinutes: true, timeType: true, startedAt: true, createdAt: true, description: true },
  });
  console.log(`Total time entries: ${count}`);
  for (const t of last) {
    console.log(`  ${t.createdAt.toISOString()} | ticket=${t.ticketId.slice(0,8)} agent=${t.agentId.slice(0,8)} ${t.durationMinutes}min ${t.timeType} | "${(t.description||"").slice(0,40)}"`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
