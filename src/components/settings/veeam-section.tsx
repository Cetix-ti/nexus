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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  folder: string;
}

const EMPTY: ImapConfig = {
  host: "",
  port: 993,
  secure: true,
  user: "",
  pass: "",
  folder: "INBOX",
};

export function VeeamSection() {
  const [config, setConfig] = useState<ImapConfig>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
        if (data && data.host) setConfig(data);
      })
      .catch(() => {});
  }, []);

  function upd<K extends keyof ImapConfig>(key: K, value: ImapConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setSaved(false);
    setSaveError(null);
  }

  const canSubmit = !!(config.host && config.user && config.pass);

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
        body: JSON.stringify(config),
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
      const res = await fetch("/api/v1/veeam/sync", { method: "POST" });
      const data = await res.json();
      setSyncResult(data);
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
          Connectez la boîte mail qui reçoit les alertes Veeam pour surveiller
          automatiquement les tâches de sauvegarde de vos clients.
        </p>
      </div>

      {/* IMAP Connection */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Connexion IMAP
              </h3>
              <p className="text-[12px] text-slate-500">
                Boîte aux lettres recevant les alertes Veeam (ex:
                alertes@cetix.ca)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Serveur IMAP"
              placeholder="imap.office365.com"
              value={config.host}
              onChange={(e) => upd("host", e.target.value)}
            />
            <Input
              label="Port"
              type="number"
              placeholder="993"
              value={config.port}
              onChange={(e) => upd("port", Number(e.target.value))}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                Sécurité
              </label>
              <Select
                value={config.secure ? "ssl" : "none"}
                onValueChange={(v) => upd("secure", v === "ssl")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssl">SSL/TLS</SelectItem>
                  <SelectItem value="none">Aucun</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Adresse courriel"
              placeholder="alertes@cetix.ca"
              value={config.user}
              onChange={(e) => upd("user", e.target.value)}
            />
            <Input
              label="Mot de passe / App password"
              type="password"
              placeholder="••••••••"
              value={config.pass}
              onChange={(e) => upd("pass", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !canSubmit}
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
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                  <span>Échec : {testResult.error}</span>
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
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Dossier à analyser
              </h3>
              <p className="text-[12px] text-slate-500">
                Indiquez le chemin du dossier/sous-dossier contenant les alertes
                Veeam
              </p>
            </div>
          </div>

          <Input
            label="Chemin du dossier IMAP"
            placeholder="INBOX/Veeam ou Alertes/Backups"
            value={config.folder}
            onChange={(e) => upd("folder", e.target.value)}
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
                    onClick={() => upd("folder", f)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors cursor-pointer ${
                      config.folder === f
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

      {/* Global save bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || !canSubmit}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Enregistrer la configuration
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
              {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
            </Button>
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
