"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  Monitor,
  Laptop,
  Server,
  HardDrive,
  Wifi,
  Shield,
  Printer,
  Building2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Asset {
  id: string;
  name: string;
  type: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  ipAddress?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  externalSource?: string | null;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  clientCode?: string | null;
  logo?: string | null;
  assetCount?: number;
}

const TYPE_ICONS: Record<string, any> = {
  WORKSTATION: Monitor,
  LAPTOP: Laptop,
  SERVER: Server,
  VIRTUAL_MACHINE: Server,
  NETWORK_DEVICE: Wifi,
  PRINTER: Printer,
  MOBILE: Laptop,
  workstation: Monitor,
  laptop: Laptop,
  server_physical: Server,
  server_virtual: Server,
  windows_server: Server,
  linux_server: Server,
  nas: HardDrive,
  san: HardDrive,
  firewall: Shield,
  network_switch: Wifi,
  router: Wifi,
  wifi_ap: Wifi,
  printer: Printer,
  OTHER: HardDrive,
};

const TYPE_LABELS: Record<string, string> = {
  // DB enum values
  WORKSTATION: "Postes de travail",
  LAPTOP: "Postes de travail",
  SERVER: "Serveurs Windows/Linux",
  VIRTUAL_MACHINE: "Machine virtuelle",
  NETWORK_DEVICE: "Équipement réseau",
  PRINTER: "Imprimante",
  MOBILE: "Mobile",
  OTHER: "Autre",
  // UI mapped values returned by the API
  workstation: "Postes de travail",
  laptop: "Postes de travail",
  windows_server: "Serveurs Windows/Linux",
  linux_server: "Serveurs Windows/Linux",
  server_physical: "Serveur physique",
  server_virtual: "Machine virtuelle",
  nas: "NAS",
  san: "SAN",
  hypervisor: "Hyperviseur",
  network_switch: "Switch",
  router: "Routeur",
  firewall: "Pare-feu",
  wifi_ap: "Point d'accès WiFi",
  ups: "Onduleur",
  printer: "Imprimante",
  ip_phone: "Téléphone IP",
  monitoring_appliance: "Appareil de monitoring",
  tape_library: "Sauvegarde sur bande",
  cloud_resource: "Ressource cloud",
};

interface Props {
  open: boolean;
  onClose: () => void;
  ticketOrgId?: string | null;
  alreadyLinkedIds: string[];
  onLink: (asset: Asset) => Promise<void> | void;
}

