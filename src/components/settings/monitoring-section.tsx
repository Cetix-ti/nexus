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
  ShieldAlert,
  Zap,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Config {
  mailbox: string;
  folders: string[];
  backupFolders: string[];
  securityFolders: string[];
}

export function MonitoringSection() {
  const [config, setConfig] = useState<Config>({
    mailbox: "",
    folders: [],
    backupFolders: [],
    securityFolders: [],
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; folders?: string[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncPeriod, setSyncPeriod] = useState("7");
  // Synchro historique du Centre de sécurité (AD / Wazuh email).
  const [secSyncing, setSecSyncing] = useState(false);
  const [secSyncResult, setSecSyncResult] = useState<any>(null);
  const [secSyncPeriod, setSecSyncPeriod] = useState("7");

  // Wazuh API — intégration JSON directe (alternative aux emails).
  interface WazuhCfg {
    enabled: boolean;
    apiUrl: string;
    username: string;
    password: string;
    minLevel: number;
    lastSyncAt?: string;
  }
  const [wazuh, setWazuh] = useState<WazuhCfg>({
    enabled: false,
    apiUrl: "",
    username: "",
    password: "",
    minLevel: 7,
  });
  const [wazuhDirty, setWazuhDirty] = useState(false);
  const [wazuhSaving, setWazuhSaving] = useState(false);
  const [wazuhTesting, setWazuhTesting] = useState(false);
  const [wazuhTestResult, setWazuhTestResult] = useState<{
    ok: boolean;
    version?: string;
    clusterName?: string;
    error?: string;
  } | null>(null);
  const [wazuhSyncing, setWazuhSyncing] = useState(false);
  const [wazuhSyncResult, setWazuhSyncResult] = useState<any>(null);
  const [wazuhSyncPeriod, setWazuhSyncPeriod] = useState("7");

  useEffect(() => {
    fetch("/api/v1/settings/monitoring")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setConfig({
            mailbox: d.config.mailbox ?? "",
            folders: d.config.folders ?? [],
            backupFolders: d.config.backupFolders ?? [],
            securityFolders: d.config.securityFolders ?? [],
          });
        }
      })
      .catch(() => {});
    // Wazuh API config — endpoint séparé parce que stocké sous une
    // autre clé tenant_settings (security.wazuh vs monitoring.email).
    fetch("/api/v1/settings/wazuh")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setWazuh(d);
      })
      .catch(() => {});
  }, []);

  async function saveWazuh() {
    setWazuhSaving(true);
    try {
      const res = await fetch("/api/v1/settings/wazuh", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wazuh),
      });
      if (res.ok) {
        const next = await res.json();
        setWazuh(next);
        setWazuhDirty(false);
      }
    } finally {
      setWazuhSaving(false);
    }
  }

  async function testWazuh() {
    setWazuhTesting(true);
    setWazuhTestResult(null);
    try {
      const res = await fetch("/api/v1/settings/wazuh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wazuh),
      });
      setWazuhTestResult(await res.json());
    } catch (e) {
      setWazuhTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setWazuhTesting(false);
    }
  }

  async function syncWazuh() {
    if (wazuhDirty) await saveWazuh();
    setWazuhSyncing(true);
    setWazuhSyncResult(null);
    const sinceDays = wazuhSyncPeriod === "all" ? 0 : Number(wazuhSyncPeriod);
    const res = await fetch("/api/v1/security-center/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "wazuh-api", sinceDays }),
    });
    setWazuhSyncResult(await res.json());
    setWazuhSyncing(false);
  }

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

  type FolderTarget = "alerts" | "backups" | "security";
  const targetToKey = (t: FolderTarget): keyof Pick<Config, "folders" | "backupFolders" | "securityFolders"> =>
    t === "alerts" ? "folders" : t === "backups" ? "backupFolders" : "securityFolders";

  function addFolder(f: string, target: FolderTarget = "alerts") {
    const key = targetToKey(target);
    if (!config[key].includes(f)) {
      setConfig((c) => ({ ...c, [key]: [...c[key], f] }));
      setDirty(true); setSaved(false);
    }
  }

  function removeFolder(f: string, target: FolderTarget = "alerts") {
    const key = targetToKey(target);
    setConfig((c) => ({ ...c, [key]: c[key].filter((x) => x !== f) }));
    setDirty(true); setSaved(false);
  }

  async function handleSecuritySync() {
    if (dirty) await handleSave();
    setSecSyncing(true); setSecSyncResult(null);
    const sinceDays = secSyncPeriod === "all" ? 0 : Number(secSyncPeriod);
    const res = await fetch("/api/v1/security-center/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sinceDays }),
    });
    setSecSyncResult(await res.json());
    setSecSyncing(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Synchronisation des alertes</h2>
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
              <div>
                <p className="text-[12px] font-medium text-slate-700 mb-2">
                  Cliquez pour ajouter un dossier au <strong>Centre de sécurité</strong> :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {testResult.folders.map((f) => (
                    <button key={"sec-" + f} type="button" onClick={() => addFolder(f, "security")}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors cursor-pointer ${
                        config.securityFolders.includes(f) ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
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

      {/* Centre de sécurité — dossiers + backfill historique. S'affiche
          même quand aucun dossier n'est configuré pour que l'admin puisse
          lancer la synchro une fois qu'il a coché dans la liste ci-dessus. */}
      <Card className="border-indigo-200/80 bg-indigo-50/30">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-indigo-600" />
              Centre de sécurité
            </h3>
            <p className="text-[12px] text-slate-500 mt-1">
              Dossiers scannés par le Centre de sécurité. Chaque message est passé
              dans le décodeur AD (« AD Account Lockout », « Inactive Account »)
              puis, en fallback, dans le décodeur Wazuh (persistence, CVE, etc.).
              Les messages non reconnus sont ignorés.
            </p>
          </div>

          {config.securityFolders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-indigo-200 bg-white/60 px-3 py-4 text-center text-[12px] text-slate-500">
              Aucun dossier sélectionné. Utilise « Tester et lister les dossiers »
              ci-dessus, puis clique sur un dossier dans la section
              <strong> « Centre de sécurité »</strong>.
            </div>
          ) : (
            <div className="space-y-1.5">
              {config.securityFolders.map((f) => (
                <div key={f} className="flex items-center justify-between rounded-lg border border-indigo-200/60 bg-white px-3 py-2">
                  <span className="text-[12.5px] text-slate-700 flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-indigo-500" />{f}
                  </span>
                  <button onClick={() => removeFolder(f, "security")} className="text-slate-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Backfill historique — lit les dossiers sélectionnés avec la
              fenêtre choisie. Utile après ajout d'un dossier ou après une
              période d'arrêt du job récurrent. */}
          <div className="flex items-center justify-between pt-2 border-t border-indigo-100">
            <div className="text-[11.5px] text-slate-600">
              <strong>Synchroniser l&apos;historique</strong> — réimporte les
              courriels de sécurité passés (AD + Wazuh).
            </div>
            <div className="flex items-center gap-2">
              <select
                value={secSyncPeriod}
                onChange={(e) => setSecSyncPeriod(e.target.value)}
                disabled={secSyncing}
                className="h-8 rounded-lg border border-indigo-200 bg-white px-2.5 text-[12px] text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                onClick={handleSecuritySync}
                disabled={secSyncing || !config.mailbox || config.securityFolders.length === 0}
              >
                {secSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {secSyncing ? "Sync..." : "Synchroniser"}
              </Button>
            </div>
          </div>

          {secSyncResult && (
            <div className="rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-[12px] text-slate-700">
              <strong>{secSyncResult.ingested}</strong> nouvelles alertes,{" "}
              <strong>{secSyncResult.skipped}</strong> déjà vues,{" "}
              <strong>{secSyncResult.fetched}</strong> messages examinés
              {secSyncResult.errors?.length > 0 && (
                <div className="text-red-600 mt-1">
                  {secSyncResult.errors.slice(0, 3).join(" · ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wazuh API — intégration directe à l'Indexer (OpenSearch).
          Alternative plus propre que l'ingestion email pour Wazuh. */}
      <Card className="border-purple-200/80 bg-purple-50/30">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-purple-100 text-purple-700 ring-1 ring-purple-200/60 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Wazuh Indexer (API directe)
              </h3>
              <p className="text-[12px] text-slate-500 mt-1">
                Tire les alertes directement depuis l&apos;index
                <span className="font-mono"> wazuh-alerts-*</span> (OpenSearch).
                Recommandé vs les emails : JSON structuré, tous les champs
                natifs (agent.id / agent.name / agent.ip, rule.level, CVE,
                MITRE ATT&amp;CK). Dédup par <span className="font-mono">_id</span> du doc.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="URL de l'Indexer"
              placeholder="https://wazuh-indexer.cetix.local:9200"
              value={wazuh.apiUrl}
              onChange={(e) => {
                setWazuh((w) => ({ ...w, apiUrl: e.target.value }));
                setWazuhDirty(true);
              }}
            />
            <Input
              label="Utilisateur"
              placeholder="nexus-reader"
              value={wazuh.username}
              onChange={(e) => {
                setWazuh((w) => ({ ...w, username: e.target.value }));
                setWazuhDirty(true);
              }}
            />
            <Input
              label="Mot de passe"
              type="password"
              placeholder="••••••••"
              value={wazuh.password}
              onChange={(e) => {
                setWazuh((w) => ({ ...w, password: e.target.value }));
                setWazuhDirty(true);
              }}
            />
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Niveau minimum
              </label>
              <select
                value={wazuh.minLevel}
                onChange={(e) => {
                  setWazuh((w) => ({ ...w, minLevel: Number(e.target.value) }));
                  setWazuhDirty(true);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value={1}>1 (toutes alertes, inclut le bruit)</option>
                <option value={4}>4 (avertissements et plus)</option>
                <option value={7}>7 (recommandé — significatifs)</option>
                <option value={10}>10 (critiques uniquement)</option>
                <option value={12}>12 (très haute sévérité)</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Filtre <span className="font-mono">rule.level &gt;= N</span>
                — Wazuh note de 0 à 15.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                checked={wazuh.enabled}
                onChange={(e) => {
                  setWazuh((w) => ({ ...w, enabled: e.target.checked }));
                  setWazuhDirty(true);
                }}
              />
              <span className="text-[13px] font-medium text-slate-800">
                Activer le pull API (toutes les 2 min)
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testWazuh}
                disabled={wazuhTesting || !wazuh.apiUrl || !wazuh.username}
              >
                {wazuhTesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug className="h-3.5 w-3.5" />
                )}
                Tester
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={saveWazuh}
                disabled={wazuhSaving || !wazuhDirty}
              >
                {wazuhSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Enregistrer
              </Button>
            </div>
          </div>

          {wazuhTestResult && (
            <div
              className={`rounded-lg border px-3 py-2.5 text-[12px] flex items-start gap-2 ${
                wazuhTestResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {wazuhTestResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                {wazuhTestResult.ok ? (
                  <span>
                    Connecté à <strong>{wazuhTestResult.clusterName ?? "cluster"}</strong>
                    {wazuhTestResult.version ? ` · OpenSearch ${wazuhTestResult.version}` : ""}
                  </span>
                ) : (
                  <span>{wazuhTestResult.error}</span>
                )}
              </div>
            </div>
          )}

          {/* Backfill historique API */}
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="text-[11.5px] text-slate-600">
              <strong>Synchroniser l&apos;historique</strong> — pull JSON depuis
              l&apos;Indexer sur la fenêtre choisie.
            </div>
            <div className="flex items-center gap-2">
              <select
                value={wazuhSyncPeriod}
                onChange={(e) => setWazuhSyncPeriod(e.target.value)}
                disabled={wazuhSyncing}
                className="h-8 rounded-lg border border-purple-200 bg-white px-2.5 text-[12px] text-slate-700 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="1">24h</option>
                <option value="7">7 derniers jours</option>
                <option value="30">30 derniers jours</option>
                <option value="90">90 derniers jours</option>
                <option value="all">Tout l&apos;historique (depuis lastSyncAt)</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={syncWazuh}
                disabled={wazuhSyncing || !wazuh.enabled || !wazuh.apiUrl}
              >
                {wazuhSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Synchroniser
              </Button>
            </div>
          </div>

          {wazuhSyncResult && (
            <div className="rounded-lg border border-purple-200 bg-white px-3 py-2.5 text-[12px] text-slate-700">
              <strong>{wazuhSyncResult.ingested}</strong> nouvelles alertes,{" "}
              <strong>{wazuhSyncResult.skipped}</strong> déjà vues,{" "}
              <strong>{wazuhSyncResult.fetched}</strong> examinées
              {wazuhSyncResult.errors?.length > 0 && (
                <div className="text-red-600 mt-1">
                  {wazuhSyncResult.errors.slice(0, 3).join(" · ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
