"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  FolderOpen,
  Save,
  Bell,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Config {
  mailbox: string;
  folders: string[];
}

export function MonitoringSection() {
  const [config, setConfig] = useState<Config>({ mailbox: "", folders: [] });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; folders?: string[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncPeriod, setSyncPeriod] = useState("7");

  useEffect(() => {
    fetch("/api/v1/settings/monitoring")
      .then((r) => r.json())
      .then((d) => { if (d.config) setConfig(d.config); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/v1/settings/monitoring", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaved(true); setDirty(false); setSaving(false);
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    const res = await fetch("/api/v1/settings/monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailbox: config.mailbox }),
    });
    setTestResult(await res.json());
    setTesting(false);
  }

  async function handleSync() {
    if (dirty) await handleSave();
    setSyncing(true); setSyncResult(null);
    const sinceDays = syncPeriod === "all" ? 0 : Number(syncPeriod);
    const res = await fetch("/api/v1/monitoring/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sinceDays }),
    });
    setSyncResult(await res.json());
    setSyncing(false);
  }

  function addFolder(f: string) {
    if (!config.folders.includes(f)) {
      setConfig((c) => ({ ...c, folders: [...c.folders, f] }));
      setDirty(true); setSaved(false);
    }
  }

  function removeFolder(f: string) {
    setConfig((c) => ({ ...c, folders: c.folders.filter((x) => x !== f) }));
    setDirty(true); setSaved(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Alertes monitoring</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Connectez les dossiers de la boîte mail qui contiennent les alertes
          de vos outils de monitoring (Zabbix, Atera, FortiGate, Wazuh, etc.)
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 ring-1 ring-inset ring-amber-200/60">
              <Bell className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900">Boîte aux lettres</h3>
          </div>

          <Input
            label="Adresse courriel"
            placeholder="alertes@cetix.ca"
            value={config.mailbox}
            onChange={(e) => { setConfig((c) => ({ ...c, mailbox: e.target.value })); setDirty(true); setSaved(false); }}
          />

          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.mailbox}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Tester et lister les dossiers
          </Button>

          {testResult?.ok && testResult.folders && (
            <div>
              <p className="text-[12px] font-medium text-slate-700 mb-2">Cliquez pour ajouter un dossier à surveiller :</p>
              <div className="flex flex-wrap gap-1.5">
                {testResult.folders.map((f) => (
                  <button key={f} type="button" onClick={() => addFolder(f)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors cursor-pointer ${
                      config.folders.includes(f) ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                    }`}>
                    <FolderOpen className="h-3 w-3" />{f}
                  </button>
                ))}
              </div>
            </div>
          )}
          {testResult && !testResult.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] text-red-900 flex items-start gap-2">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{testResult.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {config.folders.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-slate-500" />
              Dossiers surveillés
            </h3>
            <div className="space-y-1.5">
              {config.folders.map((f) => (
                <div key={f} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <span className="text-[12.5px] text-slate-700 flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-slate-400" />{f}
                  </span>
                  <button onClick={() => removeFolder(f)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !config.mailbox || !dirty}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Enregistrer
              </Button>
              {saved && !dirty && <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Sauvegardé</Badge>}
              {dirty && !saved && <span className="text-[12px] text-amber-600">Non sauvegardé</span>}
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
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || !config.mailbox || config.folders.length === 0}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {syncing ? "Sync..." : "Synchroniser"}
              </Button>
            </div>
          </div>
          {syncResult && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[12px] text-slate-700">
              <strong>{syncResult.created}</strong> nouvelles alertes, <strong>{syncResult.resolved}</strong> résolues, <strong>{syncResult.skipped}</strong> déjà importées
              {syncResult.errors?.length > 0 && <div className="text-red-600 mt-1">{syncResult.errors.join("; ")}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
