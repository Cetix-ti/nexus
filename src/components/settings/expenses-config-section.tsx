"use client";

// ============================================================================
// Settings > Allocations & kilométrage
//
// Deux tableaux côte à côte, chacun avec son propre état :
//   1. Allocations mensuelles par agent (cellulaire, internet, etc.).
//      Chaque agent peut avoir N lignes. Visibles pour l'agent dans Mes
//      dépenses, versées indépendamment des dépenses réelles.
//   2. Kilométrage par client : km A/R, facturation activée/désactivée,
//      $/km versés à l'agent qui s'est déplacé.
//
// Les endpoints sont :
//   /api/v1/users/[id]/allowances       (GET, POST, PATCH, DELETE)
//   /api/v1/organizations/[id]/mileage-rate (GET, PUT, DELETE)
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Trash2, Wallet, Car, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}

interface Allowance {
  id: string;
  userId: string;
  label: string;
  amountMonthly: number;
  active: boolean;
}

interface OrgRow {
  id: string;
  name: string;
}

interface MileageRate {
  kmRoundTrip: number;
  billToClient: boolean;
  agentRatePerKm: number;
}

export function ExpensesConfigSection() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-600" />
          Allocations & kilométrage
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Allocations mensuelles versées aux agents (cellulaire, internet, etc.) et barèmes de
          kilométrage pour la facturation des déplacements chez les clients.
        </p>
      </div>

      <AllowancesPanel />
      <MileagePanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 1 — Allocations par agent
