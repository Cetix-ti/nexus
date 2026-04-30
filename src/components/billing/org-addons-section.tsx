"use client";

// ============================================================================
// Section "Abonnements supplémentaires" dans la fiche facturation d'une org.
//
// Liste les addons assignés à l'org avec possibilité d'override du prix
// négocié (monthlyPrice), de la quantité, et d'ajout/retrait. Le catalogue
// (BillingAddon) est géré ailleurs dans Finances > Facturation ; ici on
// joue uniquement sur les assignations (OrganizationAddon).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Package,
  Plus,
  Trash2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CatalogAddon {
  id: string;
  name: string;
  description: string;
  defaultMonthlyPrice: number;
  active: boolean;
}

interface OrgAddon {
  id: string;
  addonId: string;
  name: string;
  description: string;
  defaultMonthlyPrice: number;
  monthlyPrice: number | null;
  effectiveUnitPrice: number;
  quantity: number;
  effectiveTotal: number;
  isPriceOverridden: boolean;
  active: boolean;
  notes: string;
}

function fmtMoney(v: number): string {
  return v.toLocaleString("fr-CA", {
    style: "currency", currency: "CAD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function OrgAddonsSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const [assigned, setAssigned] = useState<OrgAddon[]>([]);
  const [catalog, setCatalog] = useState<CatalogAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAddonId, setSelectedAddonId] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ar, cr] = await Promise.all([
      fetch(`/api/v1/organizations/${organizationId}/addons`),
      fetch("/api/v1/billing/addons"),
    ]);
    const a = ar.ok ? await ar.json() : { data: [] };
    const c = cr.ok ? await cr.json() : { data: [] };
    setAssigned(a.data ?? []);
    setCatalog((c.data ?? []).filter((x: CatalogAddon) => x.active));
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function assign() {
    if (!selectedAddonId) return;
    setAdding(true);
    await fetch(`/api/v1/organizations/${organizationId}/addons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addonId: selectedAddonId }),
    });
    setAdding(false);
    setSelectedAddonId("");
    load();
  }

  async function update(id: string, patch: Partial<OrgAddon>) {
    await fetch(`/api/v1/organizations/${organizationId}/addons`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  async function remove(a: OrgAddon) {
    if (!confirm(`Retirer « ${a.name} » de cette organisation ?`)) return;
    await fetch(`/api/v1/organizations/${organizationId}/addons?assignmentId=${a.id}`, {
      method: "DELETE",
    });
    load();
  }

  const availableAddons = catalog.filter(
    (c) => !assigned.some((a) => a.addonId === c.id),
  );
  const monthlyTotal = assigned
    .filter((a) => a.active)
    .reduce((s, a) => s + a.effectiveTotal, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Package className="h-4 w-4 text-blue-600" />
          Abonnements supplémentaires
          {monthlyTotal > 0 && (
            <span className="ml-auto text-[12.5px] font-normal text-slate-500">
              Total mensuel :{" "}
              <span className="font-semibold text-slate-800 tabular-nums">
                {fmtMoney(monthlyTotal)}
              </span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] text-slate-500">
          Services connexes vendus à ce client (antivirus managé, licences M365,
          etc.). Le prix par défaut vient du catalogue ; tu peux écraser le
          prix négocié pour ce client seulement.
        </p>

        {loading ? (
          <p className="py-4 text-center text-[13px] text-slate-400">Chargement…</p>
        ) : assigned.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-slate-400 rounded-lg border border-dashed border-slate-300 bg-slate-50/40">
            Aucun abonnement assigné à ce client.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
            {assigned.map((a) => (
              <AssignedRow
                key={a.id}
                a={a}
                onChange={(patch) => update(a.id, patch)}
                onRemove={() => remove(a)}
              />
            ))}
          </ul>
        )}

        {/* Ajouter un addon depuis le catalogue */}
        {availableAddons.length > 0 ? (
          <div className="flex items-end gap-2 flex-wrap rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex-1 min-w-[220px]">
              <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                Ajouter un abonnement du catalogue
              </label>
              <Select value={selectedAddonId} onValueChange={setSelectedAddonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {availableAddons.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {fmtMoney(c.defaultMonthlyPrice)}/mois
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={assign}
              disabled={!selectedAddonId || adding}
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Assigner
            </Button>
          </div>
        ) : (
          catalog.length === 0 && (
            <p className="text-[11.5px] italic text-slate-400">
              Aucun abonnement disponible — ajoute-en dans le catalogue sous{" "}
              <span className="font-medium">Finances → Facturation</span>.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}

function AssignedRow({
  a, onChange, onRemove,
}: {
  a: OrgAddon;
  onChange: (patch: Partial<OrgAddon>) => void;
  onRemove: () => void;
}) {
  const [priceInput, setPriceInput] = useState<string>(
    a.monthlyPrice !== null ? String(a.monthlyPrice) : "",
  );
  const [qtyInput, setQtyInput] = useState<string>(String(a.quantity));

  useEffect(() => {
    setPriceInput(a.monthlyPrice !== null ? String(a.monthlyPrice) : "");
    setQtyInput(String(a.quantity));
  }, [a.monthlyPrice, a.quantity]);

  function commitPrice() {
    const v = priceInput.trim();
    if (v === "") {
      // null = hérite du prix catalogue
      onChange({ monthlyPrice: null });
    } else {
      const parsed = Number(v);
      if (!Number.isNaN(parsed) && parsed !== a.monthlyPrice) {
        onChange({ monthlyPrice: parsed });
      }
    }
  }

  function commitQty() {
    const parsed = parseInt(qtyInput, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed !== a.quantity) {
      onChange({ quantity: parsed });
    } else {
      setQtyInput(String(a.quantity));
    }
  }

  return (
    // Layout responsive : empilé verticalement sur mobile (< sm), une seule
    // ligne sur ≥ sm. Sur mobile : nom + badge + bouton trash sur la 1re
    // ligne, contrôles Qté/Prix/Total qui wrappent sur la 2e (ou plus si
    // viewport très étroit). Évite le débordement horizontal du tableau
    // qui forçait un scroll latéral pénible sur téléphone.
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5 bg-white">
      {/* Nom + badge + (trash mobile-only) */}
      <div className="flex items-start gap-2 sm:flex-1 sm:min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn(
              "text-[13px] font-medium",
              a.active ? "text-slate-800" : "text-slate-400 line-through",
            )}>
              {a.name}
            </p>
            <button
              type="button"
              onClick={() => onChange({ active: !a.active })}
              className={cn(
                "text-[10.5px] font-semibold rounded-full px-2 py-0.5 ring-1",
                a.active
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-slate-100 text-slate-500 ring-slate-200",
              )}
            >
              {a.active ? "Actif" : "Inactif"}
            </button>
          </div>
          {a.description && (
            <p className="text-[11px] text-slate-500 line-clamp-2 sm:truncate">{a.description}</p>
          )}
        </div>
        {/* Trash bouton mobile : aligné à droite sur la 1re ligne */}
        <button
          type="button"
          onClick={onRemove}
          className="sm:hidden text-slate-300 hover:text-red-500 p-1 -m-1"
          title="Retirer"
          aria-label="Retirer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Contrôles : flex-wrap pour passer sur 2 lignes si vraiment étroit */}
      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-[10.5px] text-slate-500 font-medium">Qté</label>
          <Input
            type="number"
            min={1}
            step={1}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitQty(); }
            }}
            className="w-14 h-8 text-[12.5px] text-center tabular-nums"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-[10.5px] text-slate-500 font-medium">Prix</label>
          <div className="relative">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={priceInput}
              placeholder={`Hérité : ${a.defaultMonthlyPrice.toFixed(2)}`}
              onChange={(e) => setPriceInput(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitPrice(); }
              }}
              className={cn(
                "w-28 h-8 pr-6 text-[12.5px] text-right tabular-nums",
                a.isPriceOverridden && "border-blue-400 bg-blue-50/40 ring-1 ring-blue-300/60",
              )}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-slate-400">
              $
            </span>
          </div>
          {a.isPriceOverridden && (
            <button
              type="button"
              onClick={() => onChange({ monthlyPrice: null })}
              className="text-slate-400 hover:text-blue-600"
              title="Revenir au prix catalogue"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto sm:ml-0 sm:w-24 text-right shrink-0">
          <p className="text-[13px] font-bold tabular-nums text-slate-800">
            {fmtMoney(a.effectiveTotal)}
          </p>
          {a.quantity > 1 && (
            <p className="text-[10px] text-slate-500 tabular-nums">
              {a.quantity} × {fmtMoney(a.effectiveUnitPrice)}
            </p>
          )}
        </div>

        {/* Trash bouton desktop seulement */}
        <button
          type="button"
          onClick={onRemove}
          className="hidden sm:block text-slate-300 hover:text-red-500"
          title="Retirer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
