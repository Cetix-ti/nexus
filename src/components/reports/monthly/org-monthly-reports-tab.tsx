// ============================================================================
// OrgMonthlyReportsTab — Onglet "Rapports mensuels" de la fiche organisation.
//
// - Liste les rapports mensuels existants pour l'org
// - Génère un nouveau rapport pour un mois choisi
// - Régénère / publie / dépublie / télécharge un rapport existant
// - Toggle auto-publish pour l'organisation
// ============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface ReportItem {
  id: string;
  period: string; // YYYY-MM
  generatedAt: string;
  generatedByName: string | null;
  fileSizeBytes: number | null;
  hasPdf: boolean;
  publishedToPortal: boolean;
  publishedAt: string | null;
}

function monthsAround(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  // 12 derniers mois + mois courant, ordre décroissant (plus récent en haut).
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-CA", {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

// ---------------------------------------------------------------------------
// Localisation des dashboards "Rapport mensuel" pour une org dans le
// localStorage agent.
//
// Architecture :
//   - `nexus:reports:custom`     : dashboards (avec `widgets: WidgetId[]` =
//                                  juste des IDs) + tags + organizationIds
//   - `nexus:custom-widgets-v2`  : définitions complètes des CustomWidget
//                                  (query, chartType, style…). Les widgets
//                                  built-in (id sans préfixe "custom_") ne
//                                  sont PAS dans ce store et ne sont donc
//                                  pas exécutables côté serveur — on les
//                                  skip silencieusement.
//
// Pour qu'un dashboard apparaisse dans le bouton "PDF + graphiques", il
// doit :
//   - avoir le tag "builtin_rapport_mensuel"
//   - être attribué à l'org cible (organizationIds inclut orgId)
//   - contenir au moins UN widget custom (built-ins seuls = skip)
// ---------------------------------------------------------------------------
const RAPPORT_MENSUEL_TAG_ID = "builtin_rapport_mensuel";
const CUSTOM_REPORTS_KEY = "nexus:reports:custom";
const CUSTOM_WIDGETS_KEY = "nexus:custom-widgets-v2";

interface CustomWidgetDef {
  id: string;
  name: string;
  description?: string;
  chartType: string;
  color?: string;
  style?: Record<string, unknown>;
  query: Record<string, unknown>;
}

interface DashboardRaw {
  id: string;
  label: string;
  description?: string;
  organizationIds?: string[];
  tags?: string[];
  /** Liste d'IDs de widgets (built-in ex: "finance_kpis" ou custom ex:
   *  "custom_1234567890"). On hydrate les custom au moment de l'export. */
  widgets?: string[];
}

interface DashboardForExport {
  id: string;
  label: string;
  description?: string;
  /** Widgets hydratés (custom uniquement, built-ins skippés). */
  hydratedWidgets: CustomWidgetDef[];
}

function loadCustomWidgets(): Map<string, CustomWidgetDef> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(CUSTOM_WIDGETS_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Map();
    const map = new Map<string, CustomWidgetDef>();
    for (const w of arr) {
      if (w && typeof w.id === "string") map.set(w.id, w as CustomWidgetDef);
    }
    return map;
  } catch {
    return new Map();
  }
}

function loadGraphDashboardsForOrg(orgId: string): DashboardForExport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_REPORTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const widgetMap = loadCustomWidgets();

    return (arr as DashboardRaw[])
      .filter((d) => {
        const orgs = Array.isArray(d.organizationIds) ? d.organizationIds : [];
        const tags = Array.isArray(d.tags) ? d.tags : [];
        return orgs.includes(orgId) && tags.includes(RAPPORT_MENSUEL_TAG_ID);
      })
      .map((d) => {
        const widgetIds = Array.isArray(d.widgets) ? d.widgets : [];
        const hydrated = widgetIds
          .map((wid) => widgetMap.get(wid))
          .filter((w): w is CustomWidgetDef => !!w);
        return {
          id: d.id,
          label: d.label,
          description: d.description,
          hydratedWidgets: hydrated,
        };
      })
      // On garde uniquement les dashboards qui ont AU MOINS un widget
      // custom (sinon le PDF aurait une page d'annexe vide).
      .filter((d) => d.hydratedWidgets.length > 0);
  } catch {
    return [];
  }
}

