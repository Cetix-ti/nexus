// ============================================================================
// PAGE DE RENDU INTERNE — Rapport mensuel client (Puppeteer target).
//
// Auth : token signé court dans ?token=. La page n'est pas listée dans le
// sitemap et n'est accessible qu'avec un jeton valide pour le reportId. Le
// service PDF génère ce token juste avant l'appel.
//
// Flow : verify token → load payload from DB → render HTML.
// ============================================================================

import { notFound } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import prisma from "@/lib/prisma";
import { verifyReportToken } from "@/lib/reports/monthly/token";
import { MonthlyReportDocument } from "@/components/reports/monthly/monthly-report-document";
import type { MonthlyReportPayload } from "@/lib/reports/monthly/types";
import {
  consumeSnapshot,
  getSnapshot,
  type DashboardSnapshot,
} from "@/lib/reports/monthly/dashboard-snapshot-cache";
import { executeSingleQuery } from "@/app/api/v1/analytics/query/route";
import type { ResolvedDashboardAnnex, ResolvedAnnexWidget } from "@/lib/reports/monthly/dashboard-annex-types";

export const dynamic = "force-dynamic";

// Pairing tech moderne : Geist (display + body, Vercel-grade, géométrique
// avec personnalité — référence du design tech actuel) + Geist Mono pour
// les chiffres techniques. Un seul shipping de famille pour cohérence
// type Apple SF Pro, peak « young + modern + IT ».
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
  weight: ["300", "400", "500", "600", "700", "800"],
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
  weight: ["400", "500", "600"],
});

export default async function InternalMonthlyReportRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ token?: string; variant?: string; snapshotKey?: string }>;
}) {
  const { reportId } = await params;
  const { token, variant, snapshotKey } = await searchParams;

  if (!token) return notFound();
  const verified = verifyReportToken(token);
  if (!verified || verified.reportId !== reportId) return notFound();

  const report = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: { id: true, organizationId: true, period: true, payloadJson: true },
  });
  if (!report) return notFound();

  const payload = report.payloadJson as unknown as MonthlyReportPayload;

  // Logo servi depuis /public. En dev + prod, même URL.
  const logoSrc = "/images/cetix-logo-bleu-horizontal-HD.png";

  // Défaut : SANS montants $ (rapport officiel envoyé au client / portail).
  // ?variant=with_amounts → version réservée aux agents avec montants $.
  // L'ancien ?variant=hours_only reste accepté pour ne pas casser d'éventuels
  // anciens liens — il produit le même résultat que le défaut.
  const hideRates = variant !== "with_amounts";

  // Annexes dashboards (option "PDF avec graphiques") — résolues côté serveur.
  let annexes: ResolvedDashboardAnnex[] | undefined;
  if (snapshotKey) {
    annexes = await resolveAnnexes(
      snapshotKey,
      report.organizationId,
      report.period,
    );
  }

  return (
    <div className={`${geist.variable} ${geistMono.variable}`}>
      <MonthlyReportDocument
        payload={payload}
        logoSrc={logoSrc}
        hideRates={hideRates}
        dashboardAnnexes={annexes}
      />
    </div>
  );
}

/**
 * Résout les snapshots de dashboards en exécutant chaque widget query
 * côté serveur. Toutes les queries sont scopées sur l'organisation cible
 * du rapport (filtre injecté + dates limitées au mois rapporté).
 */
async function resolveAnnexes(
  snapshotKey: string,
  organizationId: string,
  reportPeriod: Date,
): Promise<ResolvedDashboardAnnex[] | undefined> {
  const cached = getSnapshot(snapshotKey);
  if (!cached) return undefined;
  // Sécurité : la clé doit correspondre à l'org du rapport. Empêche un
  // agent de réinjecter des dashboards d'une autre org via cette route.
  if (cached.organizationId !== organizationId) return undefined;
  // Cycle de vie : on consomme la clé après lecture pour libérer la mémoire.
  // Si Puppeteer doit retenter (rare), il devra faire un nouveau POST.
  consumeSnapshot(snapshotKey);

  // Période du mois rapporté (1er → fin du mois en heure locale).
  const monthStart = new Date(
    reportPeriod.getFullYear(),
    reportPeriod.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const monthEnd = new Date(
    reportPeriod.getFullYear(),
    reportPeriod.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const dateFrom = monthStart.toISOString();
  const dateTo = monthEnd.toISOString();

  const out: ResolvedDashboardAnnex[] = [];
  for (const dashboard of cached.snapshots) {
    out.push(await resolveDashboard(dashboard, organizationId, dateFrom, dateTo));
  }
  return out;
}

async function resolveDashboard(
  dashboard: DashboardSnapshot,
  organizationId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ResolvedDashboardAnnex> {
  const widgets: ResolvedAnnexWidget[] = [];
  for (const w of dashboard.widgets) {
    widgets.push(await resolveWidget(w, organizationId, dateFrom, dateTo));
  }
  return {
    id: dashboard.id,
    label: dashboard.label,
    description: dashboard.description,
    widgets,
  };
}

async function resolveWidget(
  widget: DashboardSnapshot["widgets"][number],
  organizationId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ResolvedAnnexWidget> {
  const q = (widget.query ?? {}) as Record<string, unknown>;
  const dataset = String(q.dataset ?? "");
  const aggregate = String(q.aggregate ?? "count");
  const aggregateField = q.aggregateField as string | undefined;
  const groupBy = q.groupBy as string | undefined;
  const sortBy = String(q.sortBy ?? "value");
  const sortDir = String(q.sortDir ?? "desc");
  const limit = typeof q.limit === "number" ? q.limit : 50;
  const dateField = q.dateField as string | undefined;

  if (!dataset) {
    return {
      id: widget.id,
      title: widget.title ?? widget.id,
      chartType: widget.chartType,
      span: widget.span ?? 6,
      style: widget.style,
      results: [],
      total: 0,
      error: "Widget mal formé (dataset manquant)",
    };
  }

  // Injection systématique du filtre organizationId — la sécurité est
  // CRITIQUE ici : un dashboard custom de l'agent pourrait avoir des
  // filtres qui voient toutes les orgs. On force la limitation à l'org
  // du rapport.
  const userFilters = Array.isArray(q.filters) ? (q.filters as unknown[]) : [];
  const filters = [
    ...userFilters,
    { field: "organizationId", op: "eq", value: organizationId },
  ];

  try {
    const r = await executeSingleQuery({
      dataset,
      filters,
      groupBy,
      aggregate,
      aggregateField,
      sortBy,
      sortDir,
      limit,
      dateField,
      dateFrom,
      dateTo,
    });
    if (r.error) {
      return {
        id: widget.id,
        title: widget.title ?? widget.id,
        chartType: widget.chartType,
        span: widget.span ?? 6,
        style: widget.style,
        results: [],
        total: 0,
        error: r.error,
      };
    }
    return {
      id: widget.id,
      title: widget.title ?? widget.id,
      chartType: widget.chartType,
      span: widget.span ?? 6,
      style: widget.style,
      results: r.results,
      total: r.total,
    };
  } catch (e) {
    return {
      id: widget.id,
      title: widget.title ?? widget.id,
      chartType: widget.chartType,
      span: widget.span ?? 6,
      style: widget.style,
      results: [],
      total: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
