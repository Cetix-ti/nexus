"use client";

import { useEffect, useState } from "react";
import {
  X,
  Monitor,
  Loader2,
  Package,
  Search,
  Server,
  Laptop,
  HardDrive,
  Network,
  Shield,
  Layers,
  Zap,
  Printer,
  Phone,
  Activity,
  Database,
  Cloud,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ASSET_TYPE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_SOURCE_LABELS,
  type OrgAsset,
  type AssetType,
} from "@/lib/assets/types";

interface AvailablePatch {
  name: string;
  category: string | null;
  kbId: string | null;
  status: string | null;
}

interface AssetDetailDrawerProps {
  asset: OrgAsset | null;
  onClose: () => void;
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

export function AssetDetailDrawer({ asset, onClose }: AssetDetailDrawerProps) {
  const [patches, setPatches] = useState<AvailablePatch[]>([]);
  const [patchesLoading, setPatchesLoading] = useState(false);
  const [patchesError, setPatchesError] = useState<string | null>(null);
  const [patchesSearch, setPatchesSearch] = useState("");

  useEffect(() => {
    if (!asset) return;
    setPatches([]);
    setPatchesError(null);
    setPatchesSearch("");

    if (asset.source === "atera") {
      setPatchesLoading(true);
      fetch(`/api/v1/assets/${encodeURIComponent(asset.id)}/software`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((s) => {
          if (Array.isArray(s)) setPatches(s);
        })
        .catch((e) => setPatchesError(e instanceof Error ? e.message : String(e)))
        .finally(() => setPatchesLoading(false));
    }
  }, [asset]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (asset) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [asset, onClose]);

  if (!asset) return null;

  const Icon = TYPE_ICONS[asset.type] ?? Monitor;

  const filteredPatches = patches.filter((p) => {
    if (!patchesSearch) return true;
    const q = patchesSearch.toLowerCase();
    return [p.name, p.category, p.kbId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 font-mono truncate">
                {asset.name}
              </h2>
              <p className="text-[12.5px] text-slate-500 truncate">
                {asset.manufacturer} {asset.model}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Asset info */}
          <Card>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-[13px]">
                <InfoField label="Type" value={ASSET_TYPE_LABELS[asset.type] ?? asset.type} />
                <InfoField label="Statut">
                  <Badge
                    variant={
                      asset.status === "active"
                        ? "success"
                        : asset.status === "maintenance"
                        ? "warning"
                        : "default"
                    }
                  >
                    {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                  </Badge>
                </InfoField>
                <InfoField label="Source" value={ASSET_SOURCE_LABELS[asset.source] ?? asset.source} />
                <InfoField label="N\u00b0 de s\u00e9rie" value={asset.serialNumber} mono />
                <InfoField label="Adresse IP" value={asset.ipAddress} mono />
                <InfoField label="Site" value={asset.siteName} />
                {asset.os && (
                  <InfoField
                    label="OS"
                    value={`${asset.os}${asset.osVersion ? ` ${asset.osVersion}` : ""}`}
                  />
                )}
                {asset.cpuModel && <InfoField label="CPU" value={asset.cpuModel} />}
                {asset.ramGb != null && <InfoField label="RAM" value={`${asset.ramGb} Go`} />}
                {asset.lastLoggedUser && (
                  <InfoField label="Dernier utilisateur" value={asset.lastLoggedUser} />
                )}
                {asset.fqdn && <InfoField label="FQDN" value={asset.fqdn} mono />}
              </div>
            </CardContent>
          </Card>

          {/* Available patches from Atera */}
          {asset.source === "atera" && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-500" />
                  Mises à jour disponibles
                  {!patchesLoading && patches.length > 0 && (
                    <span className="text-[12px] font-normal text-slate-400">
                      ({patches.length})
                    </span>
                  )}
                </h3>

                {patchesLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-[13px] text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement depuis Atera...
                  </div>
                ) : patchesError ? (
                  <div className="text-[13px] text-red-600 bg-red-50 rounded-lg px-4 py-3">
                    Erreur : {patchesError}
                  </div>
                ) : patches.length === 0 ? (
                  <p className="text-[13px] text-slate-400 text-center py-6">
                    Aucune mise à jour disponible pour cet actif.
                  </p>
                ) : (
                  <>
                    {patches.length > 10 && (
                      <Input
                        placeholder="Rechercher une mise à jour..."
                        value={patchesSearch}
                        onChange={(e) => setPatchesSearch(e.target.value)}
                        iconLeft={<Search className="h-4 w-4" />}
                        className="mb-3"
                      />
                    )}
                    <div className="rounded-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
                      <table className="w-full text-[13px]">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase text-slate-400">
                            <th className="px-4 py-2">Nom</th>
                            <th className="px-4 py-2">Catégorie</th>
                            <th className="px-4 py-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPatches.map((p, i) => (
                            <tr key={i} className="hover:bg-slate-50/60">
                              <td className="px-4 py-2 text-slate-700">
                                {p.name}
                                {p.kbId && (
                                  <span className="ml-1.5 text-[11px] font-mono text-slate-400">
                                    {p.kbId}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-slate-500 text-[12px]">
                                {p.category ?? "\u2014"}
                              </td>
                              <td className="px-4 py-2 text-[12px]">
                                <span className={p.status === "Failed" ? "text-red-600" : "text-emerald-600"}>
                                  {p.status ?? "\u2014"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-slate-400 text-[11px]">{label}</p>
      {children ?? (
        <p className={`text-slate-700 ${mono ? "font-mono text-[12px]" : ""}`}>
          {value ?? "\u2014"}
        </p>
      )}
    </div>
  );
}
