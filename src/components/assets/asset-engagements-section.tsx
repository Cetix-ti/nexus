"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, Calendar, Repeat, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Warranty {
  id: string; vendor: string | null; reference: string | null;
  startDate: string; endDate: string; coverageLevel: string; notes: string | null;
}
interface Subscription {
  id: string; vendor: string | null; plan: string | null; reference: string | null;
  startDate: string; endDate: string; autoRenew: boolean; billingCycle: string;
  amount: number | null; currency: string; renewalNotes: string | null;
}
interface SupportContract {
  id: string; vendor: string | null; tier: string;
  startDate: string; endDate: string; contactInfo: unknown; notes: string | null;
}

const COVERAGE_LABELS: Record<string, string> = {
  BASIC: "Basique", ADVANCED: "Avancée", NBD: "Next Business Day", FOUR_HOUR: "4h", CUSTOM: "Personnalisée",
};
const TIER_LABELS: Record<string, string> = {
  L1: "Niveau 1", L2: "Niveau 2", L3: "Niveau 3", TWENTY_FOUR_SEVEN: "24/7", BUSINESS_HOURS: "Heures ouvrables", CUSTOM: "Personnalisé",
};
const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "Mensuel", QUARTERLY: "Trimestriel", YEARLY: "Annuel", MULTIYEAR: "Pluriannuel", ONE_TIME: "Paiement unique", OTHER: "Autre",
};

function daysUntil(d: string) { return Math.floor((new Date(d).getTime() - Date.now()) / 86400_000); }
function urgencyColor(days: number) {
  if (days < 0)  return "bg-slate-100 text-slate-600 ring-slate-200";
  if (days < 15) return "bg-red-50 text-red-700 ring-red-200";
  if (days < 60) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

export function AssetEngagementsSection({ assetId }: { assetId: string }) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [supportContracts, setSupportContracts] = useState<SupportContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"warranties" | "subscriptions" | "support">("warranties");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [rW, rS, rC] = await Promise.all([
      fetch(`/api/v1/asset-warranties?assetId=${assetId}`),
      fetch(`/api/v1/asset-subscriptions?assetId=${assetId}`),
      fetch(`/api/v1/asset-support-contracts?assetId=${assetId}`),
    ]);
    if (rW.ok) setWarranties(await rW.json());
    if (rS.ok) setSubscriptions(await rS.json());
    if (rC.ok) setSupportContracts(await rC.json());
    setLoading(false);
  }, [assetId]);
  useEffect(() => { void load(); }, [load]);

  async function remove(type: "warranty" | "subscription" | "support", id: string) {
    if (!confirm("Supprimer ?")) return;
    const url = type === "warranty" ? `/api/v1/asset-warranties/${id}`
             : type === "subscription" ? `/api/v1/asset-subscriptions/${id}`
             : `/api/v1/asset-support-contracts/${id}`;
    const r = await fetch(url, { method: "DELETE" });
    if (r.ok) await load();
  }

  if (loading) return <Card><div className="p-6 text-[12.5px] text-slate-500">Chargement…</div></Card>;

  return (
    <Card>
      <div className="p-4 sm:p-5 space-y-4">
        {/* Sub-tabs : scrollable horizontal sur mobile */}
        <div className="flex items-center gap-1 border-b border-slate-200 -mx-4 sm:-mx-5 px-4 sm:px-5 overflow-x-auto">
          {[
            { k: "warranties" as const, label: "Garanties", icon: Shield, count: warranties.length },
            { k: "subscriptions" as const, label: "Abonnements", icon: Repeat, count: subscriptions.length },
            { k: "support" as const, label: "Contrats de support", icon: Calendar, count: supportContracts.length },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.k} onClick={() => { setTab(t.k); setAdding(false); }}
                className={`px-3 py-2 text-[12.5px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  tab === t.k ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                <Icon className="h-3.5 w-3.5" />
                {t.label} <span className="text-slate-400">({t.count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} className="gap-1.5">
            {adding ? <><X className="h-3.5 w-3.5" /> Annuler</> : <><Plus className="h-3.5 w-3.5" /> Ajouter</>}
          </Button>
        </div>

        {adding && tab === "warranties" && <WarrantyForm assetId={assetId} onDone={async () => { setAdding(false); await load(); }} />}
        {adding && tab === "subscriptions" && <SubscriptionForm assetId={assetId} onDone={async () => { setAdding(false); await load(); }} />}
        {adding && tab === "support" && <SupportForm assetId={assetId} onDone={async () => { setAdding(false); await load(); }} />}

        {tab === "warranties" && <WarrantiesList items={warranties} onRemove={(id) => remove("warranty", id)} />}
        {tab === "subscriptions" && <SubscriptionsList items={subscriptions} onRemove={(id) => remove("subscription", id)} />}
        {tab === "support" && <SupportList items={supportContracts} onRemove={(id) => remove("support", id)} />}
      </div>
    </Card>
  );
}

// ---------- Listes ----------

function WarrantiesList({ items, onRemove }: { items: Warranty[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return <p className="text-[12.5px] text-slate-500">Aucune garantie enregistrée.</p>;
  return (
    <div className="space-y-2">
      {items.map((w) => {
        const days = daysUntil(w.endDate);
        return (
          <div key={w.id} className="rounded-md border border-slate-200 p-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Shield className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-[13px] font-medium text-slate-900">{w.vendor ?? "Garantie"}</span>
                <span className="text-[11px] text-slate-500">· {COVERAGE_LABELS[w.coverageLevel]}</span>
              </div>
              {w.reference && <p className="text-[11.5px] text-slate-500 mt-0.5 truncate">Ref : {w.reference}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${urgencyColor(days)}`}>
                  {days < 0 ? "Expirée" : days < 1 ? "Aujourd'hui" : `Dans ${days} j`}
                </span>
                <span className="text-[11px] text-slate-500">{fmtDate(w.startDate)} → {fmtDate(w.endDate)}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={() => onRemove(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        );
      })}
    </div>
  );
}

