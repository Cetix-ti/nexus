"use client";

// Atelier Analytics — section dans l'onglet Rapports d'une organisation.
// Expose les dashboards (rapports custom) attribués à cette org, avec un
// bouton pour ouvrir l'atelier central /analytics/dashboards en mode
// "orgContext" pour créer/éditer des dashboards scopés à ce client.
//
// Les widgets ne sont plus attribuables à une org (décision produit) :
// on attribue les DASHBOARDS entiers, et les widgets qu'ils contiennent
// viennent du pool global. Cette section affiche donc uniquement la liste
// des dashboards taggués.
//
// Défensif : toutes les lectures localStorage sont tolérantes, et le
// rendu est wrappé dans un error boundary pour qu'une exception ici
// ne casse pas le reste de l'onglet Rapports.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Plus, ExternalLink, AlertTriangle, Calendar, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DashboardSummary {
  id: string;
  label: string;
  description?: string;
  parentId?: string | null;
  /** Liste des orgs attribuées (nouveau champ multi). */
  organizationIds?: string[];
  /** @deprecated — ancien champ single, lu pour rétrocompat. */
  organizationId?: string;
  widgets?: string[];
}

/** Retourne la liste normalisée d'orgIds attribuées à un dashboard. */
function normalizedOrgs(d: DashboardSummary): string[] {
  const arr = Array.isArray(d.organizationIds) ? d.organizationIds : [];
  if (d.organizationId && !arr.includes(d.organizationId)) return [...arr, d.organizationId];
  return arr;
}

function loadCustomDashboards(): DashboardSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const r = localStorage.getItem("nexus:reports:custom");
    const parsed = r ? JSON.parse(r) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Rapports programmés partagés avec /analytics/reports. On lit les mêmes
// entrées localStorage et on filtre par org ciblée.
interface ScheduledReportSummary {
  id: string;
  name: string;
  description?: string;
  dashboardIds?: string[];
  organizationIds?: string[];
  recipients?: string[];
  frequency?: string;
  isActive?: boolean;
}

function loadScheduledReports(): ScheduledReportSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const r = localStorage.getItem("nexus:scheduled-reports");
    const parsed = r ? JSON.parse(r) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const FREQ_LABELS: Record<string, string> = {
  weekly:     "Hebdomadaire",
  biweekly:   "Aux deux semaines",
  monthly:    "Mensuel",
  quarterly:  "Trimestriel",
  on_demand:  "Sur demande",
};

