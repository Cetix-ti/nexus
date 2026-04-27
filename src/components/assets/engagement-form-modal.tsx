"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Modale unifiée de création/édition d'un engagement (warranty,
 * subscription, ou support contract).
 *
 * Pourquoi unifié : les 3 types partagent ~80% des champs (asset,
 * vendor, dates, montant, devise, autoRenew). Quelques champs
 * spécifiques par kind sont rendus conditionnellement.
 *
 * Renouvellements (kind=renewal) sont gérés ailleurs (CalendarEvent
 * kind=RENEWAL via la page calendrier ou l'onglet Renouvellements
 * existant) — pas couverts ici.
 */

type Kind = "warranty" | "subscription" | "support";

interface AssetOption {
  id: string;
  name: string;
}

const KIND_LABELS: Record<Kind, { title: string; verb: string; routeSegment: string }> = {
  warranty: {
    title: "Garantie",
    verb: "garantie",
    routeSegment: "asset-warranties",
  },
  subscription: {
    title: "Abonnement",
    verb: "abonnement",
    routeSegment: "asset-subscriptions",
  },
  support: {
    title: "Contrat de support",
    verb: "contrat de support",
    routeSegment: "asset-support-contracts",
  },
};

const COVERAGE_LEVELS = ["BASIC", "STANDARD", "EXTENDED", "PREMIUM"] as const;
const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;
const SUPPORT_TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;

export function EngagementFormModal({
  open,
  onClose,
  organizationId,
  kind,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  kind: Kind;
  /** Si fourni, mode édition. Sinon mode création. */
  existing?: {
    id: string;
    assetId: string;
    vendor: string | null;
    startDate: string;
    endDate: string;
    coverageLevel?: string;
    plan?: string | null;
    autoRenew?: boolean;
    billingCycle?: string;
    amount?: number | null;
    currency?: string;
    tier?: string;
  } | null;
  onSaved: () => void;
}) {
  const meta = KIND_LABELS[kind];
  const isEdit = !!existing;

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [assetId, setAssetId] = useState("");
  const [vendor, setVendor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState("CAD");
  const [autoRenew, setAutoRenew] = useState(false);
  const [coverageLevel, setCoverageLevel] = useState("BASIC");
  const [plan, setPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("ANNUAL");
  const [tier, setTier] = useState("STANDARD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Charge la liste des assets pour le dropdown.
    fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/assets`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.data ?? [];
        setAssets(
          list.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
        );
      })
      .catch(() => setAssets([]));

    if (existing) {
      setAssetId(existing.assetId);
      setVendor(existing.vendor ?? "");
      setStartDate(existing.startDate.slice(0, 10));
      setEndDate(existing.endDate.slice(0, 10));
      setAmount(existing.amount != null ? String(existing.amount) : "");
      setCurrency(existing.currency ?? "CAD");
      setAutoRenew(!!existing.autoRenew);
      setCoverageLevel(existing.coverageLevel ?? "BASIC");
      setPlan(existing.plan ?? "");
      setBillingCycle(existing.billingCycle ?? "ANNUAL");
      setTier(existing.tier ?? "STANDARD");
    } else {
      setAssetId("");
      setVendor("");
      setStartDate("");
      setEndDate("");
      setAmount("");
      setCurrency("CAD");
      setAutoRenew(false);
      setCoverageLevel("BASIC");
      setPlan("");
      setBillingCycle("ANNUAL");
      setTier("STANDARD");
    }
    setError(null);
  }, [open, existing, organizationId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId || !startDate || !endDate) {
      setError("Actif, date de début et date de fin sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      assetId,
      vendor: vendor || null,
      startDate,
      endDate,
      autoRenew,
      amount: amount ? Number(amount) : null,
      currency,
    };
    if (kind === "warranty") body.coverageLevel = coverageLevel;
    if (kind === "subscription") {
      body.plan = plan || null;
      body.billingCycle = billingCycle;
    }
    if (kind === "support") body.tier = tier;

    const url = isEdit
      ? `/api/v1/${meta.routeSegment}/${existing!.id}`
      : `/api/v1/${meta.routeSegment}`;
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `Erreur ${res.status}`);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Modifier ${meta.verb}` : `Nouvelle ${meta.title.toLowerCase()}`}
          </DialogTitle>
          <DialogDescription>
            Engagement rattaché à un actif de l&apos;organisation. Les
            renouvellements automatiques s&apos;affichent dans l&apos;onglet
            « Renouvellements » du calendrier.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 text-red-700 text-[12.5px] px-3 py-2 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1 block">Actif *</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
            >
              <option value="">— Choisir —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Fournisseur"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Ex : HP, Microsoft, Bell"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Début *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Fin *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              />
            </div>
          </div>

          {kind === "warranty" && (
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Niveau de couverture</label>
              <select
                value={coverageLevel}
                onChange={(e) => setCoverageLevel(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                {COVERAGE_LEVELS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {kind === "subscription" && (
            <>
              <Input
                label="Plan / produit"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Ex : Microsoft 365 Business Premium"
              />
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1 block">Cycle de facturation</label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
                >
                  {BILLING_CYCLES.map((c) => (
                    <option key={c} value={c}>{c === "MONTHLY" ? "Mensuel" : c === "QUARTERLY" ? "Trimestriel" : "Annuel"}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {kind === "support" && (
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Niveau de support</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                {SUPPORT_TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Montant"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-1 block">Devise</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px]"
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Renouvellement automatique
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Annuler
            </Button>
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : isEdit ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