// ---------------------------------------------------------------------------
function AllowancesPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/v1/users?active=true")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        const list = (d.data ?? d ?? []) as Agent[];
        // Exclut les clients : l'UI ne gère que les agents internes.
        const agents = list.filter((u: any) => !u.role?.startsWith?.("CLIENT_"));
        setAgents(agents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q)
    );
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">Allocations mensuelles</h2>
        <p className="text-[12.5px] text-slate-500 mt-0.5">
          Sélectionnez un agent pour configurer ses allocations (cellulaire, internet, etc.).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Liste d'agents */}
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un agent..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 text-[12.5px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          {loading ? (
            <div className="p-6 text-center text-[12px] text-slate-400">Chargement…</div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
              {filtered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedAgentId(a.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 transition-colors",
                      selectedAgentId === a.id
                        ? "bg-emerald-50 text-emerald-800"
                        : "hover:bg-slate-50 text-slate-700",
                    )}
                  >
                    <p className="text-[13px] font-medium truncate">
                      {a.firstName} {a.lastName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{a.email}</p>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-[12px] text-slate-400 text-center">
                  Aucun agent.
                </li>
              )}
            </ul>
          )}
        </Card>

        {/* Détail allocations d'un agent */}
        <Card>
          <CardContent className="p-5">
            {selectedAgentId ? (
              <AgentAllowanceEditor
                userId={selectedAgentId}
                agentName={
                  agents.find((a) => a.id === selectedAgentId)
                    ? `${agents.find((a) => a.id === selectedAgentId)!.firstName} ${agents.find((a) => a.id === selectedAgentId)!.lastName}`
                    : ""
                }
              />
            ) : (
              <div className="py-10 text-center text-[13px] text-slate-400">
                Sélectionnez un agent pour gérer ses allocations.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function AgentAllowanceEditor({ userId, agentName }: { userId: string; agentName: string }) {
  const [rows, setRows] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/users/${userId}/allowances`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setRows(d.data ?? []))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function addRow() {
    const amt = Number(amount);
    if (!label.trim() || !Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    await fetch(`/api/v1/users/${userId}/allowances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), amountMonthly: amt }),
    });
    setSaving(false);
    setLabel("");
    setAmount("");
    load();
  }

  async function toggleActive(r: Allowance) {
    await fetch(`/api/v1/users/${userId}/allowances`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    load();
  }

  async function remove(r: Allowance) {
    if (!confirm(`Supprimer l'allocation « ${r.label} » ?`)) return;
    await fetch(`/api/v1/users/${userId}/allowances?allowanceId=${r.id}`, {
      method: "DELETE",
    });
    load();
  }

  const total = rows.filter((r) => r.active).reduce((s, r) => s + r.amountMonthly, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[14px] font-semibold text-slate-900">{agentName}</h3>
        <p className="text-[12px] text-slate-500">
          Total actif :{" "}
          <span className="font-bold text-emerald-700 tabular-nums">
            {total.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
          </span>{" "}
          / mois
        </p>
      </div>

      {loading ? (
        <div className="py-6 text-center text-[12px] text-slate-400">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-slate-400 rounded-lg border border-dashed border-slate-300 bg-slate-50/40">
          Aucune allocation — ajoutez-en une ci-dessous.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className={cn("text-[13px] font-medium truncate", !r.active && "text-slate-400 line-through")}>
                  {r.label}
                </p>
              </div>
              <p className="text-[13px] font-bold tabular-nums text-slate-800 w-24 text-right">
                {r.amountMonthly.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
              </p>
              <button
                type="button"
                onClick={() => toggleActive(r)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 transition-colors",
                  r.active
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200",
                )}
              >
                {r.active ? "Active" : "Inactive"}
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                className="text-slate-300 hover:text-red-500"
                title="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Formulaire ajout */}
      <div className="flex items-end gap-2 flex-wrap rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">Libellé</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Forfait cellulaire"
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="w-28">
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">Montant $/mois</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="75"
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-[13px] text-right tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={addRow}
          disabled={saving || !label.trim() || !amount}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Ajouter
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 2 — Kilométrage (taux global + per-client)
// ---------------------------------------------------------------------------
function MileagePanel() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.data ?? [];
        setOrgs(list.map((o: any) => ({ id: o.id, name: o.name })));
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = orgs.filter((o) =>
    !search.trim() || o.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="space-y-4">
      {/* Taux agent ($/km) global — s'applique à TOUS les clients.
          Remplace l'ancien champ per-client qui variait d'une org à
          l'autre sans raison métier valable. */}
      <GlobalAgentRateCard />

      <div>
        <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
          <Car className="h-4 w-4 text-blue-600" />
          Kilométrage par client
        </h2>
        <p className="text-[12.5px] text-slate-500 mt-0.5">
          Par client : distance A/R depuis Cetix et si le déplacement est facturé
          au client. Le taux $/km versé à l&apos;agent est contrôlé globalement
          ci-dessus.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un client..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 text-[12.5px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          {loading ? (
            <div className="p-6 text-center text-[12px] text-slate-400">Chargement…</div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedOrgId(o.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 transition-colors",
                      selectedOrgId === o.id
                        ? "bg-blue-50 text-blue-800"
                        : "hover:bg-slate-50 text-slate-700",
                    )}
                  >
                    <p className="text-[13px] font-medium truncate">{o.name}</p>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-[12px] text-slate-400 text-center">
                  Aucun client.
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card>
          <CardContent className="p-5">
            {selectedOrgId ? (
              <MileageEditor
                organizationId={selectedOrgId}
                orgName={orgs.find((o) => o.id === selectedOrgId)?.name ?? ""}
              />
            ) : (
              <div className="py-10 text-center text-[13px] text-slate-400">
                Sélectionnez un client pour configurer son kilométrage.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MileageEditor({ organizationId, orgName }: { organizationId: string; orgName: string }) {
  const [rate, setRate] = useState<MileageRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [kmRoundTrip, setKmRoundTrip] = useState("");
  const [billToClient, setBillToClient] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/organizations/${organizationId}/mileage-rate`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const row = d?.data ?? null;
        setRate(row);
        if (row) {
          setKmRoundTrip(String(row.kmRoundTrip));
          setBillToClient(row.billToClient);
        } else {
          setKmRoundTrip("");
          setBillToClient(true);
        }
      })
      .finally(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const km = Number(kmRoundTrip);
    if (!Number.isFinite(km) || km < 0) return;
    setSaving(true);
    setSaved(false);
    // On n'envoie plus agentRatePerKm — contrôlé globalement dans
    // TenantSetting (cf. GlobalAgentRateCard). L'API garde le champ
    // en DB pour compat mais ne sert plus à rien.
    await fetch(`/api/v1/organizations/${organizationId}/mileage-rate`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kmRoundTrip: km,
        billToClient,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  async function remove() {
    if (!confirm(`Supprimer la configuration kilométrage pour ${orgName} ?`)) return;
    await fetch(`/api/v1/organizations/${organizationId}/mileage-rate`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="py-6 text-center text-[12px] text-slate-400">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-slate-900">{orgName}</h3>
        {rate && (
          <button
            type="button"
            onClick={remove}
            className="text-[11.5px] text-slate-400 hover:text-red-500 inline-flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" /> Réinitialiser
          </button>
        )}
      </div>

      <div>
        <Input
          label="Distance A/R (km)"
          type="number"
          min={0}
          step={1}
          value={kmRoundTrip}
          onChange={(e) => setKmRoundTrip(e.target.value)}
          placeholder="Ex: 80"
        />
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
        <input
          type="checkbox"
          checked={billToClient}
          onChange={(e) => setBillToClient(e.target.checked)}
          className="mt-0.5"
        />
        <div>
          <p className="text-[13px] font-medium text-slate-900">Facturer le déplacement au client</p>
          <p className="mt-0.5 text-[11.5px] text-slate-500">
            Si décoché, les déplacements chez ce client ne sont jamais facturés (contrat
            all-inclusive, proximité, etc.). L&apos;agent est quand même remboursé selon le
            taux $/km.
          </p>
        </div>
      </label>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
        <Button variant="primary" size="sm" onClick={save} disabled={saving || !kmRoundTrip}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Enregistrer
        </Button>
        {saved && <span className="text-[12px] text-emerald-600">Enregistré.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlobalAgentRateCard — taux $/km global (s'applique à tous les agents
// et tous les clients). Remplace l'ancien champ per-client. Lit/écrit
// via /api/v1/settings/mileage-rate (TenantSetting).
// ---------------------------------------------------------------------------
function GlobalAgentRateCard() {
  const [rate, setRate] = useState<string>("0.55");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/v1/settings/mileage-rate")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.rate != null) setRate(String(d.rate));
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/v1/settings/mileage-rate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate: n }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-[12px] text-slate-400">
          Chargement du taux global…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Car className="h-4 w-4 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900">
              Taux agent ($/km) — global
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-600 leading-relaxed">
              Taux unique versé à tout agent pour chaque kilomètre parcouru,
              quel que soit le client. Modifier ici met à jour tous les clients
              simultanément.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <div className="w-32">
                <Input
                  label="Taux ($/km)"
                  type="number"
                  min={0}
                  step={0.01}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="0.55"
                />
              </div>
              <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Enregistrer
              </Button>
              {saved && <span className="text-[12px] text-emerald-600 pb-2">Enregistré.</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
