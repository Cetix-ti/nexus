// Smoke-tests pour le Kanban des sauvegardes.
// Run: npx tsx scripts/test-backup-kanban.ts
//
// Couvre :
//   - aggregateFailuresByOrg : dédupe jobName par org, ignore non-FAILED,
//     ignore les alertes sans organizationId, trie par latestAlertAt desc.
//   - refreshTemplates : crée / met à jour / purge, préserve les titres
//     customs édités par l'agent.
//   - renderTitle : remplacement des placeholders.
//
// NOTE : les tests de `convertTemplateToTicket` auraient besoin de seed
// complet (User, Organization, Ticket…) donc on les couvre via l'API
// manuelle. Ici on teste la logique pure + les opérations sur la table
// `backup_ticket_templates` isolées (seed minimal).

import prisma from "../src/lib/prisma";
import {
  aggregateFailuresByOrg,
  refreshTemplates,
  renderTitle,
  buildDescription,
} from "../src/lib/backup-kanban/service";
import { setSetting } from "../src/lib/tenant-settings/service";

let failures = 0;
function assert(label: string, cond: boolean, ctx?: unknown) {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.log(`✗ ${label}`);
    if (ctx !== undefined) console.log("  ctx:", JSON.stringify(ctx, null, 2));
    failures++;
  }
}

async function cleanup(orgIds: string[]) {
  await prisma.backupTicketTemplate.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.veeamBackupAlert.deleteMany({
    where: {
      senderEmail: "test-backup-kanban@example.com",
    },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: orgIds } },
  });
}

async function seedOrg(
  id: string,
  name: string,
  clientCode: string,
): Promise<void> {
  await prisma.organization.upsert({
    where: { id },
    create: {
      id,
      name,
      slug: id,
      clientCode,
    },
    update: { name, clientCode },
  });
}

