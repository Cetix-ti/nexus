// ============================================================================
// GET /api/v1/veeam/summary
//
// Retourne un tableau déterministe des tâches Veeam EN ÉCHEC sur les
// dernières 24 heures, groupées par client. Pas de texte libre, pas de
// recommandation IA, pas de liste des avertissements — on ne liste QUE
// les FAILED pour que le technicien voie d'un coup d'œil ce qui compte.
//
// Les succès et les avertissements sont visibles dans le reste du
// dashboard /backups (stat cards cliquables + table alertes).
//
// Cache : 12h dans tenant_settings (clé "veeam.ai-summary"). Historique :
// le nom du champ reste "ai-summary" par compatibilité avec le client
// (qui lit la même réponse JSON). Le contenu est maintenant 100%
// déterministe, sans appel IA.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const SUMMARY_KEY = "veeam.ai-summary";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

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
      const data = cached.value as { generatedAt: string };
      const age = Date.now() - new Date(data.generatedAt).getTime();
      if (age < TWELVE_HOURS) {
        return NextResponse.json(cached.value);
      }
    }
  }

  return generateAndCacheSummary();
}

// ---------------------------------------------------------------------------
// Building the table
// ---------------------------------------------------------------------------

interface FailedJob {
  job: string;
  server: string;
  subject: string;
}

interface OrgFailures {
  client: string;
  jobs: FailedJob[];
}

/**
 * Tableau HTML : uniquement les jobs FAILED, regroupés par client (un
 * rowspan par client pour éviter la répétition du nom). Les clients
 * apparaissent triés par nombre d'échecs décroissant.
 */
function buildFailedTableHtml(orgs: OrgFailures[]): string {
  const rows: string[] = [];
  for (const org of orgs) {
    if (org.jobs.length === 0) continue;
    for (let i = 0; i < org.jobs.length; i++) {
      const j = org.jobs[i];
      let row = "<tr>";
      if (i === 0) {
        row += `<td${org.jobs.length > 1 ? ` rowspan="${org.jobs.length}"` : ""} class="client-cell">${escHtml(org.client)}</td>`;
      }
      row += `<td class="server-cell">${escHtml(j.server)}</td>`;
      row += `<td>${escHtml(j.job)}</td>`;
      row += `<td class="status-failed">Échec</td>`;
      row += "</tr>";
      rows.push(row);
    }
  }

  if (rows.length === 0) return "";

  return `<table>
<thead><tr><th>Client</th><th>Serveur</th><th>Tâche</th><th>Statut</th></tr></thead>
<tbody>${rows.join("")}</tbody>
</table>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractServer(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at).toUpperCase();
}

// ---------------------------------------------------------------------------
// Generate + cache
// ---------------------------------------------------------------------------

async function generateAndCacheSummary() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.veeamBackupAlert.findMany({
    where: { receivedAt: { gte: since } },
    orderBy: { receivedAt: "desc" },
  });

  const totalFailed = alerts.filter((a) => a.status === "FAILED").length;
  const totalWarning = alerts.filter((a) => a.status === "WARNING").length;
  const totalSuccess = alerts.filter((a) => a.status === "SUCCESS").length;

  // Aucune alerte du tout → message minimal.
  if (alerts.length === 0) {
    const result = {
      html: '<p class="summary">Aucune alerte de sauvegarde reçue dans les dernières 24 heures.</p>',
      generatedAt: new Date().toISOString(),
      alertCount: 0,
      failed: 0,
      warning: 0,
      success: 0,
    };
    await cache(result);
    return NextResponse.json(result);
  }

  // Aucune alerte FAILED → note rassurante, pas de tableau vide.
  if (totalFailed === 0) {
    const result = {
      html: `<p class="summary">Aucun échec de sauvegarde dans les dernières 24 heures (${alerts.length} alerte${alerts.length > 1 ? "s" : ""} total, ${totalWarning} avertissement${totalWarning > 1 ? "s" : ""}, ${totalSuccess} succès).</p>`,
      generatedAt: new Date().toISOString(),
      alertCount: alerts.length,
      failed: 0,
      warning: totalWarning,
      success: totalSuccess,
    };
    await cache(result);
    return NextResponse.json(result);
  }

  // Agrège FAILED par client — les warnings/succès ne rentrent pas dans
  // le tableau (ils n'ont pas besoin d'action immédiate d'un technicien).
  // Dédoublonne (même jobName + même serveur) → évite une alerte répétée
  // chaque nuit qui spam le tableau.
  const byOrg = new Map<string, OrgFailures>();
  for (const a of alerts) {
    if (a.status !== "FAILED") continue;
    const key = a.organizationName ?? "Non associé";
    if (!byOrg.has(key)) byOrg.set(key, { client: key, jobs: [] });
    const entry = byOrg.get(key)!;
    const server = extractServer(a.senderEmail);
    if (!entry.jobs.some((j) => j.job === a.jobName && j.server === server)) {
      entry.jobs.push({ job: a.jobName, server, subject: a.subject });
    }
  }

  const orgs = Array.from(byOrg.values()).sort(
    (a, b) => b.jobs.length - a.jobs.length || a.client.localeCompare(b.client, "fr"),
  );

  const tableHtml = buildFailedTableHtml(orgs);
  const html = [
    `<p class="summary">${totalFailed} tâche${totalFailed > 1 ? "s" : ""} en échec sur les dernières 24 heures, répartie${totalFailed > 1 ? "s" : ""} sur ${orgs.length} client${orgs.length > 1 ? "s" : ""}.</p>`,
    tableHtml,
  ]
    .filter(Boolean)
    .join("\n");

  const result = {
    html,
    generatedAt: new Date().toISOString(),
    alertCount: alerts.length,
    failed: totalFailed,
    warning: totalWarning,
    success: totalSuccess,
  };
  await cache(result);
  return NextResponse.json(result);
}

async function cache(result: Record<string, unknown>): Promise<void> {
  await prisma.tenantSetting.upsert({
    where: { key: SUMMARY_KEY },
    create: {
      key: SUMMARY_KEY,
      value: result as import("@prisma/client").Prisma.InputJsonValue,
    },
    update: {
      value: result as import("@prisma/client").Prisma.InputJsonValue,
    },
  });
}
