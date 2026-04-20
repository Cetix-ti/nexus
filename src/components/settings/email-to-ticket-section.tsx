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
  Ticket,
  PauseCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

interface Config {
  mailbox: string;
  folderPath: string;
  defaultPriority: string;
  markAsRead: boolean;
  enabled: boolean;
}

const EMPTY: Config = {
  mailbox: "",
  folderPath: "Inbox",
  defaultPriority: "MEDIUM",
  markAsRead: true,
  enabled: true,
};

export function EmailToTicketSection() {
  const [config, setConfig] = useState<Config>(EMPTY);
  const [hasAzure, setHasAzure] = useState(false);
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
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings/email-to-ticket")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          // Rétro-compat : les configs existantes n'ont pas le champ
          // `enabled` → on le force à true pour ne pas casser l'UX.
          setConfig({ ...EMPTY, ...d.config, enabled: d.config.enabled !== false });
        }
        setHasAzure(!!d.hasAzureCredentials);
      })
      .catch(() => {});
  }, []);

  function upd<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/v1/settings/email-to-ticket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      const res = await fetch("/api/v1/settings/email-to-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox: config.mailbox }),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
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
      const res = await fetch("/api/v1/email-to-ticket/sync", { method: "POST" });
      setSyncResult(await res.json());
    } catch (err) {
      setSyncResult({
        fetched: 0, created: 0, skipped: 0,
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
          Configuration SMTP pour les tickets
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Adresse courriel utilisée pour <strong>recevoir des tickets</strong> et
          pour <strong>répondre aux tickets</strong>. Les courriels reçus dans la
          boîte configurée sont automatiquement convertis en tickets ;
          l&apos;expéditeur est associé à son organisation via son domaine.
        </p>
      </div>

      {!hasAzure && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
          Les credentials Azure (AZURE_CLIENT_ID, AZURE_TENANT_ID,
          AZURE_CLIENT_SECRET) doivent être configurées dans .env. L&apos;app
          registration doit avoir la permission Mail.Read et Mail.ReadWrite.
        </div>
      )}

      {/* Master kill-switch — utile pendant la coexistence avec Freshservice
          pour que Nexus ne consomme pas les emails destinés au PSA prod. */}
      <Card className={config.enabled ? "border-emerald-200" : "border-amber-300 bg-amber-50/40"}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-inset shrink-0 ${
                config.enabled
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-200/60"
                  : "bg-amber-100 text-amber-700 ring-amber-300/60"
              }`}>
                {config.enabled ? <Mail className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900">
                  Création automatique de tickets
                </h3>
                <p className="mt-0.5 text-[12px] text-slate-600 max-w-xl">
                  {config.enabled
                    ? "Les courriels reçus dans la boîte configurée sont convertis en tickets."
                    : "Désactivée — Nexus n'ouvre pas la boîte courriel et ne crée aucun ticket. Utile quand Freshservice (ou un autre PSA) est toujours en production sur la même adresse."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                config.enabled ? "text-emerald-700" : "text-amber-700"
              }`}>
                {config.enabled ? "Activé" : "Désactivé"}
              </span>
              <Switch
                checked={config.enabled}
                onCheckedChange={(c) => upd("enabled", c)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mailbox */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Boîte aux lettres
              </h3>
              <p className="text-[12px] text-slate-500">
                Adresse Exchange qui reçoit les demandes des clients
              </p>
            </div>
          </div>

          <Input
            label="Adresse courriel"
            placeholder="billets@cetix.ca"
            value={config.mailbox}
            onChange={(e) => upd("mailbox", e.target.value)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dossier à surveiller"
              placeholder="Inbox"
              value={config.folderPath}
              onChange={(e) => upd("folderPath", e.target.value)}
            />
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Priorité par défaut
              </label>
              <Select
                value={config.defaultPriority}
                onValueChange={(v) => upd("defaultPriority", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Faible</SelectItem>
                  <SelectItem value="MEDIUM">Moyenne</SelectItem>
                  <SelectItem value="HIGH">Élevée</SelectItem>
                  <SelectItem value="CRITICAL">Critique</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.markAsRead}
              onChange={(e) => upd("markAsRead", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[13px] text-slate-700">
              Marquer les courriels comme lus après traitement
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !config.mailbox}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Tester la connexion
            </Button>
          </div>

          {testResult && (
            <div className={`rounded-lg border px-3 py-2.5 text-[12px] ${
              testResult.ok
                ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                : "border-red-200 bg-red-50/60 text-red-900"
            }`}>
              {testResult.ok ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Connexion réussie — {testResult.folders?.length ?? 0} dossiers</span>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                  <span className="break-all">{testResult.error}</span>
                </div>
              )}
            </div>
          )}

          {testResult?.ok && testResult.folders && (
            <div>
              <p className="text-[12px] font-medium text-slate-700 mb-2">Dossiers disponibles :</p>
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

      {/* Save + Sync */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !config.mailbox || !dirty}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Enregistrer
              </Button>
              {saved && !dirty && (
                <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Sauvegardé</Badge>
              )}
              {saveError && <span className="text-[12px] text-red-600">{saveError}</span>}
              {dirty && !saved && <span className="text-[12px] text-amber-600">Modifications non sauvegardées</span>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing || !config.mailbox || !hasAzure || !config.enabled}
              title={!config.enabled ? "Active la création automatique pour synchroniser" : undefined}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
              {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
            </Button>
          </div>

          {syncResult && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[12px] text-slate-700 space-y-1">
              <p>
                <strong>{syncResult.fetched}</strong> courriel{syncResult.fetched > 1 ? "s" : ""} analysé{syncResult.fetched > 1 ? "s" : ""} —{" "}
                <strong>{syncResult.created}</strong> ticket{syncResult.created > 1 ? "s" : ""} créé{syncResult.created > 1 ? "s" : ""} —{" "}
                <strong>{syncResult.skipped}</strong> ignoré{syncResult.skipped > 1 ? "s" : ""}
              </p>
              {syncResult.errors.length > 0 && (
                <div className="text-red-600">
                  {syncResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
