// ============================================================================
// PortalMonthlyReportsSection — Section "Rapports mensuels" affichée dans
// le portail client, page /portal/reports.
//
// N'affiche que les rapports publiés. Permission côté API
// (canSeeBillingReports OU portalRole ADMIN) — ce composant reste rendu
// même sans résultats pour être visible aux utilisateurs autorisés.
// ============================================================================

"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

interface PortalReportItem {
  id: string;
  period: string;
  generatedAt: string;
  publishedAt: string | null;
  fileSizeBytes: number | null;
}

function fmtMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function PortalMonthlyReportsSection() {
  const [items, setItems] = useState<PortalReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/portal/reports/monthly")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Loading silencieux : on ne rend rien tant qu'on ne sait pas s'il
  // y a des rapports publiés. Avant : on affichait une carte avec un
  // spinner "Chargement…" puis on faisait `return null` quand items était
  // vide → flash visuel d'1-2 secondes (carte qui apparait puis
  // disparait) très désagréable côté portail. Maintenant la carte
  // n'apparait QUE quand il y a au moins un rapport à montrer.
  if (loading || items.length === 0) return null;

  // void Loader2 — l'import est conservé au cas où on voudrait revenir
  // à un loader visible plus tard. Réservé pour l'instant.
  void Loader2;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          Rapports mensuels
        </h2>
        <span className="text-[11px] text-slate-500">
          {items.length} rapport{items.length > 1 ? "s" : ""} disponible
          {items.length > 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-[12px] text-slate-500 mb-4">
        Portrait complet du mois — heures facturées, tickets, déplacements et
        demandeurs. Cliquez sur un mois pour ouvrir le PDF.
      </p>
      <div className="divide-y divide-slate-100">
        {items.map((r) => (
          <a
            key={r.id}
            href={`/api/v1/portal/reports/monthly/${r.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-between py-3 group hover:bg-slate-50 -mx-3 px-3 rounded transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-[14px] font-medium text-slate-900 group-hover:text-blue-700">
                  {fmtMonth(r.period)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Publié le{" "}
                  {(r.publishedAt ?? r.generatedAt).slice(0, 10)}
                  {r.fileSizeBytes ? ` · ${fmtBytes(r.fileSizeBytes)}` : ""}
                </div>
              </div>
            </div>
            <Download className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
          </a>
        ))}
      </div>
    </div>
  );
}