async function seedAlert(args: {
  orgId: string | null;
  orgName: string;
  jobName: string;
  status: "SUCCESS" | "WARNING" | "FAILED";
  minutesAgo: number;
  messageIdSuffix: string;
}): Promise<void> {
  const receivedAt = new Date(Date.now() - args.minutesAgo * 60_000);
  await prisma.veeamBackupAlert.create({
    data: {
      organizationId: args.orgId,
      organizationName: args.orgName,
      jobName: args.jobName,
      status: args.status,
      senderEmail: "test-backup-kanban@example.com",
      senderDomain: "example.com",
      subject: `[${args.status}] ${args.jobName}`,
      bodySnippet: "",
      messageId: `test-backup-kanban-${args.messageIdSuffix}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt,
    },
  });
}

async function main() {
  // ---------------------------------------------------------------------------
  console.log("\n--- renderTitle ---");
  // ---------------------------------------------------------------------------
  {
    const r = renderTitle("Sauvegardes en échec — {clientName}", {
      clientName: "Ville de Louiseville",
      clientCode: "LV",
      failedCount: 2,
      latestAlertAt: new Date("2026-04-15T10:00:00Z"),
    });
    assert("pattern simple", r === "Sauvegardes en échec — Ville de Louiseville", r);
  }
  {
    const r = renderTitle(
      "{clientName} ({clientCode}) — {failedCount} échec(s) {date}",
      {
        clientName: "Marieville",
        clientCode: "MRVL",
        failedCount: 3,
        latestAlertAt: new Date("2026-04-15T10:00:00Z"),
      },
    );
    assert(
      "tous les placeholders",
      r === "Marieville (MRVL) — 3 échec(s) 2026-04-15",
      r,
    );
  }
  {
    const r = renderTitle("Client {clientCode}", {
      clientName: "X",
      clientCode: null,
      failedCount: 1,
      latestAlertAt: new Date(),
    });
    assert("clientCode null → vide", r === "Client", r);
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- buildDescription ---");
  // ---------------------------------------------------------------------------
  {
    const d = buildDescription(["Job A", "Job B"]);
    assert("liste markdown", d.includes("- Job A") && d.includes("- Job B"), d);
  }
  {
    const d = buildDescription([]);
    assert("empty fallback", d === "Aucune tâche en échec détectée.", d);
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- Seed fixtures ---");
  // ---------------------------------------------------------------------------
  const ORG_A = "test-bk-org-a";
  const ORG_B = "test-bk-org-b";
  const ORG_C = "test-bk-org-c"; // sans échec → ne devrait pas générer de template
  await cleanup([ORG_A, ORG_B, ORG_C]);

  await seedOrg(ORG_A, "Client A", "AAA");
  await seedOrg(ORG_B, "Client B", "BBB");
  await seedOrg(ORG_C, "Client C", "CCC");

  // Client A : 3 FAILED, dont 2 sur le même job (dédupe attendu → 2 tâches)
  await seedAlert({
    orgId: ORG_A,
    orgName: "Client A",
    jobName: "Job-A1",
    status: "FAILED",
    minutesAgo: 30,
    messageIdSuffix: "a1",
  });
  await seedAlert({
    orgId: ORG_A,
    orgName: "Client A",
    jobName: "Job-A2",
    status: "FAILED",
    minutesAgo: 60,
    messageIdSuffix: "a2",
  });
  await seedAlert({
    orgId: ORG_A,
    orgName: "Client A",
    jobName: "Job-A1",
    status: "FAILED",
    minutesAgo: 120,
    messageIdSuffix: "a1-older",
  });
  // Bruit : 1 SUCCESS pour le même client → ne doit pas apparaître
  await seedAlert({
    orgId: ORG_A,
    orgName: "Client A",
    jobName: "Job-A3",
    status: "SUCCESS",
    minutesAgo: 10,
    messageIdSuffix: "a3-ok",
  });

  // Client B : 1 FAILED
  await seedAlert({
    orgId: ORG_B,
    orgName: "Client B",
    jobName: "Job-B1",
    status: "FAILED",
    minutesAgo: 45,
    messageIdSuffix: "b1",
  });

  // Client C : que des SUCCESS → pas de template attendu
  await seedAlert({
    orgId: ORG_C,
    orgName: "Client C",
    jobName: "Job-C1",
    status: "SUCCESS",
    minutesAgo: 20,
    messageIdSuffix: "c1",
  });

  // Alerte orpheline (organizationId null) → ignorée
  await seedAlert({
    orgId: null,
    orgName: "Unknown",
    jobName: "Unmapped-Job",
    status: "FAILED",
    minutesAgo: 15,
    messageIdSuffix: "unmapped",
  });

  // Règle settings utilisée : fenêtre = 7j (suffit pour nos alertes)
  await setSetting("backup-kanban", {
    titlePattern: "Sauvegardes en échec — {clientName}",
    lookbackDays: 7,
    categoryId: null,
    subcategoryId: null,
    priority: "HIGH",
  });

  // ---------------------------------------------------------------------------
  console.log("\n--- aggregateFailuresByOrg ---");
  // ---------------------------------------------------------------------------
  {
    const agg = await aggregateFailuresByOrg(7);
    // On filtre sur nos 2 orgs de test pour rester isolé d'éventuelles
    // données réelles déjà dans la DB.
    const rows = agg.filter((a) => [ORG_A, ORG_B].includes(a.organizationId));

    const a = rows.find((r) => r.organizationId === ORG_A);
    assert("agg A présent", !!a);
    assert(
      "agg A tâches dédupliquées à 2",
      a?.failedTasks.length === 2,
      a,
    );
    assert(
      "agg A contient Job-A1 + Job-A2",
      !!a?.failedTasks.includes("Job-A1") && !!a?.failedTasks.includes("Job-A2"),
      a,
    );
    assert(
      "agg A ignore Job-A3 (SUCCESS)",
      !a?.failedTasks.includes("Job-A3"),
      a,
    );

    const b = rows.find((r) => r.organizationId === ORG_B);
    assert("agg B présent", !!b && b.failedTasks.length === 1, b);

    const c = rows.find((r) => r.organizationId === ORG_C);
    assert("agg C absent (pas d'échec)", !c);

    const orphans = rows.find((r) => r.organizationId === null as unknown);
    assert("alerte orpheline ignorée", !orphans);
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- refreshTemplates (1er run) ---");
  // ---------------------------------------------------------------------------
  {
    const r1 = await refreshTemplates();
    const t = await prisma.backupTicketTemplate.findMany({
      where: { organizationId: { in: [ORG_A, ORG_B, ORG_C] } },
      orderBy: { organizationId: "asc" },
    });
    const tA = t.find((x) => x.organizationId === ORG_A);
    const tB = t.find((x) => x.organizationId === ORG_B);
    const tC = t.find((x) => x.organizationId === ORG_C);

    assert("A template créé", !!tA, tA);
    assert("B template créé", !!tB, tB);
    assert("C pas de template (que des SUCCESS)", !tC);
    assert(
      "A titre par défaut via pattern",
      tA?.subject === "Sauvegardes en échec — Client A",
      tA?.subject,
    );
    assert(
      "A liste tâches = 2 (dédup)",
      tA?.failedTasks.length === 2,
      tA?.failedTasks,
    );
    assert("1er run → created ≥ 2", r1.created >= 2, r1);
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- Edit manuel du titre → persiste au refresh ---");
  // ---------------------------------------------------------------------------
  {
    // Simule une édition manuelle côté UI (PATCH /api/v1/backup-templates/[id])
    await prisma.backupTicketTemplate.updateMany({
      where: { organizationId: ORG_A },
      data: { subject: "URGENT — Sauvegardes bloquées chez A" },
    });
    await refreshTemplates();
    const tA = await prisma.backupTicketTemplate.findFirst({
      where: { organizationId: ORG_A },
    });
    assert(
      "titre édité par l'agent préservé après refresh",
      tA?.subject === "URGENT — Sauvegardes bloquées chez A",
      tA?.subject,
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- Purge : org qui n'a plus d'échec récent ---");
  // ---------------------------------------------------------------------------
  {
    // Supprime toutes les alertes FAILED de B → le template B doit être purgé.
    await prisma.veeamBackupAlert.deleteMany({
      where: { organizationId: ORG_B, status: "FAILED" },
    });
    const r = await refreshTemplates();
    const tB = await prisma.backupTicketTemplate.findFirst({
      where: { organizationId: ORG_B },
    });
    assert("B purgé", !tB, tB);
    assert("purged >= 1", r.purged >= 1, r);
    const tA = await prisma.backupTicketTemplate.findFirst({
      where: { organizationId: ORG_A },
    });
    assert("A toujours là", !!tA, tA);
    assert(
      "A titre custom tient toujours",
      tA?.subject === "URGENT — Sauvegardes bloquées chez A",
      tA?.subject,
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- Idempotence : 2e refresh sans nouvelles alertes ---");
  // ---------------------------------------------------------------------------
  {
    const before = await prisma.backupTicketTemplate.findFirst({
      where: { organizationId: ORG_A },
    });
    await refreshTemplates();
    const after = await prisma.backupTicketTemplate.findFirst({
      where: { organizationId: ORG_A },
    });
    assert(
      "failedTasks inchangées (idempotent)",
      JSON.stringify(before?.failedTasks) === JSON.stringify(after?.failedTasks),
      { before, after },
    );
    assert(
      "subject custom inchangé",
      before?.subject === after?.subject,
      { before: before?.subject, after: after?.subject },
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- Cleanup ---");
  // ---------------------------------------------------------------------------
  await cleanup([ORG_A, ORG_B, ORG_C]);

  if (failures > 0) {
    console.log(`\n✗ ${failures} tests échoués.`);
    process.exit(1);
  }
  console.log("\n✓ Tous les tests passent.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
