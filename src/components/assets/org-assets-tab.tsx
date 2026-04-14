"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Search,
  Plus,
  Server,
  HardDrive,
  Network,
  Shield,
  Monitor,
  Laptop,
  Printer,
  Zap,
  Cloud,
  Phone,
  Activity,
  Database,
  Pencil,
  Trash2,
  ShieldAlert,
  RefreshCcw,
  Eye,
  Layers,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSET_SOURCE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_CATEGORIES,
  ASSET_TYPE_LABELS,
  type AssetSource,
  type AssetStatus,
  type AssetType,
  type OrgAsset,
  type RmmIntegration,
} from "@/lib/assets/types";
import { Loader2 } from "lucide-react";
import { AssetModal } from "./asset-modal";
import { AssetDetailDrawer } from "./asset-detail-drawer";
import { RmmIntegrationCard } from "./rmm-integration-card";
import { AteraMappingModal } from "./atera-mapping-modal";
import { cn } from "@/lib/utils";
import { useSortable } from "@/lib/hooks/use-sortable";
import { SortableHeader } from "@/components/ui/sortable-header";

interface AteraMapping {
  externalId: string;
  externalName: string;
}

interface OrgAssetsTabProps {
  organizationId: string;
  organizationName?: string;
}

const TYPE_ICONS: Record<AssetType, React.ComponentType<{ className?: string }>> = {
  server_physical: Server,
  server_virtual: Layers,
  windows_server: Server,
  linux_server: Server,
  nas: HardDrive,
  san: Database,
  hypervisor: Layers,
  workstation: Monitor,
  laptop: Laptop,
  network_switch: Network,
  firewall: Shield,
  router: Network,
  wifi_ap: Network,
  ups: Zap,
  printer: Printer,
  ip_phone: Phone,
  monitoring_appliance: Activity,
  tape_library: HardDrive,
  cloud_resource: Cloud,
};

function statusVariant(s: AssetStatus): "success" | "warning" | "default" | "danger" {
  switch (s) {
    case "active": return "success";
    case "maintenance": return "warning";
    case "inactive": return "default";
    case "retired":
    case "decommissioned": return "danger";
  }
}

