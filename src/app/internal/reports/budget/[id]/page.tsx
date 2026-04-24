// Page interne utilisée par Puppeteer pour rendre le PDF du budget.
// Accès gated par token signé court TTL (signBudgetToken).
//
// Server component : render direct depuis la DB pour éviter les allers-retours.

import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { verifyBudgetToken } from "@/lib/reports/budget/token";

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmt(v: number, currency = "CAD"): string {
  if (!Number.isFinite(v)) return "—";
  try { return new Intl.NumberFormat("fr-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${Math.round(v)} ${currency}`; }
}

const CATEGORY_LABELS: Record<string, string> = {
  SUBSCRIPTIONS: "Abonnements",
  LICENSES: "Licences",
  HARDWARE: "Matériel",
  OBSOLESCENCE: "Désuétude / remplacements",
  WARRANTIES: "Garanties",
  SUPPORT: "Contrats de support",
  EXTERNAL_SERVICES: "Services externes",
  PROJECTS: "Projets",
  TRAINING: "Formations",
  TELECOM: "Télécom",
  CONTINGENCY: "Contingence",
  OTHER: "Autre",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  if (!token) return notFound();
  const verified = verifyBudgetToken(token);
  if (!verified || verified.budgetId !== id) return notFound();

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true, slug: true, domain: true, clientCode: true } },
      lines: { orderBy: [{ category: "asc" }, { dueDate: "asc" }] },
    },
  });
  if (!budget) return notFound();

  // Agrège par catégorie.
  const byCategory: Record<string, { planned: number; committed: number; actual: number; lines: typeof budget.lines }> = {};
  let totalPlanned = 0, totalCommitted = 0, totalActual = 0;
  for (const l of budget.lines) {
    const k = l.category;
    if (!byCategory[k]) byCategory[k] = { planned: 0, committed: 0, actual: 0, lines: [] };
    const p = num(l.plannedAmount);
    const c = num(l.committedAmount);
    const a = num(l.actualAmount);
    byCategory[k].planned += p;
    byCategory[k].committed += c;
    byCategory[k].actual += a;
    byCategory[k].lines.push(l);
    totalPlanned += p; totalCommitted += c; totalActual += a;
  }

  const contingencyAmount = (totalPlanned * (budget.contingencyPct || 0)) / 100;
  const grandTotal = totalPlanned + contingencyAmount;

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <title>Budget TI {budget.fiscalYear} — {budget.organization.name}</title>
        <style>{`
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                 color: #1e293b; background: white; margin: 0; padding: 0; font-size: 11px; line-height: 1.45; }
          h1 { font-size: 22px; margin: 0 0 4px 0; color: #0f172a; }
          h2 { font-size: 14px; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; color: #0f172a; }
          h3 { font-size: 12px; margin: 10px 0 4px 0; color: #1e293b; }
          .muted { color: #64748b; }
          .cover { padding: 30mm 10mm 10mm; page-break-after: always; }
          .cover .brand { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
          .cover h1 { font-size: 28px; margin-top: 4px; }
          .cover .client { font-size: 18px; margin-top: 20px; color: #334155; }
          .cover .year { font-size: 14px; margin-top: 40px; color: #64748b; }
          .section { padding: 0 8mm; page-break-inside: avoid; }
          .kpis { display: flex; gap: 8px; margin: 10px 0; }
          .kpi { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
          .kpi .label { font-size: 9px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
          .kpi .value { font-size: 15px; font-weight: 600; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
          th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
          td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .cat-header { display: flex; justify-content: space-between; align-items: baseline; margin-top: 16px; }
          .cat-total { font-size: 12px; font-weight: 600; color: #0f172a; }
          .summary-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
          .summary-row.total { border-top: 2px solid #0f172a; border-bottom: none; font-weight: 600; padding-top: 8px; margin-top: 4px; font-size: 13px; }
        `}</style>
      </head>
      <body>
        <div className="cover">
          <div className="brand">Cetix · Services informatiques</div>
          <h1>Budget TI {budget.fiscalYear}</h1>
          <div className="client">{budget.organization.name}</div>
          {budget.summary && <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>{budget.summary}</p>}
          <div className="year">
            Statut : {budget.status === "APPROVED" ? "Approuvé" : budget.status === "EXECUTING" ? "En exécution" : budget.status}
            {budget.approvedAt && ` · Signé le ${new Date(budget.approvedAt).toLocaleDateString("fr-CA")}`}
          </div>
        </div>

        <div className="section">
          <h2>Synthèse</h2>
          <div className="kpis">
            <div className="kpi"><div className="label">Prévu</div><div className="value">{fmt(totalPlanned, budget.currency)}</div></div>
            <div className="kpi"><div className="label">Engagé</div><div className="value">{fmt(totalCommitted, budget.currency)}</div></div>
            <div className="kpi"><div className="label">Réalisé</div><div className="value">{fmt(totalActual, budget.currency)}</div></div>
            <div className="kpi"><div className="label">Contingence {budget.contingencyPct}%</div><div className="value">{fmt(contingencyAmount, budget.currency)}</div></div>
          </div>
          <div className="summary-row total">
            <span>Total incluant contingence</span>
            <span>{fmt(grandTotal, budget.currency)}</span>
          </div>

          <h2>Répartition par catégorie</h2>
          <table>
            <thead>
              <tr>
                <th>Catégorie</th>
                <th className="num">Lignes</th>
                <th className="num">Prévu</th>
                <th className="num">Engagé</th>
                <th className="num">Réalisé</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byCategory)
                .sort((a, b) => b[1].planned - a[1].planned)
                .map(([cat, v]) => {
                  const pct = totalPlanned > 0 ? Math.round((v.planned / totalPlanned) * 100) : 0;
                  return (
                    <tr key={cat}>
                      <td>{CATEGORY_LABELS[cat] ?? cat}</td>
                      <td className="num">{v.lines.length}</td>
                      <td className="num">{fmt(v.planned, budget.currency)}</td>
                      <td className="num">{fmt(v.committed, budget.currency)}</td>
                      <td className="num">{fmt(v.actual, budget.currency)}</td>
                      <td className="num">{pct}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {Object.entries(byCategory).map(([cat, v]) => (
          <div key={cat} className="section" style={{ pageBreakInside: "avoid" as const }}>
            <div className="cat-header">
              <h3>{CATEGORY_LABELS[cat] ?? cat}</h3>
              <span className="cat-total">{fmt(v.planned, budget.currency)}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th>Fournisseur</th>
                  <th>Échéance</th>
                  <th className="num">Prévu</th>
                  <th className="num">Réalisé</th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td className="muted">{l.vendor ?? "—"}</td>
                    <td className="muted">{l.dueDate ? new Date(l.dueDate).toLocaleDateString("fr-CA") : "—"}</td>
                    <td className="num">{fmt(num(l.plannedAmount), l.currency)}</td>
                    <td className="num">{num(l.actualAmount) > 0 ? fmt(num(l.actualAmount), l.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </body>
    </html>
  );
}
