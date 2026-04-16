// Re-décode tous les WORK_LOCATION existants avec la logique la plus
// récente (tolère les horaires, match partiel, etc.). Met à jour :
//   - CalendarEventAgent (jointure multi-agents)
//   - ownerId
//   - organizationId
//   - syncStatus / syncError
//
// Usage:
//   npx tsx scripts/rebackfill-location-events.ts
//
// Idempotent — ne re-écrit que ce qui change.

import prisma from "../src/lib/prisma";
import { decodeLocationTitle, type DecodableAgent, type DecodableOrg } from "../src/lib/calendar/location-decoder";

async function main() {
  const agents: DecodableAgent[] = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR", "TECHNICIAN"] },
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });

  const orgs: DecodableOrg[] = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      clientCode: true,
      isInternal: true,
      domain: true,
      domains: true,
      calendarAliases: true,
    },
  });

  const events = await prisma.calendarEvent.findMany({
    where: { kind: "WORK_LOCATION" },
    select: {
      id: true,
      title: true,
      rawTitle: true,
      syncStatus: true,
      ownerId: true,
      organizationId: true,
      agents: { select: { userId: true } },
    },
  });

  console.log(`Events WORK_LOCATION : ${events.length}`);

  let nowOk = 0;
  let stillUndecoded = 0;
  let unchanged = 0;
  let partial = 0;

  for (const e of events) {
    const title = e.rawTitle || e.title;
    const decoded = decodeLocationTitle(title, agents, orgs);
    const prevAgentIds = e.agents.map((a) => a.userId).sort();

    if (!decoded.ok) {
      // Pas décodable — marque UNDECODED si pas déjà.
      if (e.syncStatus !== "UNDECODED") {
        await prisma.calendarEvent.update({
          where: { id: e.id },
          data: { syncStatus: "UNDECODED", syncError: decoded.message },
        });
      }
      stillUndecoded++;
      continue;
    }

    const newAgentIds = decoded.agents.map((a) => a.id).sort();
    const newOwnerId = decoded.agents[0]?.id ?? null;
    const newOrgId = decoded.organizationId;
    const isPartial =
      (decoded.unknownAgentTokens?.length ?? 0) > 0 ? true : false;
    const syncError = isPartial
      ? `Partiel : initiales inconnues ignorées → ${decoded.unknownAgentTokens!.join(", ")}`
      : null;

    const agentsUnchanged =
      prevAgentIds.length === newAgentIds.length &&
      prevAgentIds.every((id, i) => id === newAgentIds[i]);
    const ownerUnchanged = e.ownerId === newOwnerId;
    const orgUnchanged = e.organizationId === newOrgId;
    const statusAlreadyOk = e.syncStatus === "OK";

    if (agentsUnchanged && ownerUnchanged && orgUnchanged && statusAlreadyOk) {
      unchanged++;
      continue;
    }

    // Remet la jointure à jour
    await prisma.calendarEventAgent.deleteMany({ where: { eventId: e.id } });
    if (newAgentIds.length > 0) {
      await prisma.calendarEventAgent.createMany({
        data: newAgentIds.map((userId) => ({ eventId: e.id, userId })),
        skipDuplicates: true,
      });
    }
    await prisma.calendarEvent.update({
      where: { id: e.id },
      data: {
        ownerId: newOwnerId,
        organizationId: newOrgId,
        syncStatus: "OK",
        syncError,
      },
    });
    if (isPartial) partial++;
    else nowOk++;
  }

  console.log(`\n  OK (complet) : ${nowOk}`);
  console.log(`  OK (partiel) : ${partial}`);
  console.log(`  toujours UNDECODED : ${stillUndecoded}`);
  console.log(`  inchangés : ${unchanged}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
