// ============================================================================
// Worker — Rapports planifiés (Phase 4).
//
// Trouve tous les ScheduledReport dont nextRunAt <= now() et isActive=true,
// génère le rapport pour la période couverte, l'envoie par email aux
// destinataires, et reprogramme la prochaine exécution selon la cadence.
//
// À déclencher via systemd timer (toutes les 15 min p.ex.) ou cron host.
// Le worker est idempotent : un rapport déjà à jour pour la période est
// simplement ré-envoyé (pas de duplication en DB).
//
// Usage :
//   npx tsx src/workers/scheduled-reports-worker.ts
//   npx tsx src/workers/scheduled-reports-worker.ts --dry-run
// ============================================================================

import prisma from "@/lib/prisma";
import { generateMonthlyReport } from "@/lib/reports/monthly/service";
import { renderReportToPdf } from "@/lib/reports/monthly/pdf";
import { readReportPdfOrGenerate } from "@/lib/reports/monthly/service";
import { sendEmail } from "@/lib/email/send";
import {
  computeCoveredPeriod,
  computeNextRun,
  type Cadence,
} from "@/lib/scheduled-reports/cadence";

const MAX_CONSECUTIVE_FAILURES = 3;

interface RunOptions {
  dryRun?: boolean;
}

async function runOne(scheduleId: string, opts: RunOptions): Promise<void> {
  const sched = await prisma.scheduledReport.findUnique({
    where: { id: scheduleId },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!sched || !sched.isActive) return;

  const now = new Date();
  const { period, label } = computeCoveredPeriod(sched.cadence as Cadence, now);

  console.log(
    `[scheduled-reports] ${sched.name} — ${sched.organization.name} ${period} (${sched.recipients.length} dest.)`,
  );
  if (opts.dryRun) {
    console.log("  → dry-run, aucune action");
    return;
  }

  try {
    // 1. Génère le rapport (ou réutilise si déjà existant pour la période).
    //    overwrite=true : si le rapport pour cette période existe déjà,
    //    on le régénère pour avoir les dernières données. Le PDF sera
    //    rendu à la volée par readReportPdfOrGenerate / renderReportToPdf.
    const generated = await generateMonthlyReport({
      organizationId: sched.organizationId,
      period,
      overwrite: true,
      generatedBy: null,
    });

    // 2. Récupère le PDF (avec ou sans tarifs selon la variante).
    const variant = sched.variant as "WITH_RATES" | "HOURS_ONLY";
    const pdfBuffer =
      variant === "HOURS_ONLY"
        ? await renderReportToPdf(generated.id, { hideRates: true })
        : await readReportPdfOrGenerate(generated.id);

    const filename = `rapport-${sched.organization.slug}-${period}${variant === "HOURS_ONLY" ? "-heures" : ""}.pdf`;

    // 3. Email à chaque destinataire (sépare pour ne pas leak les emails
    //    entre eux dans le To/Cc).
    const subject = `Rapport mensuel — ${sched.organization.name} — ${label}`;
    const html = buildEmailHtml({
      orgName: sched.organization.name,
      label,
      variant,
    });

    let sentOk = 0;
    let sentFailed = 0;
    for (const to of sched.recipients) {
      const ok = await sendEmail(to, subject, html, {
        attachments: [
          {
            filename,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
        skipSubjectPrefix: true,
      });
      if (ok) sentOk++;
      else sentFailed++;
    }

    // 4. Reprogramme et reset le compteur d'échecs.
    const nextRunAt = computeNextRun(sched.cadence as Cadence, now);
    await prisma.scheduledReport.update({
      where: { id: sched.id },
      data: {
        lastRunAt: now,
        nextRunAt,
        consecutiveFailures: sentFailed > 0 && sentOk === 0 ? sched.consecutiveFailures + 1 : 0,
        lastErrorMessage: sentFailed > 0 && sentOk === 0 ? `${sentFailed} envoi(s) échoué(s)` : null,
      },
    });

    console.log(
      `  → ${sentOk} envoyé(s), ${sentFailed} échec(s). Prochain run : ${nextRunAt.toISOString()}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${msg}`);
    const nextFailures = sched.consecutiveFailures + 1;
    await prisma.scheduledReport.update({
      where: { id: sched.id },
      data: {
        consecutiveFailures: nextFailures,
        lastErrorMessage: msg.slice(0, 1000),
        // Désactive après N échecs pour ne pas spammer.
        isActive: nextFailures < MAX_CONSECUTIVE_FAILURES,
        // Reprogramme quand même la prochaine tentative (sauf si on a
        // désactivé) pour que le worker ne le re-tente pas dans 5 min.
        nextRunAt: nextFailures >= MAX_CONSECUTIVE_FAILURES
          ? null
          : computeNextRun(sched.cadence as Cadence, new Date()),
      },
    });
  }
}

function buildEmailHtml(params: {
  orgName: string;
  label: string;
  variant: "WITH_RATES" | "HOURS_ONLY";
}): string {
  const variantNote =
    params.variant === "HOURS_ONLY"
      ? "Cette version contient le détail des heures par ticket et déplacement, sans les montants $."
      : "Cette version inclut le détail des heures, déplacements et la facturation $.";
  return `<!doctype html><html lang="fr"><body style="font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#0F172A;background:#F8FAFC;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:white;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 12px 0;font-size:18px;font-weight:600;">Rapport mensuel ${params.orgName}</h1>
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
      Bonjour, voici le rapport mensuel d'activité pour <strong>${params.label}</strong>.
    </p>
    <p style="margin:0 0 12px 0;font-size:13px;color:#64748B;">${variantNote}</p>
    <p style="margin:16px 0 0 0;font-size:13px;color:#64748B;">
      L'équipe Cetix
    </p>
  </div>
</body></html>`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const due = await prisma.scheduledReport.findMany({
    where: {
      isActive: true,
      nextRunAt: { not: null, lte: now },
    },
    select: { id: true },
    take: 50, // safety cap
  });
  console.log(`[scheduled-reports] ${due.length} rapport(s) à exécuter à ${now.toISOString()}`);
  for (const s of due) {
    await runOne(s.id, { dryRun });
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
