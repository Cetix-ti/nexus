"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  FolderOpen,
  Save,
  Mail,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface GraphConfig {
  mailbox: string;
  folderPath: string;
}

interface ExpiryInfo {
  expiryDate: string | null;
  daysLeft: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

const EMPTY: GraphConfig = {
  mailbox: "",
  folderPath: "Inbox",
};

export function VeeamSection() {
  const [config, setConfig] = useState<GraphConfig>(EMPTY);
  const [expiry, setExpiry] = useState<ExpiryInfo | null>(null);
  const [hasAzureCreds, setHasAzureCreds] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncPeriod, setSyncPeriod] = useState("30");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    folders?: string[];
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    fetched: number;
    newAlerts: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings/veeam")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) setConfig(data.config);
        if (data.expiry) setExpiry(data.expiry);
        setHasAzureCreds(!!data.hasAzureCredentials);
      })
      .catch(() => {});
  }, []);

  function upd<K extends keyof GraphConfig>(key: K, value: GraphConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setSaved(false);
    setSaveError(null);
  }

  const canSubmit = !!(config.mailbox && hasAzureCreds);

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/v1/settings/veeam", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      setSaved(true);
      setDirty(false);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/settings/veeam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox: config.mailbox }),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
    if (dirty) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const sinceDays = syncPeriod === "all" ? 0 : Number(syncPeriod);
      const res = await fetch("/api/v1/veeam/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDays }),
      });
      setSyncResult(await res.json());
    } catch (err) {
      setSyncResult({
        fetched: 0,
        newAlerts: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Sauvegardes Veeam
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Connectez la boîte mail qui reçoit les alertes Veeam via Microsoft
          Graph pour surveiller automatiquement les tâches de sauvegarde de vos
          clients.
        </p>
      </div>

      {/* Secret expiry warning */}
      {expiry?.isExpired && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-900">
              Secret Azure expiré
            </p>
            <p className="text-[12px] text-red-700 mt-0.5">
              Le secret client a expiré le {expiry.expiryDate}. Créez un nouveau
              secret dans{" "}
              <a
                href="https://entra.microsoft.com"
                target="_blank"
                rel="noopener"
                className="underline font-medium"
              >
                Entra ID
              </a>{" "}
              et mettez à jour AZURE_CLIENT_SECRET dans le fichier .env du
              serveur.
            </p>
          </div>
        </div>
      )}
      {expiry?.isExpiringSoon && !expiry.isExpired && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900">
              Secret Azure expire bientôt
            </p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              Le secret client expire le {expiry.expiryDate} ({expiry.daysLeft}{" "}
              jour{(expiry.daysLeft ?? 0) > 1 ? "s" : ""} restant
              {(expiry.daysLeft ?? 0) > 1 ? "s" : ""}). Renouvelez-le dans{" "}
              <a
                href="https://entra.microsoft.com"
                target="_blank"
                rel="noopener"
                className="underline font-medium"
              >
                Entra ID
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {/* Azure credentials status */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Connexion Microsoft Graph
              </h3>
              <p className="text-[12px] text-slate-500">
                Authentification OAuth2 via Entra ID (Application permissions)
              </p>
            </div>
            {hasAzureCreds ? (
              <Badge variant="success" className="ml-auto">
                <CheckCircle2 className="h-3 w-3" />
                Credentials configurées
              </Badge>
            ) : (
              <Badge variant="danger" className="ml-auto">
                <XCircle className="h-3 w-3" />
                Non configuré
              </Badge>
            )}
          </div>

          {!hasAzureCreds && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[12px] text-slate-600">
              Ajoutez AZURE_CLIENT_ID, AZURE_TENANT_ID et
              AZURE_CLIENT_SECRET dans le fichier .env du serveur.
            </div>
          )}

          {hasAzureCreds && expiry?.expiryDate && !expiry.isExpired && !expiry.isExpiringSoon && (
            <div className="text-[12px] text-slate-500">
              Secret expire le {expiry.expiryDate} ({expiry.daysLeft} jours
              restants)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mailbox config */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Boîte aux lettres
              </h3>
              <p className="text-[12px] text-slate-500">
                Adresse Exchange qui reçoit les alertes Veeam
              </p>
            </div>
          </div>

          <Input
            label="Adresse courriel de la boîte"
            placeholder="alertes@cetix.ca"
            value={config.mailbox}
            onChange={(e) => upd("mailbox", e.target.value)}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !config.mailbox}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Tester la connexion
            </Button>
          </div>

          {testResult && (
            <div
              className={`rounded-lg border px-3 py-2.5 text-[12px] ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                  : "border-red-200 bg-red-50/60 text-red-900"
              }`}
            >
              {testResult.ok ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    Connexion réussie —{" "}
                    {testResult.folders?.length ?? 0} dossiers trouvés
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                  <span className="break-all">{testResult.error}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Folder selection */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 ring-1 ring-inset ring-amber-200/60">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Dossier à analyser
              </h3>
              <p className="text-[12px] text-slate-500">
                Chemin du dossier contenant les alertes Veeam (ex:
                Inbox/Veeam)
              </p>
            </div>
          </div>

          <Input
            label="Chemin du dossier"
            placeholder="Inbox/Veeam ou Alertes/Backups"
            value={config.folderPath}
            onChange={(e) => upd("folderPath", e.target.value)}
          />

          {testResult?.ok && testResult.folders && (
            <div>
              <p className="text-[12px] font-medium text-slate-700 mb-2">
                Dossiers disponibles :
              </p>
              <div className="flex flex-wrap gap-1.5">
                {testResult.folders.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => upd("folderPath", f)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors cursor-pointer ${
                      config.folderPath === f
                        ? "bg-blue-50 text-blue-700 ring-blue-200"
                        : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <FolderOpen className="h-3 w-3" />
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save + Sync bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || !config.mailbox || !dirty}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Enregistrer
              </Button>
              {saved && !dirty && (
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" />
                  Sauvegardé
                </Badge>
              )}
              {saveError && (
                <span className="text-[12px] text-red-600">{saveError}</span>
              )}
              {dirty && !saved && (
                <span className="text-[12px] text-amber-600">
                  Modifications non sauvegardées
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={syncPeriod}
                onChange={(e) => setSyncPeriod(e.target.value)}
                disabled={syncing}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="7">7 derniers jours</option>
                <option value="30">30 derniers jours</option>
                <option value="90">90 derniers jours</option>
                <option value="365">1 an</option>
                <option value="all">Tout l&apos;historique</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing || !canSubmit}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {syncing ? "Synchronisation..." : "Synchroniser"}
              </Button>
            </div>
          </div>

          {syncResult && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[12px] text-slate-700 space-y-1">
              <p>
                <strong>{syncResult.fetched}</strong> courriel
                {syncResult.fetched > 1 ? "s" : ""} analysé
                {syncResult.fetched > 1 ? "s" : ""} —{" "}
                <strong>{syncResult.newAlerts}</strong> nouvelle
                {syncResult.newAlerts > 1 ? "s" : ""} alerte
                {syncResult.newAlerts > 1 ? "s" : ""}
              </p>
              {syncResult.errors.length > 0 && (
                <div className="text-red-600">
                  {syncResult.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
