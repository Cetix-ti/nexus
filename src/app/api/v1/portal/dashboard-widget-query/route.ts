// ============================================================================
// POST /api/v1/portal/dashboard-widget-query
//
// Exécute une widget query au nom d'un contact portail. SÉCURITÉ cruciale :
//   1. Le widget DOIT provenir d'un PublishedDashboard dont l'organizationId
//      correspond à celui du contact (ou est null = "toutes orgs"). Sinon
//      refus — un client ne doit pas pouvoir exécuter des queries arbitraires.
//   2. La query est FORCÉE à scoper sur organizationId = celle du contact
//      via l'injection d'un filtre `eq` — impossible pour le client de voir
//      les données d'une autre organisation, même si le widget publié avait
//      été mal configuré.
//   3. Les datasets gated par "finances" (contracts, expenses, POs, QBO) sont
//      refusés — un client ne peut pas inspecter ses propres revenus/
//      dépenses via les widgets, sauf via `canSeeBillingReports` explicite.
//
// Body attendu :
//   { publishedDashboardId: string, widgetId: string }
// Le serveur retrouve la widget config dans le snapshot et l'exécute.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { executeSingleQuery } from "@/app/api/v1/analytics/query/route";

const BODY = z.object({
  publishedDashboardId: z.string().min(1),
  widgetId: z.string().min(1),
  // Période optionnelle héritée du portail (si on ajoute un sélecteur).
  overrideDateFrom: z.string().optional(),
  overrideDateTo: z.string().optional(),
});

// Datasets financiers — refusés côté portail sauf canSeeBillingReports.
const FINANCE_DATASETS = new Set([
  "contracts", "expense_reports", "purchase_orders",
  "qbo_invoices", "qbo_customers", "qbo_payments", "qbo_expenses",
]);

export async function POST(req: Request) {
  const me = await getCurrentPortalUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.permissions.canSeeReports) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation échouée" }, { status: 400 });
  }
  const { publishedDashboardId, widgetId, overrideDateFrom, overrideDateTo } = parsed.data;

  const published = await prisma.publishedDashboard.findUnique({
    where: { id: publishedDashboardId },
  });
  if (!published) return NextResponse.json({ error: "Dashboard introuvable" }, { status: 404 });

  // Guard : le dashboard doit être scoped sur l'org du contact (ou null = global).
  if (published.organizationId && published.organizationId !== me.organizationId) {
    return NextResponse.json({ error: "Dashboard non accessible" }, { status: 403 });
  }

  const config = published.config as any;
  const widgets = Array.isArray(config?.widgets) ? config.widgets : [];
  const widget = widgets.find((w: any) => w.id === widgetId);
  if (!widget) return NextResponse.json({ error: "Widget introuvable" }, { status: 404 });

  const q = widget.query ?? {};
  const dataset = String(q.dataset ?? "");
  if (!dataset) return NextResponse.json({ error: "Widget mal formé (pas de dataset)" }, { status: 400 });

  // Gate finance : un dashboard qui interroge des datasets financiers ne peut
  // être rendu côté portail que si le contact a explicitement la permission
  // canSeeBillingReports.
  if (FINANCE_DATASETS.has(dataset) && !me.permissions.canSeeBillingReports) {
    return NextResponse.json({ error: "Données financières non accessibles" }, { status: 403 });
  }

  // INJECTION du filtre org — le client ne pourra JAMAIS voir les données
  // d'une autre organisation même si la widget query l'avait oublié.
  // On remplace tout filtre organizationId existant par le nôtre.
  const userFilters = Array.isArray(q.filters) ? q.filters : [];
  const filtersWithoutOrg = userFilters.filter((f: any) => f?.field !== "organizationId");
  const filters = [
    ...filtersWithoutOrg,
    { field: "organizationId", operator: "eq", value: me.organizationId },
  ];

  try {
    const result = await executeSingleQuery({
      dataset,
      filters,
      groupBy: q.groupBy,
      aggregate: q.aggregate ?? "count",
      aggregateField: q.aggregateField,
      sortBy: q.sortBy ?? "value",
      sortDir: q.sortDir ?? "desc",
      limit: q.limit ?? 20,
      dateField: q.dateField,
      dateFrom: overrideDateFrom ?? q.dateFrom,
      dateTo: overrideDateTo ?? q.dateTo,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
    return NextResponse.json({
      results: result.results,
      total: result.total,
      aggregate: result.aggregate,
      groupedBy: result.groupedBy,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de requête" },
      { status: 500 },
    );
  }
}