// ----------------------------------------------------------------------------
// Error boundary
// ----------------------------------------------------------------------------
interface BoundaryState { hasError: boolean; message?: string }
class WorkbenchErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(err: Error): BoundaryState {
    return { hasError: true, message: err?.message ?? "Erreur inconnue" };
  }
  componentDidCatch(err: unknown) {
    console.error("[OrgAnalyticsWorkbench]", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <div className="p-3 flex items-start gap-2 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>L&apos;atelier analytics n&apos;a pas pu se charger ({this.state.message}). Le reste de la page Rapports fonctionne normalement.</div>
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}

export function OrgAnalyticsWorkbench(props: { organizationId: string; organizationName: string }) {
  return (
    <WorkbenchErrorBoundary>
      <WorkbenchInner {...props} />
    </WorkbenchErrorBoundary>
  );
}

function WorkbenchInner({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [allDashboards, setAllDashboards] = useState<DashboardSummary[]>([]);
  const [allScheduledReports, setAllScheduledReports] = useState<ScheduledReportSummary[]>([]);

  useEffect(() => {
    function refresh() {
      setAllDashboards(loadCustomDashboards());
      setAllScheduledReports(loadScheduledReports());
    }
    refresh();
    const onStorage = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [organizationId]);

  const scoped = allDashboards.filter((d) => normalizedOrgs(d).includes(organizationId));
  const scopedScheduled = allScheduledReports.filter(
    (r) => Array.isArray(r.organizationIds) && r.organizationIds.includes(organizationId),
  );
  const orgNameEnc = encodeURIComponent(organizationName || "");
  const atelierUrl = `/analytics/dashboards?orgContext=${organizationId}&orgName=${orgNameEnc}`;

  return (
    <Card>
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-blue-600" /> Rapports personnalisés
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Dashboards attribués à <strong>{organizationName || "cette organisation"}</strong>.
              Synchronisés avec{" "}
              <Link href="/analytics/dashboards" className="text-blue-600 hover:underline">
                Analytique centrale
              </Link> — toute modification des deux côtés se reflète en temps réel.
            </p>
          </div>
          <Link href={atelierUrl}>
            <Button size="sm" variant="primary">
              <Plus className="h-3.5 w-3.5 mr-1" /> Ouvrir l&apos;atelier
            </Button>
          </Link>
        </div>

        {scoped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center">
            <p className="text-[13px] text-slate-600 mb-2">
              Aucun dashboard attribué à cette organisation.
            </p>
            <p className="text-[11.5px] text-slate-500 mb-3">
              Clique sur &laquo;&nbsp;Ouvrir l&apos;atelier&nbsp;&raquo; pour créer un dashboard
              qui sera automatiquement attribué à <strong>{organizationName}</strong>.
              Tu peux aussi attribuer un dashboard existant depuis{" "}
              <Link href="/analytics/dashboards" className="text-blue-600 hover:underline">l&apos;analytique centrale</Link>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scoped.map((d) => {
              const href = `/analytics/dashboards?orgContext=${organizationId}&orgName=${orgNameEnc}&view=${d.id}`;
              return (
                <Link
                  key={d.id}
                  href={href}
                  className="group rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-900 truncate group-hover:text-blue-700">
                        {d.label || "(sans nom)"}
                      </div>
                      {d.description && (
                        <p className="text-[11.5px] text-slate-500 truncate mt-0.5">{d.description}</p>
                      )}
                      <div className="text-[11px] text-slate-500 mt-1">
                        {d.widgets?.length ?? 0} widget{(d.widgets?.length ?? 0) > 1 ? "s" : ""}
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-blue-500 shrink-0 mt-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
          <span>Total pool de dashboards : {allDashboards.length}</span>
          <span>·</span>
          <Link href="/analytics/dashboards" className="text-slate-600 hover:text-slate-900 hover:underline">
            Voir tous les dashboards →
          </Link>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Rapports programmés assignés à cette organisation. Les dashboards */}
        {/* qu'ils contiennent s'ouvrent en mode orgContext → filtre auto.   */}
        {/* ---------------------------------------------------------------- */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" /> Rapports programmés
              </h3>
              <p className="text-[11.5px] text-slate-500 mt-0.5">
                Rapports par courriel ciblant cette organisation. Les dashboards inclus
                sont filtrés automatiquement par <strong>{organizationName || "cette organisation"}</strong>.
              </p>
            </div>
            <Link href="/analytics/reports" className="text-[11.5px] text-blue-600 hover:text-blue-700 font-medium">
              Gérer →
            </Link>
          </div>

          {scopedScheduled.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-center text-[12px] text-slate-500">
              Aucun rapport programmé n&apos;est assigné à cette organisation.
              <Link href="/analytics/reports" className="ml-1 text-blue-600 hover:underline">Créer →</Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {scopedScheduled.map((r) => {
                const dashboardIds = Array.isArray(r.dashboardIds) ? r.dashboardIds : [];
                const firstDashboard = dashboardIds[0];
                const href = firstDashboard
                  ? `/analytics/dashboards?orgContext=${organizationId}&orgName=${orgNameEnc}&view=${firstDashboard}`
                  : `/analytics/reports`;
                return (
                  <Link
                    key={r.id}
                    href={href}
                    className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm px-3 py-2 transition-all"
                  >
                    <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12.5px] font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                          {r.name || "Sans nom"}
                        </span>
                        {r.isActive === false && (
                          <span className="text-[9.5px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 rounded px-1.5">
                            Désactivé
                          </span>
                        )}
                        {r.frequency && (
                          <span className="text-[10px] text-slate-500 bg-slate-50 ring-1 ring-inset ring-slate-200 rounded px-1.5 py-0">
                            {FREQ_LABELS[r.frequency] ?? r.frequency}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{r.description}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 flex-wrap text-[10.5px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <LayoutDashboard className="h-2.5 w-2.5" />
                          {dashboardIds.length} dashboard{dashboardIds.length !== 1 ? "s" : ""}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-2.5 w-2.5" />
                          {(r.recipients ?? []).length} destinataire{(r.recipients ?? []).length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-blue-500 shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
