// ============================================================================
// SERVICE — Orchestration create/regenerate/publish d'un rapport mensuel.
//
// Encapsule la logique partagée entre les routes agent + portail + future
// planification automatique. Aucune dépendance HTTP ici.
// ============================================================================

import prisma from "@/lib/prisma";
import { buildMonthlyReportPayload, monthBounds } from "./builder";
import { renderReportToPdf } from "./pdf";
import {
  deleteReportPdf,
  readReportPdf,
  reportPdfExists,
  writeReportPdf,
} from "./storage";
import type { MonthlyReportPayload } from "./types";
import { ensureTicketSummary } from "@/lib/ai/ticket-summary";

export interface GenerateParams {
  organizationId: string;
  period: string; // "YYYY-MM"
  generatedBy?: { id: string; fullName: string } | null;
  /** Si true et qu'un rapport existe déjà pour ce (org, period), écrase le
   *  payload et le PDF. Sinon, throw. */
  overwrite?: boolean;
}

/**
 * Génère (ou regénère) un rapport mensuel pour un client :
 *  1. Calcule le payload depuis la DB
 *  2. Upsert MonthlyClientReport avec le payload
 *  3. Rend le PDF via Puppeteer
 *  4. Écrit le PDF sur disque + met à jour filePath/sha256/size
 *  5. Si l'org a `monthlyReportAutoPublish=true`, publie au portail
 */
export async function generateMonthlyReport(params: GenerateParams) {
  const { organizationId, period } = params;
  const { start } = monthBounds(period);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, monthlyReportAutoPublish: true },
  });
  if (!org) throw new Error(`Organization not found: ${organizationId}`);

  // Existant ? (un rapport par (org, period))
  const existing = await prisma.monthlyClientReport.findUnique({
    where: { organizationId_period: { organizationId, period: start } },
    select: { id: true, filePath: true },
  });

  if (existing && !params.overwrite) {
    throw new Error(
      `A report already exists for ${organizationId} / ${period}. Use overwrite=true to regenerate.`,
    );
  }

  const payload = await buildMonthlyReportPayload({
    organizationId,
    period,
    generatedBy: params.generatedBy ?? null,
  });

  const autoPublish = org.monthlyReportAutoPublish;

  // Upsert en premier avec payload, pour avoir un ID stable à passer au
  // renderer (le renderer lit payloadJson depuis la DB via son reportId).
  const record = await prisma.monthlyClientReport.upsert({
    where: { organizationId_period: { organizationId, period: start } },
    create: {
      organizationId,
      period: start,
      generatedByUserId: params.generatedBy?.id ?? null,
      payloadJson: payload as unknown as object,
      publishedToPortal: autoPublish,
      publishedAt: autoPublish ? new Date() : null,
    },
    update: {
      generatedByUserId: params.generatedBy?.id ?? null,
      generatedAt: new Date(),
      payloadJson: payload as unknown as object,
      // Reset PDF meta — le nouveau payload invalide l'ancien PDF.
      filePath: null,
      fileSizeBytes: null,
      sha256: null,
      // On ne touche pas à publishedToPortal/publishedAt ici : si déjà
      // publié, rester publié ; si auto-publish est désactivé, un agent
      // peut toujours publier manuellement.
    },
    select: { id: true, organizationId: true, period: true },
  });

  // Supprime l'ancien PDF s'il y en avait un.
  if (existing?.filePath) {
    await deleteReportPdf(existing.filePath);
  }

  // Rendu PDF. Peut échouer si Puppeteer / Chromium non disponible — on
  // laisse remonter l'erreur, le record reste en DB sans PDF (l'UI peut
  // tenter un nouveau rendu via un bouton "Regénérer PDF").
  // Le PDF persistant est SANS montants $ (version officielle pour le client
  // + portail). La variante avec montants est générée à la volée pour les
  // agents via ?variant=with_amounts.
  const pdfBuffer = await renderReportToPdf(record.id, { hideRates: true });

  const stored = await writeReportPdf({
    orgSlug: org.slug,
    period,
    reportId: record.id,
    buffer: pdfBuffer,
  });

  await prisma.monthlyClientReport.update({
    where: { id: record.id },
    data: {
      filePath: stored.relativePath,
      fileSizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    },
  });

  // Warmup IA en arrière-plan : pour chaque ticket du rapport sans résumé
  // suffisamment confiant, on lance une génération asynchrone. La requête
  // utilisateur retourne immédiatement ; le prochain regen affichera les
  // résumés. Concurrency = 1 car Ollama local sérialise de toute façon.
  void warmReportSummaries(payload.tickets.map((t) => t.ticketId));

  return { id: record.id, ...stored };
}

/**
 * Génère en arrière-plan les résumés IA manquants pour la liste de tickets.
 * Best-effort : toute erreur est silencieuse. Concurrence 1 (Ollama local
 * sérialise) avec budget de temps total pour éviter qu'un long pipeline
 * laisse traîner pendant des heures.
 */
async function warmReportSummaries(ticketIds: string[]): Promise<void> {
  if (ticketIds.length === 0) return;
  const startedAt = Date.now();
  const BUDGET_MS = 30 * 60 * 1000; // 30 min max — large mais borné
  for (const id of ticketIds) {
    if (Date.now() - startedAt > BUDGET_MS) return;
    try {
      await ensureTicketSummary(id);
    } catch {
      // ignore et continue avec le suivant
    }
  }
}

/** Regénère uniquement le PDF à partir du payload existant. Utile quand le
 *  template change — pas besoin de recalculer depuis la DB. */
export async function regeneratePdfOnly(reportId: string) {
  const report = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      filePath: true,
      period: true,
      organization: { select: { slug: true } },
    },
  });
  if (!report) throw new Error(`Report not found: ${reportId}`);

  // Voir generateMonthlyReport : le PDF persistant est sans montants $.
  const pdfBuffer = await renderReportToPdf(report.id, { hideRates: true });

  if (report.filePath) {
    await deleteReportPdf(report.filePath);
  }

  const periodStr = report.period.toISOString().slice(0, 7); // "YYYY-MM"
  const stored = await writeReportPdf({
    orgSlug: report.organization.slug,
    period: periodStr,
    reportId: report.id,
    buffer: pdfBuffer,
  });

  await prisma.monthlyClientReport.update({
    where: { id: reportId },
    data: {
      filePath: stored.relativePath,
      fileSizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    },
  });

  return { id: report.id, ...stored };
}

/** Lit le PDF du rapport. Régénère si manquant mais record existe. */
export async function readReportPdfOrGenerate(reportId: string): Promise<Buffer> {
  const report = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: { id: true, filePath: true },
  });
  if (!report) throw new Error(`Report not found: ${reportId}`);

  if (report.filePath && (await reportPdfExists(report.filePath))) {
    return readReportPdf(report.filePath);
  }

  await regeneratePdfOnly(reportId);

  const refreshed = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: { filePath: true },
  });
  if (!refreshed?.filePath) {
    throw new Error(`Failed to regenerate PDF for report ${reportId}`);
  }
  return readReportPdf(refreshed.filePath);
}

export async function deleteReport(reportId: string): Promise<void> {
  const report = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: { filePath: true },
  });
  if (report?.filePath) {
    await deleteReportPdf(report.filePath);
  }
  await prisma.monthlyClientReport.delete({ where: { id: reportId } });
}

export async function getReportPayload(
  reportId: string,
): Promise<MonthlyReportPayload | null> {
  const report = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: { payloadJson: true },
  });
  if (!report) return null;
  return report.payloadJson as unknown as MonthlyReportPayload;
}
