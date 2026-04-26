// ============================================================================
// OrgMonthlyReportsTab — Onglet "Rapports mensuels" de la fiche organisation.
//
// - Liste les rapports mensuels existants pour l'org
// - Génère un nouveau rapport pour un mois choisi
// - Régénère / publie / dépublie / télécharge un rapport existant
// - Toggle auto-publish pour l'organisation
// ============================================================================

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
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

type PortalVariant = "BOTH" | "WITH_RATES" | "HOURS_ONLY";

export function OrgMonthlyReportsTab({
  organizationId,
  initialAutoPublish,
  initialPortalVariant = "BOTH",
}: {
  organizationId: string;
  initialAutoPublish: boolean;
  initialPortalVariant?: PortalVariant;
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
  const [portalVariant, setPortalVariant] = useState<PortalVariant>(initialPortalVariant);
  const [variantSaving, setVariantSaving] = useState(false);

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

  const savePortalVariant = async (next: PortalVariant) => {
    setVariantSaving(true);
    try {
      const r = await fetch(`/api/v1/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientPortalReportVariant: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPortalVariant(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVariantSaving(false);
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
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Variantes du rapport sur le portail client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-3">
            Détermine quelle{portalVariant === "BOTH" ? "s versions sont" : " version est"} accessible{portalVariant === "BOTH" ? "s" : ""} aux utilisateurs du portail client. Côté agent, les deux variantes restent toujours disponibles peu importe ce paramètre.
          </p>
          <Select
            value={portalVariant}
            onValueChange={(v) => savePortalVariant(v as PortalVariant)}
            disabled={variantSaving}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOTH">
                Les deux versions (avec tarifs $ et heures seulement)
              </SelectItem>
              <SelectItem value="WITH_RATES">
                Seulement avec tarifs $ (montants visibles)
              </SelectItem>
              <SelectItem value="HOURS_ONLY">
                Seulement heures (sans montants $)
              </SelectItem>
            </SelectContent>
          </Select>
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
                    title="PDF complet avec tarifs"
                  >
                    <Link href={`/analytics/monthly-reports/${r.id}/preview`}>
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    title="PDF heures seulement (sans montants $)"
                  >
                    <Link
                      href={`/analytics/monthly-reports/${r.id}/preview?variant=hours_only`}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Heures
                    </Link>
                  </Button>
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
