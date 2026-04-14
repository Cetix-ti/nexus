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
  backupFolders: string[];
}

export function MonitoringSection() {
  const [config, setConfig] = useState<Config>({ mailbox: "", folders: [], backupFolders: [] });
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
      .then((d) => {
        if (d.config) {
          setConfig({
            mailbox: d.config.mailbox ?? "",
            folders: d.config.folders ?? [],
            backupFolders: d.config.backupFolders ?? [],
          });
        }
      })
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

  function addFolder(f: string, target: "alerts" | "backups" = "alerts") {
    const key = target === "alerts" ? "folders" : "backupFolders";
    if (!config[key].includes(f)) {
      setConfig((c) => ({ ...c, [key]: [...c[key], f] }));
      setDirty(true); setSaved(false);
    }
  }

  function removeFolder(f: string, target: "alerts" | "backups" = "alerts") {
    const key = target === "alerts" ? "folders" : "backupFolders";
    setConfig((c) => ({ ...c, [key]: c[key].filter((x) => x !== f) }));
    setDirty(true); setSaved(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Surveillance par courriel</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Connectez les dossiers de la boîte mail qui contiennent les alertes
          de monitoring et les rapports de sauvegarde. Ils seront lus et classés
          automatiquement par Nexus.
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
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium text-slate-700 mb-2">
                  Cliquez pour ajouter un dossier aux <strong>alertes monitoring</strong> :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {testResult.folders.map((f) => (
                    <button key={"alert-" + f} type="button" onClick={() => addFolder(f, "alerts")}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors cursor-pointer ${
                        config.folders.includes(f) ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                      }`}>
                      <FolderOpen className="h-3 w-3" />{f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-slate-700 mb-2">
                  Cliquez pour ajouter un dossier aux <strong>sauvegardes</strong> :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {testResult.folders.map((f) => (
                    <button key={"backup-" + f} type="button" onClick={() => addFolder(f, "backups")}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors cursor-pointer ${
                        config.backupFolders.includes(f) ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                      }`}>
                      <FolderOpen className="h-3 w-3" />{f}
                    </button>
                  ))}
                </div>
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

      {/* Alert monitoring folders */}
      {config.folders.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-600" />
                Dossiers surveillés pour les alertes monitoring
              </h3>
              <p className="text-[12px] text-slate-500 mt-1">
                Courriels d&apos;alertes (Zabbix, Atera, FortiGate, Wazuh, etc.) — apparaîtront dans la page « Alertes monitoring »
              </p>
            </div>
            <div className="space-y-1.5">
              {config.folders.map((f) => (
                <div key={f} className="flex items-center justify-between rounded-lg border border-amber-200/60 bg-amber-50/40 px-3 py-2">
                  <span className="text-[12.5px] text-slate-700 flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-amber-500" />{f}
                  </span>
                  <button onClick={() => removeFolder(f, "alerts")} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup monitoring folders */}
      {config.backupFolders.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-emerald-600" />
                Dossiers surveillés pour les sauvegardes
              </h3>
              <p className="text-[12px] text-slate-500 mt-1">
                Courriels de statut des sauvegardes (Veeam, etc.) — apparaîtront dans la page « Sauvegardes »
              </p>
            </div>
            <div className="space-y-1.5">
              {config.backupFolders.map((f) => (
                <div key={f} className="flex items-center justify-between rounded-lg border border-emerald-200/60 bg-emerald-50/40 px-3 py-2">
                  <span className="text-[12.5px] text-slate-700 flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />{f}
                  </span>
                  <button onClick={() => removeFolder(f, "backups")} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
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
