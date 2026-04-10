import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SUMMARY_KEY = "veeam.ai-summary";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export async function GET(req: Request) {
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

function buildTableHtml(orgProblems: OrgProblems[]): string {
  if (orgProblems.length === 0) return "";

  let rows = "";
  for (const org of orgProblems) {
    const jobs = org.jobs;
    if (jobs.length === 0) continue;

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      const statusClass =
        j.status === "FAILED" ? "status-failed" : "status-warning";
      const statusLabel =
        j.status === "FAILED" ? "Échec" : "Avertissement";

      rows += "<tr>";
      // Only emit client cell on first row, with rowspan
      if (i === 0) {
        rows += `<td${jobs.length > 1 ? ` rowspan="${jobs.length}"` : ""} class="client-cell">${escHtml(org.client)}</td>`;
      }
      rows += `<td class="server-cell">${escHtml(j.server)}</td>`;
      rows += `<td>${escHtml(j.job)}</td>`;
      rows += `<td class="${statusClass}">${statusLabel}</td>`;
      rows += "</tr>";
    }
  }

  return `<table>
<thead><tr><th>Client</th><th>Serveur</th><th>Tâche</th><th>Statut</th></tr></thead>
<tbody>${rows}</tbody>
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

  // Build the table HTML deterministically (no AI needed)
  const tableHtml = buildTableHtml(orgProblems);

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
1. "summary": un paragraphe de résumé (2-3 phrases max) mentionnant le nombre d'échecs/warnings et les clients les plus critiques. Ne mentionne PAS les succès.
2. "recommendation": un paragraphe court d'actions recommandées pour les techniciens (vérifier les logs, relancer les jobs, etc.)

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

  // Assemble final HTML
  const html = [
    `<p class="summary">${escHtml(summaryParagraph)}</p>`,
    tableHtml,
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
