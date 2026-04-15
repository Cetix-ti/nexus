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
      const data = cached.value as any;
      const age = Date.now() - new Date(data.generatedAt).getTime();
      if (age < TWELVE_HOURS) {
        return NextResponse.json(data);
      }
    }
  }

  return generateAndCacheSummary();
}

// ---------------------------------------------------------------------------
// Types for building the report
// ---------------------------------------------------------------------------

interface ProblemJob {
  job: string;
  server: string;
  status: "FAILED" | "WARNING";
  subject: string;
}

interface OrgProblems {
  client: string;
  failed: number;
  warning: number;
  success: number;
  jobs: ProblemJob[];
}

// ---------------------------------------------------------------------------
// Build the HTML table server-side (no AI dependency for layout)
// ---------------------------------------------------------------------------

/**
 * Table principale : UNIQUEMENT les jobs en échec (status FAILED).
 * Les warnings sont rendus séparément via `buildWarningsSection` pour
 * ne pas leur donner la même importance visuelle qu'un vrai échec.
 */
function buildFailedTableHtml(orgProblems: OrgProblems[]): string {
  const rows: string[] = [];
  for (const org of orgProblems) {
    const failedJobs = org.jobs.filter((j) => j.status === "FAILED");
    if (failedJobs.length === 0) continue;

    for (let i = 0; i < failedJobs.length; i++) {
      const j = failedJobs[i];
      let row = "<tr>";
      if (i === 0) {
        row += `<td${failedJobs.length > 1 ? ` rowspan="${failedJobs.length}"` : ""} class="client-cell">${escHtml(org.client)}</td>`;
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

/**
 * Section secondaire — avertissements. Rendus sous forme de liste
 * compacte avec un style discret (classe `.warnings-section`).
 */
function buildWarningsSection(orgProblems: OrgProblems[]): string {
  const items: string[] = [];
  for (const org of orgProblems) {
    const warns = org.jobs.filter((j) => j.status === "WARNING");
    if (warns.length === 0) continue;
    const jobList = warns
      .map((j) => `<span class="warn-job">${escHtml(j.server)} — ${escHtml(j.job)}</span>`)
      .join(", ");
    items.push(
      `<li><span class="warn-client">${escHtml(org.client)}</span> : ${jobList}</li>`
    );
  }
  if (items.length === 0) return "";
  const count = orgProblems.reduce(
    (acc, o) => acc + o.jobs.filter((j) => j.status === "WARNING").length,
    0
  );
  return `<div class="warnings-section">
<h4 class="warnings-title">Avertissements à surveiller (${count})</h4>
<ul class="warnings-list">${items.join("")}</ul>
</div>`;
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
// Generate summary
// ---------------------------------------------------------------------------

async function generateAndCacheSummary() {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Last 24h alerts
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.veeamBackupAlert.findMany({
    where: { receivedAt: { gte: since } },
    orderBy: { receivedAt: "desc" },
  });

  const totalFailed = alerts.filter((a) => a.status === "FAILED").length;
  const totalWarning = alerts.filter((a) => a.status === "WARNING").length;
  const totalSuccess = alerts.filter((a) => a.status === "SUCCESS").length;

  if (alerts.length === 0) {
    const result = {
      html: '<p class="summary">Aucune alerte de sauvegarde reçue dans les dernières 24 heures.</p>',
      generatedAt: new Date().toISOString(),
      alertCount: 0,
      failed: 0,
      warning: 0,
      success: 0,
    };
    await prisma.tenantSetting.upsert({
      where: { key: SUMMARY_KEY },
      create: { key: SUMMARY_KEY, value: result as any },
      update: { value: result as any },
    });
    return NextResponse.json(result);
  }

  // Build per-org problem data
  const byOrg = new Map<string, OrgProblems>();

  for (const a of alerts) {
    const key = a.organizationName ?? "Non associé";
    if (!byOrg.has(key)) {
      byOrg.set(key, { client: key, failed: 0, warning: 0, success: 0, jobs: [] });
    }
    const entry = byOrg.get(key)!;
    if (a.status === "SUCCESS") {
      entry.success++;
    } else {
      if (a.status === "FAILED") entry.failed++;
      else entry.warning++;
      // Deduplicate same job name
      if (!entry.jobs.some((j) => j.job === a.jobName && j.status === a.status)) {
        entry.jobs.push({
          job: a.jobName,
          server: extractServer(a.senderEmail),
          status: a.status as "FAILED" | "WARNING",
          subject: a.subject,
        });
      }
    }
  }

  // Sort: failed first within each org
  const orgProblems = Array.from(byOrg.values())
    .filter((o) => o.failed > 0 || o.warning > 0)
    .sort((a, b) => b.failed - a.failed || b.warning - a.warning);

  for (const org of orgProblems) {
    org.jobs.sort((a, b) => (a.status === "FAILED" ? -1 : 1) - (b.status === "FAILED" ? -1 : 1));
  }

  // Build the table HTML deterministically (no AI needed).
  // Séparation : table principale = FAILED uniquement, warnings = section
  // discrète en dessous.
  const tableHtml = buildFailedTableHtml(orgProblems);
  const warningsHtml = buildWarningsSection(orgProblems);

  // Ask AI only for the summary text and recommendation
  let summaryParagraph = "";
  let recommendationParagraph = "";

  if (OPENAI_API_KEY) {
    try {
      const compactData = orgProblems.map((o) => ({
        client: o.client,
        failed: o.failed,
        warning: o.warning,
        jobs: o.jobs.map((j) => `${j.server}: ${j.job} (${j.status})`),
      }));

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `Tu es un assistant MSP. Génère exactement 2 choses en JSON (pas de markdown, juste du JSON brut):
1. "summary": un paragraphe de résumé (2-3 phrases max). Concentre-toi sur les ÉCHECS (FAILED) et les clients les plus critiques — ce sont les priorités. Mentionne les avertissements (WARNING) seulement à la fin, brièvement ("X avertissements mineurs à surveiller"). Ne mentionne PAS les succès.
2. "recommendation": un paragraphe court d'actions recommandées. Les échecs sont la priorité n°1 (vérifier logs, relancer jobs). Les warnings sont à traiter plus tard.

Ton professionnel et direct. Français.`,
            },
            {
              role: "user",
              content: `Alertes 24h: ${alerts.length} total (${totalFailed} échecs, ${totalWarning} avertissements, ${totalSuccess} succès)\n\nDétail:\n${JSON.stringify(compactData)}`,
            },
          ],
        }),
      });

      if (res.ok) {
        const aiData = await res.json();
        const content = aiData.choices?.[0]?.message?.content ?? "";
        try {
          const parsed = JSON.parse(content);
          summaryParagraph = parsed.summary ?? "";
          recommendationParagraph = parsed.recommendation ?? "";
        } catch {
          summaryParagraph = content;
        }
      }
    } catch {
      // AI failed — fall back to static summary
    }
  }

  // Fallback if AI didn't produce text
  if (!summaryParagraph) {
    summaryParagraph = `${totalFailed} échec${totalFailed > 1 ? "s" : ""} et ${totalWarning} avertissement${totalWarning > 1 ? "s" : ""} détecté${totalFailed + totalWarning > 1 ? "s" : ""} sur ${alerts.length} alertes dans les dernières 24 heures.`;
  }

  // Assemble final HTML : résumé → table FAILED → avertissements (discrets)
  // → recommandation.
  const html = [
    `<p class="summary">${escHtml(summaryParagraph)}</p>`,
    tableHtml,
    warningsHtml,
    recommendationParagraph
      ? `<p class="recommendation">${escHtml(recommendationParagraph)}</p>`
      : "",
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

  await prisma.tenantSetting.upsert({
    where: { key: SUMMARY_KEY },
    create: { key: SUMMARY_KEY, value: result as any },
    update: { value: result as any },
  });

  return NextResponse.json(result);
}
