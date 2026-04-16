// One-off — seed les relations de supervision demandées :
//   Bruno Robert → Jacques Thibault, Vincent Gazaille
//   Simon Fréchette → Maeva Vigier
//
// Idempotent : skip si la relation existe déjà.

import prisma from "@/lib/prisma";

const PAIRS: Array<{ supervisor: string; agent: string }> = [
  { supervisor: "bruno.robert@cetix.ca", agent: "jacques.thibault@cetix.ca" },
  { supervisor: "bruno.robert@cetix.ca", agent: "vincent.gazaille@cetix.ca" },
  { supervisor: "simon.frechette@cetix.ca", agent: "maeva.vigier@cetix.ca" },
];

async function main() {
  for (const pair of PAIRS) {
    const sup = await prisma.user.findUnique({
      where: { email: pair.supervisor },
      select: { id: true, firstName: true, lastName: true },
    });
    const agt = await prisma.user.findUnique({
      where: { email: pair.agent },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!sup) {
      console.warn(`✗ Superviseur "${pair.supervisor}" introuvable`);
      continue;
    }
    if (!agt) {
      console.warn(`✗ Agent "${pair.agent}" introuvable`);
      continue;
    }
    const existing = await prisma.agentSupervision.findUnique({
      where: { supervisorId_agentId: { supervisorId: sup.id, agentId: agt.id } },
    });
    if (existing) {
      console.log(`  ${sup.firstName} ${sup.lastName} → ${agt.firstName} ${agt.lastName} — déjà en place`);
      continue;
    }
    await prisma.agentSupervision.create({
      data: { supervisorId: sup.id, agentId: agt.id },
    });
    console.log(`✓ ${sup.firstName} ${sup.lastName} → ${agt.firstName} ${agt.lastName}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
