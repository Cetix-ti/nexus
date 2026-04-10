"use client";

import { useEffect, useState } from "react";
import { X, Server, Cpu, Network, ShieldCheck, Save, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_CATEGORIES,
  ASSET_TYPE_LABELS,
  type AssetStatus,
  type AssetType,
  type OrgAsset,
} from "@/lib/assets/types";

interface AssetModalProps {
  open: boolean;
  onClose: () => void;
  asset: OrgAsset | null;
  organizationId: string;
  onSave: (a: OrgAsset) => void;
}

type TabId = "identification" | "hardware" | "network" | "warranty";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "identification", label: "Identification", icon: Server },
  { id: "hardware", label: "Matériel", icon: Cpu },
  { id: "network", label: "Réseau & Localisation", icon: Network },
  { id: "warranty", label: "Garantie", icon: ShieldCheck },
];

function emptyAsset(organizationId: string): OrgAsset {
  const now = new Date().toISOString();
  return {
    id: `ast-${Math.random().toString(36).slice(2, 10)}`,
    organizationId,
    name: "",
    type: "workstation",
    status: "active",
    source: "manual",
    isMonitored: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface EolResult {
  endOfSaleDate: string | null;
  endOfLifeDate: string | null;
  endOfExtendedSupportDate: string | null;
  source: string;
  confidence: "high" | "medium" | "low";
  notes: string;
}

export function AssetModal({ open, onClose, asset, organizationId, onSave }: AssetModalProps) {
  const [tab, setTab] = useState<TabId>("identification");
  const [form, setForm] = useState<OrgAsset>(() => asset ?? emptyAsset(organizationId));
  const [eolLoading, setEolLoading] = useState(false);
  const [eolResult, setEolResult] = useState<EolResult | null>(null);
  const [eolError, setEolError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(asset ?? emptyAsset(organizationId));
      setTab("identification");
      setEolResult(null);
      setEolError(null);
    }
  }, [open, asset, organizationId]);

  if (!open) return null;

  function update<K extends keyof OrgAsset>(key: K, value: OrgAsset[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...form, updatedAt: new Date().toISOString() });
    onClose();
  }

  async function lookupEol() {
    if (!form.manufacturer && !form.model) {
      setEolError("Renseignez le fabricant ou le modèle d'abord (onglet Identification).");
      return;
    }
    setEolLoading(true);
    setEolError(null);
    setEolResult(null);
    try {
      const res = await fetch("/api/v1/ai/asset-eol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: form.manufacturer,
          model: form.model,
          type: form.type,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: EolResult = await res.json();
      setEolResult(data);
      // Auto-fill the EOL date if we got one
      if (data.endOfLifeDate) {
        setForm((f) => ({ ...f, endOfLifeDate: data.endOfLifeDate! }));
      }
    } catch (err) {
      setEolError(err instanceof Error ? err.message : String(err));
    } finally {
      setEolLoading(false);
    }
  }

  const confidenceLabel: Record<string, { text: string; color: string }> = {
    high: { text: "Confiance élevée", color: "text-emerald-700 bg-emerald-50 ring-emerald-200/60" },
    medium: { text: "Estimation", color: "text-amber-700 bg-amber-50 ring-amber-200/60" },
    low: { text: "Incertain", color: "text-red-700 bg-red-50 ring-red-200/60" },
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Server className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {asset ? "Modifier l'actif" : "Nouvel actif"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                {asset ? "Mettre à jour les informations de l'équipement" : "Ajouter manuellement un équipement à l'inventaire"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-6 pt-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13px] font-medium transition-colors border-b-2",
                  active
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {tab === "identification" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nom / Hostname"
                  placeholder="SRV-DC01"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Type d&apos;actif</label>
                  <Select value={form.type} onValueChange={(v) => update("type", v as AssetType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
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
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Statut</label>
                  <Select value={form.status} onValueChange={(v) => update("status", v as AssetStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Étiquette / Asset Tag"
                  placeholder="CTX-SRV-001"
                  value={form.assetTag ?? ""}
                  onChange={(e) => update("assetTag", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Fabricant"
                  placeholder="HPE, Dell, Cisco..."
                  value={form.manufacturer ?? ""}
                  onChange={(e) => update("manufacturer", e.target.value)}
                />
                <Input
                  label="Modèle"
                  placeholder="ProLiant DL380 Gen10"
                  value={form.model ?? ""}
                  onChange={(e) => update("model", e.target.value)}
                />
                <Input
                  label="Numéro de série"
                  placeholder="CZJ9120ABC"
                  value={form.serialNumber ?? ""}
                  onChange={(e) => update("serialNumber", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Notes</label>
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  placeholder="Informations additionnelles..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
            </>
          )}

          {tab === "hardware" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Système d'exploitation"
                  placeholder="Windows Server 2022"
                  value={form.os ?? ""}
                  onChange={(e) => update("os", e.target.value)}
                />
                <Input
                  label="Version OS"
                  placeholder="22H2"
                  value={form.osVersion ?? ""}
                  onChange={(e) => update("osVersion", e.target.value)}
                />
              </div>
              <Input
                label="Modèle CPU"
                placeholder="Intel Xeon Gold 6230"
                value={form.cpuModel ?? ""}
                onChange={(e) => update("cpuModel", e.target.value)}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Coeurs CPU"
                  type="number"
                  placeholder="20"
                  value={form.cpuCores ?? ""}
                  onChange={(e) => update("cpuCores", e.target.value ? Number(e.target.value) : undefined)}
                />
                <Input
                  label="RAM (Go)"
                  type="number"
                  placeholder="128"
                  value={form.ramGb ?? ""}
                  onChange={(e) => update("ramGb", e.target.value ? Number(e.target.value) : undefined)}
                />
                <Input
                  label="Stockage (Go)"
                  type="number"
                  placeholder="4000"
                  value={form.storageGb ?? ""}
                  onChange={(e) => update("storageGb", e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium text-slate-800">Surveillance active</div>
                  <div className="text-[12px] text-slate-500">Activer la collecte de métriques pour cet actif</div>
                </div>
                <Switch
                  checked={form.isMonitored}
                  onCheckedChange={(v) => update("isMonitored", v)}
                />
              </div>
            </>
          )}

          {tab === "network" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Adresse IP"
                  placeholder="10.10.0.10"
                  value={form.ipAddress ?? ""}
                  onChange={(e) => update("ipAddress", e.target.value)}
                />
                <Input
                  label="Adresse MAC"
                  placeholder="AC:1F:6B:11:22:33"
                  value={form.macAddress ?? ""}
                  onChange={(e) => update("macAddress", e.target.value)}
                />
              </div>
              <Input
                label="FQDN"
                placeholder="dc01.cetix.local"
                value={form.fqdn ?? ""}
                onChange={(e) => update("fqdn", e.target.value)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Site"
                  placeholder="Siège - Salle serveurs"
                  value={form.siteName ?? ""}
                  onChange={(e) => update("siteName", e.target.value)}
                />
                <Input
                  label="Position rack"
                  placeholder="Rack A1 / U22"
                  value={form.rackPosition ?? ""}
                  onChange={(e) => update("rackPosition", e.target.value)}
                />
              </div>
              <Input
                label="Assigné à"
                placeholder="Nom du contact"
                value={form.assignedToContactName ?? ""}
                onChange={(e) => update("assignedToContactName", e.target.value)}
              />
            </>
          )}

          {tab === "warranty" && (
            <>
              {/* AI EOL lookup */}
              <div className="rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50/80 to-blue-50/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">
                        Recherche EOL automatique
                      </p>
                      <p className="text-[11.5px] text-slate-500">
                        {form.manufacturer || form.model
                          ? `Rechercher la fin de vie pour ${[form.manufacturer, form.model].filter(Boolean).join(" ")}`
                          : "Renseignez le fabricant/modèle dans l'onglet Identification"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={eolLoading || (!form.manufacturer && !form.model)}
                    onClick={lookupEol}
                  >
                    {eolLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {eolLoading ? "Recherche..." : "Rechercher"}
                  </Button>
                </div>

                {eolError && (
                  <p className="mt-3 text-[12px] text-red-600">{eolError}</p>
                )}

                {eolResult && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
                          confidenceLabel[eolResult.confidence]?.color ?? "text-slate-600 bg-slate-50",
                        )}
                      >
                        {confidenceLabel[eolResult.confidence]?.text ?? eolResult.confidence}
                      </span>
                      <span className="text-[11px] text-slate-400">{eolResult.source}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                      <div className="rounded-lg bg-white/80 border border-slate-200/60 px-2.5 py-2">
                        <p className="text-slate-500 text-[10.5px]">Fin de vente</p>
                        <p className="font-medium text-slate-800 tabular-nums">
                          {eolResult.endOfSaleDate ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 border border-slate-200/60 px-2.5 py-2">
                        <p className="text-slate-500 text-[10.5px]">Fin de vie (EOL)</p>
                        <p className="font-medium text-slate-800 tabular-nums">
                          {eolResult.endOfLifeDate ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 border border-slate-200/60 px-2.5 py-2">
                        <p className="text-slate-500 text-[10.5px]">Support étendu</p>
                        <p className="font-medium text-slate-800 tabular-nums">
                          {eolResult.endOfExtendedSupportDate ?? "—"}
                        </p>
                      </div>
                    </div>

                    {eolResult.notes && (
                      <p className="text-[11.5px] text-slate-600 italic">{eolResult.notes}</p>
                    )}

                    {eolResult.endOfLifeDate && (
                      <p className="text-[11px] text-emerald-700 font-medium">
                        La date de fin de vie a été appliquée au champ ci-dessous.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Date d'achat"
                  type="date"
                  value={form.purchaseDate ?? ""}
                  onChange={(e) => update("purchaseDate", e.target.value)}
                />
                <Input
                  label="Coût d'achat (CAD)"
                  type="number"
                  placeholder="12500"
                  value={form.purchaseCost ?? ""}
                  onChange={(e) => update("purchaseCost", e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Fin de garantie"
                  type="date"
                  value={form.warrantyExpiry ?? ""}
                  onChange={(e) => update("warrantyExpiry", e.target.value)}
                />
                <Input
                  label="Fin de vie (EOL)"
                  type="date"
                  value={form.endOfLifeDate ?? ""}
                  onChange={(e) => update("endOfLifeDate", e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              <Save className="h-4 w-4" strokeWidth={2.5} />
              {asset ? "Enregistrer" : "Créer l'actif"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
