// ============================================================================
// AI AUTO-INTELLIGENCE — job d'arrière-plan qui rafraîchit périodiquement
// l'analyse de risque et extrait les faits des tickets résolus, pour que
// Nexus devienne progressivement plus intelligent sur chaque client SANS
// intervention manuelle d'un admin.
//
// Philosophie :
//   - Scan les orgs actives (activité dans les 30 derniers jours)
//   - Pour chaque org, vérifie si le dernier snapshot IA est ≥ staleness
//   - Si oui, régénère (facts-extract puis risk-analysis)
//   - Gates strictes : max N orgs traitées par tick (budget IA + temps)
//
// Coûts : chaque org consomme ~2 appels IA (facts + risk). Avec 40 clients
// à refresh 1x/semaine = ~320 appels/mois. Négligeable côté OpenAI
// (<0.50 $/mois) et gratuit avec Ollama.
//
// Tourne toutes les 6 heures. Sélectionne les orgs dont le dernier
// snapshot date de > 7 jours, triées par plus ancien, max 3 par tick.
// ============================================================================

import prisma from "@/lib/prisma";

const STALENESS_DAYS = 7;
const MAX_ORGS_PER_TICK = 3;
const ACTIVITY_WINDOW_DAYS = 30;

export interface AutoIntelligenceResult {
  checked: number;
  refreshed: number;
  factsAdded: number;
  skipped: number;
}

export async function runAutoIntelligence(): Promise<AutoIntelligenceResult> {
  const stats: AutoIntelligenceResult = {
    checked: 0,
    refreshed: 0,
    factsAdded: 0,
    skipped: 0,
  };

  // 1. Trouver les orgs qui ont de l'activité récente (tickets créés
  //    dans les 30j) — pas la peine d'analyser une org dormante.
  const activitySince = new Date(
    Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const activeOrgs = await prisma.organization.findMany({
    where: {
      isInternal: false,
      isActive: true,
      tickets: {
        some: { createdAt: { gte: activitySince } },
      },
    },
    select: { id: true, name: true },
  });

  if (activeOrgs.length === 0) return stats;
  stats.checked = activeOrgs.length;

  // 2. Lookup des derniers snapshots pour filtrer par staleness.
  const snapshotCutoff = new Date(
    Date.now() - STALENESS_DAYS * 24 * 60 * 60 * 1000,
  );
  const patternsRows = await prisma.aiPattern.findMany({
    where: {
      scope: { in: activeOrgs.map((o) => `risk:${o.id}`) },
      kind: "snapshot",
      key: "current",
    },
    select: { scope: true, lastUpdatedAt: true },
  });
  const lastSnapshotByOrg = new Map<string, Date>();
  for (const p of patternsRows) {
    const orgId = p.scope.replace(/^risk:/, "");
    lastSnapshotByOrg.set(orgId, p.lastUpdatedAt);
  }

  // 3. Sélectionne les candidats : orgs sans snapshot OU snapshot > 7j.
  //    Trié par plus ancien (ou jamais analysé) en premier.
  const candidates = activeOrgs
    .map((o) => ({
      ...o,
      lastSnapshot: lastSnapshotByOrg.get(o.id) ?? null,
    }))
    .filter(
      (o) => o.lastSnapshot == null || o.lastSnapshot.getTime() < snapshotCutoff.getTime(),
    )
    .sort((a, b) => {
      const ta = a.lastSnapshot?.getTime() ?? 0;
      const tb = b.lastSnapshot?.getTime() ?? 0;
      return ta - tb; // plus ancien en premier
    })
    .slice(0, MAX_ORGS_PER_TICK);

  stats.skipped = activeOrgs.length - candidates.length;

  // 4. Pour chaque candidat : extract facts + analyze risks.
  //    Non parallèle pour ne pas surcharger le LLM + DB.
  const { extractFactsForOrganization } = await import(
    "@/lib/ai/features/facts-extract"
  );
  const { analyzeClientRisks } = await import(
    "@/lib/ai/features/risk-analysis"
  );

  for (const org of candidates) {
    try {
      // Facts d'abord : ils enrichissent le contexte de l'analyse de risque
      // (les faits connus apparaissent dans le prompt signals.ts).
      const factsStats = await extractFactsForOrganization({
        organizationId: org.id,
        sinceDays: 90,
        maxTickets: 30,
      });
      stats.factsAdded += factsStats.proposed;

      const riskResult = await analyzeClientRisks({
        organizationId: org.id,
        sinceDays: 60,
      });
      if (riskResult) {
        stats.refreshed++;
        console.log(
          `[auto-intelligence] ${org.name}: risk score ${riskResult.overallRiskScore}, ${factsStats.proposed} faits ajoutés`,
        );
      }
    } catch (err) {
      console.warn(
        `[auto-intelligence] ${org.name} failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return stats;
}