function SubscriptionsList({ items, onRemove }: { items: Subscription[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return <p className="text-[12.5px] text-slate-500">Aucun abonnement enregistré.</p>;
  return (
    <div className="space-y-2">
      {items.map((s) => {
        const days = daysUntil(s.endDate);
        return (
          <div key={s.id} className="rounded-md border border-slate-200 p-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Repeat className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <span className="text-[13px] font-medium text-slate-900">{s.vendor ?? s.plan ?? "Abonnement"}</span>
                <span className="text-[11px] text-slate-500">· {CYCLE_LABELS[s.billingCycle]}</span>
                {s.autoRenew && <span className="text-[10px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded px-1.5 py-0.5">Auto</span>}
              </div>
              {s.plan && s.vendor && <p className="text-[11.5px] text-slate-500 mt-0.5 truncate">{s.plan}</p>}
              {s.amount !== null && <p className="text-[11.5px] text-slate-500">{s.amount} {s.currency}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${urgencyColor(days)}`}>
                  {days < 0 ? "Expiré" : `Dans ${days} j`}
                </span>
                <span className="text-[11px] text-slate-500">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={() => onRemove(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        );
      })}
    </div>
  );
}

function SupportList({ items, onRemove }: { items: SupportContract[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return <p className="text-[12.5px] text-slate-500">Aucun contrat de support.</p>;
  return (
    <div className="space-y-2">
      {items.map((c) => {
        const days = daysUntil(c.endDate);
        return (
          <div key={c.id} className="rounded-md border border-slate-200 p-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-[13px] font-medium text-slate-900">{c.vendor ?? "Contrat de support"}</span>
                <span className="text-[11px] text-slate-500">· {TIER_LABELS[c.tier]}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${urgencyColor(days)}`}>
                  {days < 0 ? "Expiré" : `Dans ${days} j`}
                </span>
                <span className="text-[11px] text-slate-500">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</span>
              </div>
              {c.notes && <p className="mt-1 text-[11.5px] text-slate-600 whitespace-pre-wrap">{c.notes}</p>}
            </div>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={() => onRemove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Formulaires inline ----------

function WarrantyForm({ assetId, onDone }: { assetId: string; onDone: () => Promise<void> }) {
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [coverageLevel, setCoverageLevel] = useState("BASIC");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!endDate) { setError("Date de fin requise."); return; }
    setSaving(true);
    const r = await fetch(`/api/v1/asset-warranties`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, vendor: vendor || null, reference: reference || null, coverageLevel, startDate, endDate, notes: notes || null }),
    });
    setSaving(false);
    if (!r.ok) { const err = await r.json().catch(() => ({})); setError(err.error ?? "Erreur"); return; }
    await onDone();
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      {error && <div className="rounded bg-red-50 text-red-700 text-[12px] px-2 py-1 ring-1 ring-red-200">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Fournisseur (ex : Fortinet)" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <Input placeholder="Référence (ex : FC-10-XXXX)" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={coverageLevel} onChange={(e) => setCoverageLevel(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="BASIC">Basique</option>
          <option value="ADVANCED">Avancée</option>
          <option value="NBD">Next Business Day</option>
          <option value="FOUR_HOUR">4h sur site</option>
          <option value="CUSTOM">Personnalisée</option>
        </select>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optionnelles)" />
      <div className="flex justify-end">
        <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer la garantie"}</Button>
      </div>
    </form>
  );
}

function SubscriptionForm({ assetId, onDone }: { assetId: string; onDone: () => Promise<void> }) {
  const [vendor, setVendor] = useState("");
  const [plan, setPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("YEARLY");
  const [autoRenew, setAutoRenew] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!endDate) { setError("Date de fin requise."); return; }
    setSaving(true);
    const assetRes = await fetch(`/api/v1/assets/${assetId}`);
    const asset = assetRes.ok ? await assetRes.json() : null;
    const organizationId = asset?.organizationId ?? asset?.organization?.id;
    if (!organizationId) { setError("Org introuvable pour l'actif."); setSaving(false); return; }
    const r = await fetch(`/api/v1/asset-subscriptions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId, organizationId, vendor: vendor || null, plan: plan || null, billingCycle, autoRenew,
        amount: amount ? Number(amount) : null, currency, startDate, endDate, notes: notes || null,
      }),
    });
    setSaving(false);
    if (!r.ok) { const err = await r.json().catch(() => ({})); setError(err.error ?? "Erreur"); return; }
    await onDone();
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      {error && <div className="rounded bg-red-50 text-red-700 text-[12px] px-2 py-1 ring-1 ring-red-200">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Fournisseur" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <Input placeholder="Plan / produit" value={plan} onChange={(e) => setPlan(e.target.value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] sm:col-span-2">
          <option value="MONTHLY">Mensuel</option>
          <option value="QUARTERLY">Trimestriel</option>
          <option value="YEARLY">Annuel</option>
          <option value="MULTIYEAR">Pluriannuel</option>
          <option value="ONE_TIME">Paiement unique</option>
          <option value="OTHER">Autre</option>
        </select>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant" />
        <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="CAD" maxLength={3} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
        Auto-renouvellement activé
      </label>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes de renouvellement (optionnelles)" />
      <div className="flex justify-end">
        <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer l'abonnement"}</Button>
      </div>
    </form>
  );
}

function SupportForm({ assetId, onDone }: { assetId: string; onDone: () => Promise<void> }) {
  const [vendor, setVendor] = useState("");
  const [tier, setTier] = useState("L1");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!endDate) { setError("Date de fin requise."); return; }
    setSaving(true);
    const r = await fetch(`/api/v1/asset-support-contracts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, vendor: vendor || null, tier, startDate, endDate, notes: notes || null }),
    });
    setSaving(false);
    if (!r.ok) { const err = await r.json().catch(() => ({})); setError(err.error ?? "Erreur"); return; }
    await onDone();
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      {error && <div className="rounded bg-red-50 text-red-700 text-[12px] px-2 py-1 ring-1 ring-red-200">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Fournisseur du support" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="L1">Niveau 1</option>
          <option value="L2">Niveau 2</option>
          <option value="L3">Niveau 3</option>
          <option value="TWENTY_FOUR_SEVEN">24/7</option>
          <option value="BUSINESS_HOURS">Heures ouvrables</option>
          <option value="CUSTOM">Personnalisé</option>
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Contacts, procédure d'escalade, etc." />
      <div className="flex justify-end">
        <Button size="sm" type="submit" disabled={saving}>{saving ? "Création…" : "Créer le contrat"}</Button>
      </div>
    </form>
  );
}
