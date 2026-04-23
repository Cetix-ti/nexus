"use client";

// Atelier Analytics — intégré dans l'onglet Rapports d'une organisation.
// Propose un accès direct aux outils centraux /analytics/widgets et
// /analytics/dashboards filtrés sur cette organisation via le query-param
// ?orgContext=<orgId>. Affiche aussi la liste actuelle des widgets et
// rapports attribués à cette org pour un aperçu rapide.
//
// Les widgets/rapports sont stockés en localStorage, donc les modifications
// sont bidirectionnelles : créer/modifier ici ou dans le centre a le même
// effet, la vue filtrée reflète l'état partagé.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, LayoutDashboard, Plus, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WidgetSummary {
  id: string;
  name: string;
  description: string;
  chartType: string;
  color: string;
  organizationId?: string;
}

interface ReportSummary {
  id: string;
  label: string;
  description: string;
  parentId?: string | null;
  organizationId?: string;
  widgets?: string[];
}

function loadWidgets(): WidgetSummary[] {
  try {
    const r = localStorage.getItem("nexus:custom-widgets-v2");
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}
function loadCustomReports(): ReportSummary[] {
  try {
    const r = localStorage.getItem("nexus:reports:custom");
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

export function OrgAnalyticsWorkbench({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [allCounts, setAllCounts] = useState({ widgets: 0, reports: 0 });

  useEffect(() => {
    function refresh() {
      const allW = loadWidgets();
      const allR = loadCustomReports();
      setAllCounts({ widgets: allW.length, reports: allR.length });
      setWidgets(allW.filter((w) => w.organizationId === organizationId));
      setReports(allR.filter((r) => r.organizationId === organizationId));
    }
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    // Recharge aussi au focus — couvre le cas où l'user ouvre l'atelier dans
    // un autre onglet, crée un widget, revient ici.
    window.addEventListener("focus", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onStorage);
    };
  }, [organizationId]);

  const orgNameEnc = encodeURIComponent(organizationName);
  const widgetsUrl = `/analytics/widgets?orgContext=${organizationId}&orgName=${orgNameEnc}`;
  const dashboardsUrl = `/analytics/dashboards?orgContext=${organizationId}&orgName=${orgNameEnc}`;

  return (
    <Card>
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" /> Atelier analytics &amp; rapports personnalisés
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Widgets et rapports custom attribués à <strong>{organizationName}</strong>. Synchronisé avec la section
              {" "}<Link href="/analytics/dashboards" className="text-blue-600 hover:underline">Analytique centrale</Link> —
              {" "}toute modification ici ou là se reflète des deux côtés.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={widgetsUrl}>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1" /> Nouveau widget
              </Button>
            </Link>
            <Link href={dashboardsUrl}>
              <Button size="sm" variant="primary">
                <LayoutDashboard className="h-3.5 w-3.5 mr-1" /> Ouvrir les rapports
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ListSection
            title={`Widgets attribués (${widgets.length})`}
            emptyLabel="Aucun widget spécifique à cette organisation."
            emptyCta={
              <Link href={widgetsUrl} className="text-[11.5px] text-blue-600 hover:text-blue-700 hover:underline font-medium">
                Créer un premier widget →
              </Link>
            }
            items={widgets.map((w) => ({
              id: w.id,
              label: w.name,
              description: w.description,
              accent: w.color,
              href: widgetsUrl,
            }))}
            globalCount={allCounts.widgets}
            globalCountLabel={`${allCounts.widgets} widgets au total`}
            globalLink="/analytics/widgets"
            globalLinkLabel="Voir tous les widgets"
          />
          <ListSection
            title={`Rapports attribués (${reports.length})`}
            emptyLabel="Aucun rapport spécifique à cette organisation."
            emptyCta={
              <Link href={dashboardsUrl} className="text-[11.5px] text-blue-600 hover:text-blue-700 hover:underline font-medium">
                Créer un premier rapport →
              </Link>
            }
            items={reports.map((r) => ({
              id: r.id,
              label: r.label,
              description: r.description || `${r.widgets?.length ?? 0} widgets`,
              accent: "#6366f1",
              href: dashboardsUrl,
            }))}
            globalCount={allCounts.reports}
            globalCountLabel={`${allCounts.reports} rapports au total`}
            globalLink="/analytics/dashboards"
            globalLinkLabel="Voir tous les rapports"
          />
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] text-slate-600 inline-flex items-start gap-2">
          <Settings className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Les boutons <strong>Nouveau widget</strong> et <strong>Ouvrir les rapports</strong> ouvrent l&apos;outil
            analytics central en <em>mode atelier organisation</em> : tout ce qui est créé depuis là est automatiquement
            attribué à <strong>{organizationName}</strong>.
          </span>
        </div>
      </div>
    </Card>
  );
}

function ListSection({
  title, items, emptyLabel, emptyCta,
  globalCount, globalCountLabel, globalLink, globalLinkLabel,
}: {
  title: string;
  items: Array<{ id: string; label: string; description: string; accent: string; href: string }>;
  emptyLabel: string;
  emptyCta: React.ReactNode;
  globalCount: number;
  globalCountLabel: string;
  globalLink: string;
  globalLinkLabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="px-3 py-2 border-b border-slate-100 text-[12px] font-semibold text-slate-800">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-center space-y-2">
          <p className="text-[12px] text-slate-500">{emptyLabel}</p>
          {emptyCta}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {items.slice(0, 10).map((it) => (
            <Link key={it.id} href={it.href}
                  className="block px-3 py-2 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-2">
                <span className="inline-block h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: it.accent }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-slate-900 truncate">{it.label}</div>
                  {it.description && (
                    <div className="text-[11px] text-slate-500 truncate">{it.description}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {items.length > 10 && (
            <div className="px-3 py-1.5 text-[10.5px] text-slate-500 text-center">
              … et {items.length - 10} autres
            </div>
          )}
        </div>
      )}
      <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10.5px] text-slate-500">{globalCountLabel}</span>
        <Link href={globalLink} className="text-[10.5px] text-slate-600 hover:text-slate-900 hover:underline">
          {globalLinkLabel} →
        </Link>
      </div>
    </div>
  );
}
