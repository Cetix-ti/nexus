"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Settings as SettingsIcon,
  ExternalLink,
  Search,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  mockTenantIntegrations,
} from "@/lib/integrations/mock-data";
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_VARIANTS,
  INTEGRATION_CATEGORY_LABELS,
  type TenantIntegration,
  type IntegrationCategory,
} from "@/lib/integrations/types";

const PROVIDER_COLORS: Record<string, string> = {
  atera: "from-emerald-500 to-teal-600",
  ninja_one: "from-red-500 to-rose-600",
  quickbooks_online: "from-green-600 to-emerald-700",
  slack: "from-fuchsia-500 to-purple-600",
  microsoft_teams: "from-violet-500 to-indigo-600",
  pagerduty: "from-emerald-600 to-green-700",
  it_glue: "from-blue-500 to-indigo-600",
  veeam: "from-emerald-500 to-green-600",
};

function getProviderInitials(name: string): string {
  return name
    .split(/[\s_]/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function relativeTime(iso?: string): string {
  if (!iso) return "Jamais";
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  return `il y a ${Math.round(diff / 86400)} j`;
}

export function IntegrationsSection() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    IntegrationCategory | "all"
  >("all");
  const [integrations, setIntegrations] = useState<TenantIntegration[]>(
    mockTenantIntegrations
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);

  // Auto-test Atera at mount to reflect real state instead of hardcoded mock
  useEffect(() => {
    fetch("/api/v1/integrations/atera/test")
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        setIntegrations((prev) =>
          prev.map((i) =>
            i.provider === "atera"
              ? {
                  ...i,
                  status: "connected",
                  totalRecordsSynced: json.data.customerCount,
                  lastSyncAt: new Date().toISOString(),
                }
              : i
          )
        );
      })
      .catch(() => {
        /* leave as not_connected */
      });
  }, []);

  const filtered = useMemo(() => {
    return integrations.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !i.name.toLowerCase().includes(q) &&
          !i.description.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [integrations, search, categoryFilter]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<IntegrationCategory, TenantIntegration[]>();
    for (const integ of filtered) {
      if (!map.has(integ.category)) map.set(integ.category, []);
      map.get(integ.category)!.push(integ);
    }
    return Array.from(map.entries());
  }, [filtered]);

  async function handleTestAtera(integ: TenantIntegration) {
    setTestingId(integ.id);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/integrations/atera/test");
      const json = await res.json();
      if (json.success) {
        setTestResult({
          id: integ.id,
          ok: true,
          message: `Connexion réussie — ${json.data.customerCount} clients trouvés dans Atera`,
        });
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === integ.id
              ? {
                  ...i,
                  status: "connected",
                  lastSyncAt: new Date().toISOString(),
                  totalRecordsSynced: json.data.customerCount,
                }
              : i
          )
        );
      } else {
        setTestResult({
          id: integ.id,
          ok: false,
          message: json.error || "Erreur de connexion",
        });
      }
    } catch (err) {
      setTestResult({
        id: integ.id,
        ok: false,
        message: err instanceof Error ? err.message : "Erreur réseau",
      });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Intégrations
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Connectez Nexus à vos outils externes pour synchroniser actifs,
          factures et notifications
        </p>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Rechercher une intégration..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
          <button
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              categoryFilter === "all"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Toutes
          </button>
          {Object.entries(INTEGRATION_CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key as IntegrationCategory)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
                categoryFilter === key
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped integration cards */}
      {grouped.map(([category, items]) => (
        <div key={category}>
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3">
            {INTEGRATION_CATEGORY_LABELS[category]}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((integ) => {
              const isConnected = integ.status === "connected";
              const hasError =
                integ.status === "error" || integ.status === "expired_token";
              const gradient =
                PROVIDER_COLORS[integ.provider] ||
                "from-slate-500 to-slate-700";

              return (
                <Card key={integ.id} className="card-hover">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white text-[13px] font-bold shadow-sm shrink-0",
                          gradient
                        )}
                      >
                        {getProviderInitials(integ.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[14px] font-semibold text-slate-900 truncate">
                            {integ.name}
                          </h4>
                          <Badge
                            variant={CONNECTION_STATUS_VARIANTS[integ.status]}
                          >
                            {integ.status === "connected" && (
                              <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} />
                            )}
                            {hasError && (
                              <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
                            )}
                            {CONNECTION_STATUS_LABELS[integ.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-slate-500 line-clamp-2">
                          {integ.description}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    {isConnected && (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-[11.5px]">
                        <div>
                          <p className="text-slate-500">Dernière sync</p>
                          <p className="font-medium text-slate-700 mt-0.5 inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {relativeTime(integ.lastSyncAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Enregistrements</p>
                          <p className="font-medium text-slate-700 mt-0.5 tabular-nums">
                            {integ.totalRecordsSynced.toLocaleString("fr-CA")}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Error message */}
                    {hasError && integ.lastErrorMessage && (
                      <div className="mt-3 pt-3 border-t border-slate-100 rounded-md bg-red-50/40 px-3 py-2 text-[11px] text-red-700">
                        {integ.lastErrorMessage}
                      </div>
                    )}

                    {/* Test result for this integration */}
                    {testResult && testResult.id === integ.id && (
                      <div
                        className={cn(
                          "mt-3 rounded-md px-3 py-2 text-[11px] ring-1 ring-inset",
                          testResult.ok
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200/60"
                            : "bg-red-50 text-red-700 ring-red-200/60"
                        )}
                      >
                        {testResult.message}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {integ.provider === "atera" && (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={testingId === integ.id}
                            onClick={() => handleTestAtera(integ)}
                          >
                            <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
                            Tester
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <SettingsIcon className="h-3 w-3" strokeWidth={2.25} />
                          Configurer
                        </Button>
                      </div>
                      {isConnected ? (
                        <button className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700">
                          Détails
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      ) : (
                        <Button variant="primary" size="sm">
                          <Plug className="h-3 w-3" strokeWidth={2.25} />
                          Connecter
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Add custom integration */}
      <Card className="border-dashed">
        <CardContent className="p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-slate-900">
                Suggérer une intégration
              </h4>
              <p className="text-[11.5px] text-slate-500">
                Vous utilisez un outil qui n&apos;est pas listé ? Contactez le
                support.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            Demander
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
