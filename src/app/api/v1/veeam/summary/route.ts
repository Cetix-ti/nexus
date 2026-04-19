// ============================================================================
// GET /api/v1/veeam/summary
//
// Retourne les tâches Veeam EN ÉCHEC sur les dernières 24 heures, groupées
// par client puis par serveur, sous forme STRUCTURÉE (plus de HTML). Le
// client rend la table en React avec le composant OrgLogo pour avoir un
// rendu uniforme avec le reste de l'app.
//
// Cache : 15 min dans tenant_settings (clé "veeam.failures-summary"). Le
// cache est plus court qu'avant (12h → 15min) puisque la page est maintenant
// en auto-refresh — on veut voir les nouveaux échecs rapidement après un
// sync Veeam sans attendre la journée.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const SUMMARY_KEY = "veeam.failures-summary";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Shape de la réponse — doit matcher l'interface côté client (backups/page.tsx)
// ---------------------------------------------------------------------------

export interface FailedJobRow {
  job: string;
  server: string;
  subject: string;
}

export interface FailedOrg {
  orgId: string | null;
  orgName: string;
  logo: string | null;
  jobs: FailedJobRow[];
}

export interface FailuresSummary {
  orgs: FailedOrg[];
  generatedAt: string;
  alertCount: number;
  failed: number;
  warning: number;
  success: number;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!forceRefresh) {
    const cached = await prisma.tenantSetting.findUnique({
      where: { key: SUMMARY_KEY },
    });
    if (cached) {
      const data = cached.value as { generatedAt?: string };
      if (data?.generatedAt) {
        const age = Date.now() - new Date(data.generatedAt).getTime();
        if (age < CACHE_TTL_MS) {
          return NextResponse.json(cached.value);
        }
      }
    }
  }

  return generateAndCacheSummary();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extrait le nom du serveur à partir de l'adresse email expéditrice.
 * "SERVEUR-VEEAM01@cetix.ca" → "SERVEUR-VEEAM01"
 */
function extractServer(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at).toUpperCase();
}

async function generateAndCacheSummary() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.veeamBackupAlert.findMany({
    where: { receivedAt: { gte: since } },
    orderBy: { receivedAt: "desc" },
  });

  const totalFailed = alerts.filter((a) => a.status === "FAILED").length;
  const totalWarning = alerts.filter((a) => a.status === "WARNING").length;
  const totalSuccess = alerts.filter((a) => a.status === "SUCCESS").length;

  if (alerts.length === 0 || totalFailed === 0) {
    const result: FailuresSummary = {
      orgs: [],
      generatedAt: new Date().toISOString(),
      alertCount: alerts.length,
      failed: totalFailed,
      warning: totalWarning,
      success: totalSuccess,
    };
    await cache(result);
    return NextResponse.json(result);
  }

  // Agrège FAILED par client. Dédup (même jobName + même serveur) pour
  // éviter qu'une alerte répétée spam le tableau.
  const byOrg = new Map<string, FailedOrg>();
  for (const a of alerts) {
    if (a.status !== "FAILED") continue;
    const key = a.organizationId ?? `_unmatched:${a.organizationName ?? ""}`;
    if (!byOrg.has(key)) {
      byOrg.set(key, {
        orgId: a.organizationId,
        orgName: a.organizationName ?? "Non associé",
        logo: null,
        jobs: [],
      });
    }
    const entry = byOrg.get(key)!;
    const server = extractServer(a.senderEmail);
    if (!entry.jobs.some((j) => j.job === a.jobName && j.server === server)) {
      entry.jobs.push({ job: a.jobName, server, subject: a.subject });
    }
  }

  // Récupère les logos des organisations en un seul findMany, puis
  // attache à chaque org du résumé.
  const orgIds = Array.from(byOrg.values())
    .map((o) => o.orgId)
    .filter((id): id is string => !!id);
  if (orgIds.length > 0) {
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, logo: true },
    });
    const logoMap = new Map(orgs.map((o) => [o.id, o.logo]));
    for (const entry of byOrg.values()) {
      if (entry.orgId) entry.logo = logoMap.get(entry.orgId) ?? null;
    }
  }

  // Tri : clients avec le plus d'échecs en tête ; alphabétique à égalité.
  const orgsSorted = Array.from(byOrg.values()).sort(
    (a, b) =>
      b.jobs.length - a.jobs.length || a.orgName.localeCompare(b.orgName, "fr"),
  );
  // Tri des jobs à l'intérieur de chaque org : par serveur puis par job,
  // pour que le rowSpan sur la colonne serveur groupe naturellement les
  // jobs qui partagent un même serveur.
  for (const org of orgsSorted) {
    org.jobs.sort((a, b) => {
      const s = a.server.localeCompare(b.server, "fr");
      if (s !== 0) return s;
      return a.job.localeCompare(b.job, "fr");
    });
  }

  const result: FailuresSummary = {
    orgs: orgsSorted,
    generatedAt: new Date().toISOString(),
    alertCount: alerts.length,
    failed: totalFailed,
    warning: totalWarning,
    success: totalSuccess,
  };
  await cache(result);
  return NextResponse.json(result);
}

async function cache(result: FailuresSummary): Promise<void> {
  // Conversion via `unknown` : notre type a des clés nommées alors que
  // Prisma.InputJsonValue attend un index signature string. Les deux sont
  // sémantiquement compatibles pour la sérialisation JSON.
  const value = result as unknown as import("@prisma/client").Prisma.InputJsonValue;
  await prisma.tenantSetting.upsert({
    where: { key: SUMMARY_KEY },
    create: { key: SUMMARY_KEY, value },
    update: { value },
  });
}
