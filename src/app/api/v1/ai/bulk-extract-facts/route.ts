// ============================================================================
// POST /api/v1/ai/bulk-extract-facts
//
// Lance l'extraction de faits IA sur plusieurs orgs d'un coup. Utile pour :
//   - Démarrage initial après déploiement (sinon faut attendre que le
//     job auto-intelligence tourne pendant des jours pour couvrir tout le monde)
//   - Force une passe sur tous les clients avant une rencontre mensuelle
//     ou une analyse stratégique
//
// Safety :
//   - SUPERVISOR+ uniquement
//   - dryRun=true par défaut
//   - Max 10 orgs par batch (éviter hammering IA)
//   - Dédup respectée via findExistingFact (extract-facts normal)
//
// Body : {
//   dryRun?: boolean,
//   maxOrgs?: number (défaut 5, max 10),
//   sinceDays?: number (défaut 90),
//   maxTicketsPerOrg?: number (défaut 30)
// }
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

const ACTIVITY_WINDOW_DAYS = 30;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  const maxOrgs = Math.min(
    Math.max(typeof body.maxOrgs === "number" ? body.maxOrgs : 5, 1),
    10,
  );
  const sinceDays = Math.min(
    Math.max(typeof body.sinceDays === "number" ? body.sinceDays : 90, 30),
    365,
  );
  const maxTicketsPerOrg = Math.min(
    Math.max(
      typeof body.maxTicketsPerOrg === "number" ? body.maxTicketsPerOrg : 30,
      5,
    ),
    50,
  );

  // Sélection : orgs actives (tickets dans 30j), non internes.
  const activitySince = new Date(
    Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const candidateOrgs = await prisma.organization.findMany({
    where: {
      isInternal: false,
      isActive: true,
      tickets: { some: { createdAt: { gte: activitySince } } },
    },
    select: {
      id: true,
      name: true,
      _count: { select: { tickets: true } },
    },
    orderBy: { tickets: { _count: "desc" } }, // Priorité : clients les plus actifs
    take: maxOrgs,
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      orgsToProcess: candidateOrgs.length,
      orgs: candidateOrgs.map((o) => ({
        id: o.id,
        name: o.name,
        tickets: o._count.tickets,
      })),
      // Coût estimé : ~0.05 $ par org (gpt-4o-mini, prompt volumineux),
      // 0 $ avec Ollama.
      estimatedCostCents: candidateOrgs.length * 5,
    });
  }

  // Execution séquentielle — évite DDoS du LLM.
  const { extractFactsForOrganization } = await import(
    "@/lib/ai/features/facts-extract"
  );
  const results: Array<{
    orgId: string;
    orgName: string;
    scanned: number;
    proposed: number;
    dedupedExisting: number;
    error?: string;
  }> = [];

  for (const org of candidateOrgs) {
    try {
      const stats = await extractFactsForOrganization({
        organizationId: org.id,
        sinceDays,
        maxTickets: maxTicketsPerOrg,
      });
      results.push({
        orgId: org.id,
        orgName: org.name,
        scanned: stats.scanned,
        proposed: stats.proposed,
        dedupedExisting: stats.dedupedExisting,
      });
    } catch (err) {
      results.push({
        orgId: org.id,
        orgName: org.name,
        scanned: 0,
        proposed: 0,
        dedupedExisting: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalProposed = results.reduce((a, r) => a + r.proposed, 0);
  const totalScanned = results.reduce((a, r) => a + r.scanned, 0);
  return NextResponse.json({
    dryRun: false,
    orgsProcessed: results.length,
    totalFactsProposed: totalProposed,
    totalTicketsScanned: totalScanned,
    perOrg: results,
  });
}
