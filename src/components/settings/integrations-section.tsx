"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  quickbooks_online: "from-green-600 to-emerald-700",
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
  const searchParams = useSearchParams();
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
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [showQboConfig, setShowQboConfig] = useState(false);
  const [qboSaving, setQboSaving] = useState(false);
  const [qboForm, setQboForm] = useState({
    clientId: "", clientSecret: "", redirectUri: "", sandbox: true,
    realmId: "", accessToken: "", refreshToken: "", companyName: "",
  });

  // Load QBO config when panel opens
  useEffect(() => {
    if (showQboConfig) {
      fetch("/api/v1/integrations/quickbooks/config")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d) setQboForm({
            clientId: d.clientId || "",
            clientSecret: d.clientSecret || "",
            redirectUri: d.redirectUri || "",
            sandbox: d.sandbox ?? true,
            realmId: d.realmId || "",
            accessToken: d.accessToken || "",
            refreshToken: d.refreshToken || "",
            companyName: d.companyName || "",
          });
        })
        .catch(() => {});
    }
  }, [showQboConfig]);

  async function saveQboConfig() {
    setQboSaving(true);
    try {
      const res = await fetch("/api/v1/integrations/quickbooks/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qboForm),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ id: "int_quickbooks", ok: true, message: "Configuration QuickBooks sauvegardée avec succès" + (data.isConnected ? ` — Connecté à ${data.companyName || "QuickBooks"}` : "") });
        setShowQboConfig(false);
        // Refresh status
        fetch("/api/v1/integrations/quickbooks")
          .then((r) => r.ok ? r.json() : null)
          .then((s) => {
            if (s?.isConnected) {
              setIntegrations((prev) =>
                prev.map((i) => i.provider === "quickbooks_online" ? { ...i, status: "connected", connectedAt: s.connectedAt } : i)
              );
            }
          });
      } else {
        setTestResult({ id: "int_quickbooks", ok: false, message: data.error || "Erreur de sauvegarde" });
      }
    } catch {
      setTestResult({ id: "int_quickbooks", ok: false, message: "Erreur réseau" });
    } finally {
      setQboSaving(false);
    }
  }

  async function disconnectQbo() {
    if (!confirm("Déconnecter QuickBooks ? Les tokens seront supprimés.")) return;
    try {
      await fetch("/api/v1/integrations/quickbooks/config", { method: "DELETE" });
      setIntegrations((prev) =>
        prev.map((i) => i.provider === "quickbooks_online" ? { ...i, status: "not_connected", connectedAt: undefined, lastSyncAt: undefined, totalRecordsSynced: 0 } : i)
      );
      setTestResult({ id: "int_quickbooks", ok: true, message: "QuickBooks déconnecté" });
    } catch {}
  }

  // Show QBO OAuth result from callback redirect
  useEffect(() => {
    const qbo = searchParams.get("qbo");
    if (qbo === "success") {
      setTestResult({ id: "int_quickbooks", ok: true, message: "Connexion QuickBooks réussie !" });
    } else if (qbo === "error" || qbo === "missing") {
      setTestResult({ id: "int_quickbooks", ok: false, message: "Erreur lors de la connexion à QuickBooks. Veuillez réessayer." });
    }
  }, [searchParams]);

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
      .catch(() => {});
  }, []);

  // Auto-check QuickBooks connection status at mount
  useEffect(() => {
    fetch("/api/v1/integrations/quickbooks")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        if (data.isConnected) {
          setIntegrations((prev) =>
            prev.map((i) =>
              i.provider === "quickbooks_online"
                ? {
                    ...i,
                    status: "connected",
                    connectedAt: data.connectedAt,
                    lastSyncAt: data.connectedAt,
                    totalRecordsSynced: 0,
                  }
                : i
            )
          );
        }
      })
      .catch(() => {});
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

  async function handleConnectQuickBooks(integ: TenantIntegration) {
    setConnectingProvider(integ.provider);
    try {
      const res = await fetch("/api/v1/integrations/quickbooks");
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.isConnected) {
        setTestResult({ id: integ.id, ok: true, message: "QuickBooks est déjà connecté." });
      } else if (!data.hasCredentials) {
        setTestResult({ id: integ.id, ok: false, message: "Identifiants QuickBooks manquants. Configurez QUICKBOOKS_CLIENT_ID et QUICKBOOKS_CLIENT_SECRET dans le fichier .env" });
      } else {
        setTestResult({ id: integ.id, ok: false, message: data.error || "Erreur inconnue lors de la connexion QuickBooks." });
      }
    } catch (err) {
      setTestResult({ id: integ.id, ok: false, message: err instanceof Error ? err.message : "Erreur réseau" });
    } finally {
      setConnectingProvider(null);
    }
  }

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
                        {integ.provider === "quickbooks_online" && isConnected && (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={testingId === integ.id}
                            onClick={async () => {
                              setTestingId(integ.id);
                              setTestResult(null);
                              try {
                                const res = await fetch("/api/v1/integrations/quickbooks/sync?section=invoices");
                                const data = await res.json();
                                if (data.error) {
                                  setTestResult({ id: integ.id, ok: false, message: data.error });
                                } else {
                                  const count = data.invoices?.length ?? 0;
                                  setTestResult({ id: integ.id, ok: true, message: `Connexion réussie — ${count} factures trouvées dans QuickBooks` });
                                  setIntegrations((prev) =>
                                    prev.map((i) =>
                                      i.id === integ.id
                                        ? { ...i, lastSyncAt: new Date().toISOString(), totalRecordsSynced: count }
                                        : i
                                    )
                                  );
                                }
                              } catch (err) {
                                setTestResult({ id: integ.id, ok: false, message: err instanceof Error ? err.message : "Erreur réseau" });
                              } finally {
                                setTestingId(null);
                              }
                            }}
                          >
                            <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
                            Tester
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => {
                          if (integ.provider === "quickbooks_online") setShowQboConfig(!showQboConfig);
                        }}>
                          <SettingsIcon className="h-3 w-3" strokeWidth={2.25} />
                          Configurer
                        </Button>
                      </div>
                      {isConnected ? (
                        integ.provider === "quickbooks_online" ? (
                          <button onClick={disconnectQbo} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700">
                            Déconnecter
                          </button>
                        ) : (
                          <button className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700">
                            Détails
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        )
                      ) : integ.provider === "quickbooks_online" ? (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={connectingProvider === integ.provider}
                          onClick={() => handleConnectQuickBooks(integ)}
                        >
                          <Plug className="h-3 w-3" strokeWidth={2.25} />
                          Connecter
                        </Button>
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

      {/* QuickBooks Configuration Panel */}
      {showQboConfig && (
        <Card className="border-green-200 bg-green-50/20">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center text-white text-[10px] font-bold">QB</div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Configuration QuickBooks Online</h3>
                  <p className="text-[11px] text-slate-500">Remplissez les champs puis cliquez Enregistrer</p>
                </div>
              </div>
              <button onClick={() => setShowQboConfig(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100">&times;</button>
            </div>

            {/* Section 1: OAuth App Credentials */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <h4 className="text-[12px] font-semibold text-slate-800">1. Identifiants de l&apos;application OAuth2</h4>
              <p className="text-[11px] text-slate-400">Disponibles dans votre app sur <a href="https://developer.intuit.com/app/developer/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developer.intuit.com</a></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Client ID <span className="text-red-500">*</span></label>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="ABxxxxxxxxxxxxxxxxxx" value={qboForm.clientId} onChange={(e) => setQboForm((f) => ({ ...f, clientId: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Client Secret <span className="text-red-500">*</span></label>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={qboForm.clientSecret} onChange={(e) => setQboForm((f) => ({ ...f, clientSecret: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Redirect URI</label>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="https://nexus.cetix.ca/api/v1/integrations/quickbooks/callback" value={qboForm.redirectUri} onChange={(e) => setQboForm((f) => ({ ...f, redirectUri: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Environnement</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="qbo-env" checked={qboForm.sandbox} onChange={() => setQboForm((f) => ({ ...f, sandbox: true }))} className="accent-green-600" />
                      <span className="text-[13px] text-slate-700">Sandbox (test)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="qbo-env" checked={!qboForm.sandbox} onChange={() => setQboForm((f) => ({ ...f, sandbox: false }))} className="accent-green-600" />
                      <span className="text-[13px] font-medium text-slate-900">Production</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Connection (manual tokens) */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <h4 className="text-[12px] font-semibold text-slate-800">2. Connexion au compte QuickBooks</h4>
              <p className="text-[11px] text-slate-400">
                <strong>Option A :</strong> Enregistrez la section 1, puis utilisez le bouton « Connecter » pour l&apos;OAuth automatique.<br />
                <strong>Option B :</strong> Entrez manuellement les tokens ci-dessous pour une connexion directe.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Realm ID (Company ID)</label>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-mono focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="123456789" value={qboForm.realmId} onChange={(e) => setQboForm((f) => ({ ...f, realmId: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Nom de la compagnie</label>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="Cetix Inc." value={qboForm.companyName} onChange={(e) => setQboForm((f) => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Access Token</label>
                  <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-mono h-16 resize-y focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6..." value={qboForm.accessToken} onChange={(e) => setQboForm((f) => ({ ...f, accessToken: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">Refresh Token</label>
                  <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-mono h-16 resize-y focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" placeholder="AB11..." value={qboForm.refreshToken} onChange={(e) => setQboForm((f) => ({ ...f, refreshToken: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Status + Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-green-200">
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <p>Environnement : <strong>{qboForm.sandbox ? "Sandbox" : "Production"}</strong></p>
                {qboForm.realmId && <p>Realm ID : <span className="font-mono">{qboForm.realmId}</span></p>}
                {qboForm.accessToken && <p className="text-emerald-600 font-medium">✓ Access token fourni</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowQboConfig(false)}>Annuler</Button>
                <Button variant="primary" size="sm" loading={qboSaving} onClick={saveQboConfig}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