function toSnapshot(d: DashboardForExport) {
  return {
    id: d.id,
    label: d.label,
    description: d.description,
    widgets: d.hydratedWidgets.map((w) => ({
      id: w.id,
      title: w.name ?? "",
      chartType: w.chartType ?? "bar",
      // span : pas porté par CustomWidget v2 ; on prend 6 par défaut
      // (demi-largeur), sauf si le dashboard d'origine porte une info de
      // layout (à brancher plus tard si besoin).
      span: 6,
      query: w.query ?? {},
      style: { ...(w.style ?? {}), primaryColor: w.color ?? "#3B82F6" },
    })),
  };
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function fmtMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrgMonthlyReportsTab({
  organizationId,
  initialAutoPublish,
}: {
  organizationId: string;
  initialAutoPublish: boolean;
}) {
  const months = monthsAround();
  const [period, setPeriod] = useState<string>(months[1]?.value ?? months[0].value);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPublish, setAutoPublish] = useState(initialAutoPublish);
  const [autoSaving, setAutoSaving] = useState(false);

  // Détection des dashboards "Rapport mensuel" attribués à cette org dans
  // le localStorage agent. Source : `nexus:reports:custom` (custom) +
  // catalogue built-in (importé statiquement). Filtre :
  //   - tags inclut "builtin_rapport_mensuel"
  //   - organizationIds inclut organizationId
  // Si > 0 → on affiche le bouton "PDF avec graphiques".
  const [graphDashboards, setGraphDashboards] = useState<DashboardForExport[]>([]);
  useEffect(() => {
    setGraphDashboards(loadGraphDashboardsForOrg(organizationId));
    // Re-check sur visibilitychange pour rester à jour si l'agent attribue
    // un dashboard à l'org dans un autre onglet et revient.
    const onFocus = () => setGraphDashboards(loadGraphDashboardsForOrg(organizationId));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [organizationId]);

  // POST le snapshot des dashboards au serveur, récupère le PDF en blob,
  // ouvre dans un nouvel onglet. `withAmounts=true` pour la version interne.
  const downloadWithGraphs = async (reportId: string, withAmounts: boolean) => {
    if (graphDashboards.length === 0) return;
    setBusyId(reportId);
    try {
      const r = await fetch(`/api/v1/reports/monthly/${reportId}/pdf-with-graphs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboards: graphDashboards.map(toSnapshot),
          hideRates: !withAmounts,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      // Libère l'objet URL après quelques secondes (le tab a déjà chargé).
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/v1/reports/monthly?organizationId=${encodeURIComponent(organizationId)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/reports/monthly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          period,
          overwrite: true,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${r.status}`);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const togglePublish = async (id: string, publish: boolean) => {
    setBusyId(id);
    try {
      const r = await fetch(`/api/v1/reports/monthly/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce rapport ? Le PDF sera effacé du disque.")) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/v1/reports/monthly/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const saveAutoPublish = async (next: boolean) => {
    setAutoSaving(true);
    try {
      const r = await fetch(`/api/v1/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyReportAutoPublish: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAutoPublish(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Générer un rapport mensuel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">
            Génère un rapport PDF complet pour le client (heures facturées,
            tickets, déplacements, demandeurs). Le rapport est stocké et peut
            être publié au portail client.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Mois couvert
              </label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Générer le rapport
                </>
              )}
            </Button>
          </div>
          {error ? (
            <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Publication automatique
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-slate-600 max-w-xl">
              Si activé, les rapports mensuels générés pour ce client sont
              automatiquement publiés au portail (visibles par les
              utilisateurs avec la permission facturation). Sinon, un agent
              doit les publier manuellement.
            </div>
            <Switch
              checked={autoPublish}
              disabled={autoSaving}
              onCheckedChange={saveAutoPublish}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapports existants</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 italic">
              Aucun rapport généré pour ce client.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium text-slate-900">
                      {fmtMonth(r.period)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Généré le {fmtDateTime(r.generatedAt)}
                      {r.generatedByName ? ` · par ${r.generatedByName}` : ""}
                      {" · "}
                      {fmtBytes(r.fileSizeBytes)}
                    </div>
                  </div>
                  {r.publishedToPortal ? (
                    <Badge variant="success">Publié au portail</Badge>
                  ) : (
                    <Badge variant="outline">Brouillon</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    title="Rapport PDF officiel (heures + déplacements, sans montants)"
                  >
                    <a
                      href={`/api/v1/reports/monthly/${r.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    title="Variante interne avec montants $ (agents seulement)"
                  >
                    <a
                      href={`/api/v1/reports/monthly/${r.id}/pdf?variant=with_amounts`}
                      target="_blank"
                      rel="noopener"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Avec montants&nbsp;$
                    </a>
                  </Button>
                  {/* PDF avec graphiques — visible uniquement si l'agent a au
                      moins un dashboard custom tagué "Rapport mensuel"
                      attribué à cette org dans son localStorage. Le snapshot
                      est envoyé au serveur qui rend les widgets en annexe. */}
                  {graphDashboards.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === r.id}
                      title={`PDF officiel + ${graphDashboards.length} dashboard${graphDashboards.length > 1 ? "s" : ""} en annexe`}
                      onClick={() => downloadWithGraphs(r.id, false)}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <BarChart3 className="h-4 w-4 mr-1" />
                      )}
                      PDF + graphiques
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => togglePublish(r.id, !r.publishedToPortal)}
                  >
                    {busyId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : r.publishedToPortal ? (
                      <>Dépublier</>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" />
                        Publier
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === r.id}
                    title="Régénérer le rapport (recalcule depuis la DB)"
                    onClick={async () => {
                      setBusyId(r.id);
                      try {
                        await fetch(`/api/v1/reports/monthly`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            organizationId,
                            period: r.period,
                            overwrite: true,
                          }),
                        });
                        await reload();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={busyId === r.id}
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