function sourceVariant(s: AssetSource): "primary" | "default" {
  return s === "manual" ? "default" : "primary";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

function isWarrantyExpiringSoon(iso?: string): boolean {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 90;
}

const PROVIDERS_TO_SHOW: AssetSource[] = ["atera", "other"];

export function OrgAssetsTab({ organizationId, organizationName }: OrgAssetsTabProps) {
  const [assets, setAssets] = useState<OrgAsset[]>([]);
  const [integrations, setIntegrations] = useState<RmmIntegration[]>(() =>
    PROVIDERS_TO_SHOW.map((provider) => ({
      id: `rmm-${organizationId}-${provider}`,
      organizationId,
      provider,
      isConnected: false,
      syncedAssetCount: 0,
    }))
  );
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/assets`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setAssets(data); })
      .catch((e) => console.error("assets load failed", e))
      .finally(() => setLoadingAssets(false));

    fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/integrations`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res) => {
        const items = Array.isArray(res) ? res : (res.data || []);
        if (!Array.isArray(items)) return;
        setIntegrations((prev) =>
          PROVIDERS_TO_SHOW.map((provider) => {
            const fromApi = items.find((i: any) => i.provider === provider);
            if (!fromApi) return prev.find((i) => i.provider === provider)!;
            // Map API fields to RmmIntegration shape
            return {
              ...prev.find((i) => i.provider === provider)!,
              ...fromApi,
              isConnected: !!fromApi.isActive,
              syncedAssetCount: fromApi.recordCount ?? fromApi.syncedAssetCount ?? 0,
              lastSyncAt: fromApi.lastSyncAt ?? undefined,
            } as RmmIntegration;
          })
        );
      })
      .catch((e) => console.error("integrations load failed", e));
  }, [organizationId]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrgAsset | null>(null);
  const [detailAsset, setDetailAsset] = useState<OrgAsset | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mapping, setMapping] = useState<AteraMapping | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Load existing Atera mapping from DB on mount
  useEffect(() => {
    fetch(`/api/v1/integrations/mappings?organizationId=${organizationId}&provider=atera`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.externalId) {
          setMapping({ externalId: data.externalId, externalName: data.externalName });
        }
      })
      .catch(() => {});
  }, [organizationId]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [a.name, a.manufacturer, a.model, a.ipAddress, a.serialNumber, a.os, a.siteName, a.lastLoggedUser]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, search, typeFilter, statusFilter, sourceFilter]);

  const { sorted: sortedAssets, sort: assetSort, toggleSort: toggleAssetSort } = useSortable(filtered, "name");

  const stats = useMemo(() => {
    const monitored = assets.filter((a) => a.isMonitored).length;
    const expiring = assets.filter((a) => isWarrantyExpiringSoon(a.warrantyExpiry)).length;
    const lastSync = integrations
      .filter((i) => i.lastSyncAt)
      .map((i) => i.lastSyncAt!)
      .sort()
      .pop();
    return { total: assets.length, monitored, expiring, lastSync };
  }, [assets, integrations]);

  async function handleSync(provider: AssetSource) {
    // Atera requires a per-org company mapping before syncing
    if (provider === "atera" && !mapping) {
      setMappingOpen(true);
      return;
    }

    // Atera : récupération RÉELLE des agents via /api/v1/integrations/atera/customers/[id]/agents
    if (provider === "atera" && mapping) {
      setSyncMessage(`Synchronisation avec Atera (${mapping.externalName})…`);
      try {
        const res = await fetch(
          `/api/v1/integrations/atera/customers/${encodeURIComponent(
            mapping.externalId
          )}/agents?orgId=${encodeURIComponent(organizationId)}`
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const fetched = (json.data || []) as OrgAsset[];
        const meta = json.meta || {};
        const now = new Date().toISOString();
        setAssets((prev) => {
          // Replace Atera assets with fresh data (from live sync or DB cache)
          const withoutAtera = prev.filter((a) => a.source !== "atera");
          return [...fetched, ...withoutAtera];
        });
        setIntegrations((prev) =>
          prev.map((i) =>
            i.provider === "atera"
              ? {
                  ...i,
                  isConnected: true,
                  lastSyncAt: now,
                  syncedAssetCount: fetched.length,
                }
              : i
          )
        );
        if (meta.fromCache) {
          setSyncMessage(
            `Atera hors ligne — ${fetched.length} actif${fetched.length > 1 ? "s" : ""} chargé${fetched.length > 1 ? "s" : ""} depuis le cache local`
          );
        } else {
          setSyncMessage(
            `Atera : ${fetched.length} actif${fetched.length > 1 ? "s" : ""} synchronisé${fetched.length > 1 ? "s" : ""} (${mapping.externalName})`
          );
        }
        setTimeout(() => setSyncMessage(null), 5000);
      } catch (err) {
        // Network error or invalid JSON — keep existing assets in state
        setSyncMessage(
          `Erreur Atera : ${err instanceof Error ? err.message : String(err)}`
        );
        setTimeout(() => setSyncMessage(null), 8000);
      }
      return;
    }

    // Autres providers : pas encore branchés à une vraie API
    setSyncMessage(
      `Le connecteur « ${provider} » n'est pas encore branché à une API réelle.`
    );
    setTimeout(() => setSyncMessage(null), 5000);
  }

  async function handleConnect(provider: AssetSource) {
    if (provider === "atera") {
      // Real connection test against the configured ATERA_API_KEY
      try {
        const res = await fetch("/api/v1/integrations/atera/test");
        const json = await res.json();
        if (!res.ok || !json.success) {
          alert(
            `Échec de la connexion à Atera : ${json.error || "vérifiez ATERA_API_KEY dans .env"}`
          );
          return;
        }
        setIntegrations((prev) =>
          prev.map((i) =>
            i.provider === "atera"
              ? {
                  ...i,
                  isConnected: true,
                  apiKeyMasked: "atera_••••••" + json.data.customerCount,
                  lastSyncAt: new Date().toISOString(),
                }
              : i
          )
        );
        // Force opening the mapping picker so user picks the right Atera customer
        setMappingOpen(true);
      } catch (e) {
        alert("Erreur réseau : " + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }
    // Other providers — placeholder, no real connection yet
    alert(
      `La connexion à ${provider} sera disponible dans une prochaine itération.`
    );
  }

  async function handleSave(asset: OrgAsset) {
    // Persist to DB
    const isNew = !assets.some((a) => a.id === asset.id);
    try {
      if (isNew) {
        const res = await fetch(
          `/api/v1/organizations/${encodeURIComponent(organizationId)}/assets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(asset),
          },
        );
        if (res.ok) {
          const created = await res.json();
          asset = { ...asset, id: created.id };
        }
      } else {
        const res = await fetch(`/api/v1/assets/${encodeURIComponent(asset.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: asset.name,
            type: (asset.type as string).toUpperCase(),
            status: (asset.status as string).toUpperCase(),
            manufacturer: asset.manufacturer || null,
            model: asset.model || null,
            serialNumber: asset.serialNumber || null,
            ipAddress: asset.ipAddress || null,
            macAddress: asset.macAddress || null,
            notes: asset.notes || null,
            assignedContactId: asset.assignedContactId || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("Asset update failed:", err);
          return; // Don't update local state on failure
        }
      }
    } catch (e) {
      console.error("Asset save failed:", e);
      return; // Don't update local state on failure
    }

    // Update local state only on success
    setAssets((prev) => {
      const idx = prev.findIndex((a) => a.id === asset.id);
      if (idx === -1) return [asset, ...prev];
      const next = [...prev];
      next[idx] = asset;
      return next;
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer définitivement cet actif ? Cette action est irréversible.")) return;
    try {
      const res = await fetch(`/api/v1/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Erreur lors de la suppression de l'actif.");
        return;
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error("Asset delete failed:", e);
      alert("Erreur réseau lors de la suppression.");
    }
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(a: OrgAsset) {
    setEditing(a);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Server} label="Total actifs" value={stats.total.toString()} accent="blue" />
        <StatTile icon={Eye} label="Actifs surveillés" value={stats.monitored.toString()} accent="emerald" />
        <StatTile icon={ShieldAlert} label="Garanties (90j)" value={stats.expiring.toString()} accent="amber" />
        <StatTile icon={RefreshCcw} label="Dernière sync" value={timeAgo(stats.lastSync)} accent="violet" />
      </div>

      {/* RMM integrations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">Connexions RMM</h3>
            <p className="text-[12px] text-slate-500">Synchronisation automatique des actifs depuis vos outils</p>
          </div>
        </div>

        {mapping && (
          <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2 text-[12px] text-orange-900 flex items-center justify-between gap-3">
            <span>
              🔗 Mappée avec l&apos;entreprise Atera{" "}
              <strong>{mapping.externalName}</strong>{" "}
              <span className="font-mono text-[10.5px] text-orange-700">
                ({mapping.externalId})
              </span>
            </span>
            <button
              onClick={() => {
                fetch(`/api/v1/integrations/mappings?organizationId=${organizationId}&provider=atera`, { method: "DELETE" });
                setMapping(null);
              }}
              className="text-[11px] font-medium text-orange-700 hover:text-orange-900 underline"
            >
              Démapper
            </button>
          </div>
        )}

        {syncMessage && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-900">
            ✅ {syncMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((i) => (
            <RmmIntegrationCard
              key={i.id}
              integration={i}
              onSync={() => handleSync(i.provider)}
              onConnect={() => handleConnect(i.provider)}
            />
          ))}
        </div>
      </div>

      <AteraMappingModal
        open={mappingOpen}
        organizationName={organizationName || organizationId}
        onClose={() => setMappingOpen(false)}
        onPick={async (externalId, externalName) => {
          const m = { externalId, externalName };
          fetch("/api/v1/integrations/mappings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId,
              provider: "atera",
              externalId: m.externalId,
              externalName: m.externalName,
            }),
          });
          setMapping(m);
          setMappingOpen(false);

          // Sync directly — do NOT go through handleSync to avoid stale closure
          setSyncMessage(`Synchronisation avec Atera (${m.externalName})…`);
          try {
            const res = await fetch(
              `/api/v1/integrations/atera/customers/${encodeURIComponent(
                m.externalId
              )}/agents?orgId=${encodeURIComponent(organizationId)}`
            );
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(json.error || `HTTP ${res.status}`);
            }
            const fetched = (json.data || []) as OrgAsset[];
            const now = new Date().toISOString();
            setAssets((prev) => {
              const withoutAtera = prev.filter((a) => a.source !== "atera");
              return [...fetched, ...withoutAtera];
            });
            setIntegrations((prev) =>
              prev.map((i) =>
                i.provider === "atera"
                  ? { ...i, isConnected: true, lastSyncAt: now, syncedAssetCount: fetched.length }
                  : i
              )
            );
            setSyncMessage(
              `Atera : ${fetched.length} actif${fetched.length > 1 ? "s" : ""} synchronisé${fetched.length > 1 ? "s" : ""} (${m.externalName})`
            );
            setTimeout(() => setSyncMessage(null), 5000);
          } catch (err) {
            setSyncMessage(
              `Erreur Atera : ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }}
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1">
            <Input
              placeholder="Rechercher par nom, IP, modèle, série..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:w-auto lg:flex">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="lg:w-44"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {ASSET_TYPE_CATEGORIES.map((cat) => (
                  <SelectGroup key={cat.label}>
                    <SelectLabel>{cat.label}</SelectLabel>
                    {cat.types.map((t) => (
                      <SelectItem key={t} value={t}>{ASSET_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="lg:w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(ASSET_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="lg:w-40"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sources</SelectItem>
                {Object.entries(ASSET_SOURCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              import("@/lib/assets/export-pdf").then(({ exportAssetsPdf }) => {
                exportAssetsPdf(filtered, organizationId);
              }).catch(() => alert("Erreur lors de l'export PDF"));
            }}
          >
            <Download className="h-4 w-4" strokeWidth={2.5} />
            Exporter PDF
          </Button>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Ajouter un actif
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                <SortableHeader label="Nom" sortKey="name" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="Type" sortKey="type" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="Statut" sortKey="status" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="OS" sortKey="os" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="IP" sortKey="ipAddress" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="Site" sortKey="siteName" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="Dernier utilisateur" sortKey="lastLoggedUser" sort={assetSort} onToggle={toggleAssetSort} />
                <SortableHeader label="Source" sortKey="source" sort={assetSort} onToggle={toggleAssetSort} />
                <th className="px-4 py-3 font-medium text-slate-500">Vu</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAssets.map((a) => {
                const Icon = TYPE_ICONS[a.type] ?? Monitor;
                return (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailAsset(a)}
                        className="flex flex-col text-left hover:underline"
                      >
                        <span className="font-medium text-blue-700 font-mono text-[12px]">{a.name}</span>
                        {a.manufacturer && (
                          <span className="text-[11px] text-slate-500">{a.manufacturer} {a.model}</span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Icon className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-[12.5px]">{ASSET_TYPE_LABELS[a.type]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(a.status)}>{ASSET_STATUS_LABELS[a.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[12.5px]">
                      {a.os ? `${a.os}${a.osVersion ? ` ${a.osVersion}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{a.ipAddress ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600 text-[12.5px]">{a.siteName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600 text-[12.5px]">{a.lastLoggedUser ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={sourceVariant(a.source)}>{ASSET_SOURCE_LABELS[a.source]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">{timeAgo(a.lastSeenAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetailAsset(a)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                          title="Voir les details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(a)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Server className="h-10 w-10" strokeWidth={1.5} />
                      <div className="text-[13px] font-medium text-slate-500">Aucun actif trouvé</div>
                      <div className="text-[12px]">Ajoutez un actif manuellement ou synchronisez depuis un RMM.</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AssetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        asset={editing}
        organizationId={organizationId}
        onSave={handleSave}
      />

      <AssetDetailDrawer
        asset={detailAsset}
        onClose={() => setDetailAsset(null)}
      />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: "blue" | "emerald" | "amber" | "violet";
}) {
  const accentMap = {
    blue: "bg-blue-50 text-blue-600 ring-blue-200/60",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-200/60",
    amber: "bg-amber-50 text-amber-600 ring-amber-200/60",
    violet: "bg-violet-50 text-violet-600 ring-violet-200/60",
  };
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center ring-1 ring-inset", accentMap[accent])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-slate-500">{label}</div>
        <div className="text-[18px] font-semibold tracking-tight text-slate-900 truncate">{value}</div>
      </div>
    </Card>
  );
}

// keep formatDate exported-ish to avoid unused
export const __formatDate = formatDate;