export function LinkAssetModal({
  open,
  onClose,
  ticketOrgId,
  alreadyLinkedIds,
  onLink,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(ticketOrgId ?? null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Load orgs list
  useEffect(() => {
    if (!open) return;
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) {
          setOrgs(d.map((o: any) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            clientCode: o.clientCode ?? null,
            logo: o.logo ?? null,
          })));
        }
      })
      .catch(() => {});
  }, [open]);

  // Reset filter when modal opens
  useEffect(() => {
    if (open) {
      setSelectedOrgId(ticketOrgId ?? null);
      setSearch("");
      setTypeFilter(null);
    }
  }, [open, ticketOrgId]);

  // Load assets whenever org or search changes
  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      if (selectedOrgId) {
        const res = await fetch(`/api/v1/organizations/${encodeURIComponent(selectedOrgId)}/assets`);
        const data = res.ok ? await res.json() : [];
        setAssets(Array.isArray(data) ? data : []);
      } else {
        // All orgs: parallel fetch across all organizations
        if (orgs.length === 0) {
          setAssets([]);
          return;
        }
        const results = await Promise.allSettled(
          orgs.map((o) =>
            fetch(`/api/v1/organizations/${encodeURIComponent(o.id)}/assets`)
              .then((r) => (r.ok ? r.json() : []))
              .then((data) =>
                Array.isArray(data)
                  ? data.map((a: any) => ({ ...a, organizationId: o.id, organizationName: o.name }))
                  : [],
              ),
          ),
        );
        const all: Asset[] = [];
        for (const r of results) {
          if (r.status === "fulfilled") all.push(...r.value);
        }
        setAssets(all);
      }
    } catch (e) {
      console.error("Failed to load assets:", e);
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }, [selectedOrgId, orgs]);

  useEffect(() => {
    if (!open) return;
    fetchAssets();
  }, [open, fetchAssets]);

  // Resolve the display label for a raw asset type (handles both DB enum
  // values and UI-mapped ones).
  function labelForType(t: string): string {
    return TYPE_LABELS[t] ?? t;
  }

  const filteredAssets = useMemo(() => {
    let list = assets.filter((a) => !alreadyLinkedIds.includes(a.id));
    if (typeFilter) {
      // typeFilter holds a display LABEL — an asset matches if its
      // resolved label equals the selected label (so "Postes de travail"
      // matches both WORKSTATION and LAPTOP).
      list = list.filter((a) => labelForType(a.type) === typeFilter);
    }
    if (search.length > 0) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        [a.name, a.manufacturer, a.model, a.serialNumber, a.ipAddress]
          .filter(Boolean).join(" ").toLowerCase().includes(q),
      );
    }
    return list;
  }, [assets, search, typeFilter, alreadyLinkedIds]);

  // Chip labels, deduplicated. Two raw types that share a label (e.g.
  // WORKSTATION + LAPTOP → "Postes de travail") collapse to one chip.
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => set.add(labelForType(a.type)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [assets]);

  async function handleLink(asset: Asset) {
    setLinkingId(asset.id);
    try {
      await onLink(asset);
    } finally {
      setLinkingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-3rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-slate-900">Lier un actif au ticket</h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Recherchez parmi les actifs ou filtrez par organisation et type
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, modèle, numéro de série, adresse IP…"
              autoFocus
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 pl-11 pr-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Body: sidebar (orgs) + content (assets) */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Left: organization nav */}
          <div className="w-60 shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50/40">
            <div className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">Organisation</p>
              <button
                onClick={() => setSelectedOrgId(null)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                  selectedOrgId === null
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                Toutes
              </button>
              <div className="mt-1 space-y-0.5">
                {orgs.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOrgId(o.id)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors text-left",
                      selectedOrgId === o.id
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {o.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.logo} alt="" className="h-5 w-5 rounded object-contain bg-white ring-1 ring-slate-200 shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="text-[8px] font-bold text-slate-500">
                          {o.clientCode || o.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="truncate">{o.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: assets list */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Type filter chips */}
            {availableTypes.length > 0 && (
              <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap gap-1.5 shrink-0">
                <button
                  onClick={() => setTypeFilter(null)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors",
                    typeFilter === null ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  Tous les types
                </button>
                {availableTypes.map((label) => (
                  <button
                    key={label}
                    onClick={() => setTypeFilter(label)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors",
                      typeFilter === label ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Asset list */}
            <div className="flex-1 overflow-y-auto p-3">
              {loadingAssets ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="text-center py-16 text-[13px] text-slate-400">
                  {search ? "Aucun actif ne correspond à votre recherche." : "Aucun actif disponible."}
                </div>
              ) : (
                <>
                  <p className="text-[11.5px] text-slate-500 px-1 mb-2">
                    {filteredAssets.length} actif{filteredAssets.length > 1 ? "s" : ""} trouvé{filteredAssets.length > 1 ? "s" : ""}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {filteredAssets.slice(0, 100).map((a) => {
                      const Icon = TYPE_ICONS[a.type] ?? HardDrive;
                      const isLinking = linkingId === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => handleLink(a)}
                          disabled={isLinking}
                          className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors text-left disabled:opacity-50"
                        >
                          <div className="h-9 w-9 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                            <Icon className="h-4 w-4 text-slate-500 group-hover:text-blue-600 transition-colors" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold text-slate-900 font-mono truncate">
                              {a.name}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {[a.manufacturer, a.model].filter(Boolean).join(" ") || TYPE_LABELS[a.type] || a.type}
                              {a.ipAddress ? ` · ${a.ipAddress}` : ""}
                            </p>
                            {!selectedOrgId && a.organizationName && (
                              <p className="text-[10px] text-slate-400 truncate">{a.organizationName}</p>
                            )}
                          </div>
                          {isLinking ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-slate-300 group-hover:text-blue-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {filteredAssets.length > 100 && (
                    <p className="text-[11px] text-slate-400 text-center mt-3">
                      Affichage des 100 premiers résultats. Affinez votre recherche pour voir plus d&apos;actifs.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-end shrink-0">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
