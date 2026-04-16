"use client";

// ============================================================================
// CENTRE DE SÉCURITÉ
//
// Vue unifiée des événements de sécurité provenant de plusieurs sources :
//   - Active Directory (courriels alertes@cetix.ca)
//   - Wazuh (sous-dossier WAZUH de la même boîte)
//   - Bitdefender GravityZone (API directe)
//
// Tabs : AD / Wazuh / Bitdefender / Tous. Chaque tab charge la liste
// depuis /api/v1/security-center/incidents avec son propre filtre source.
// Action principale : convertir un incident en ticket Nexus (utilise
// exactement le même pattern que le kanban des sauvegardes).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  User,
  Laptop,
  Clock,
  RefreshCcw,
  Ticket,
  Building2,
  Shield,
  Bug,
  Zap,
  Maximize2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Incident {
  id: string;
  source: string;
  kind: string;
  severity: string | null;
  organizationId: string | null;
  endpoint: string | null;
  userPrincipal: string | null;
  software: string | null;
  cveId: string | null;
  title: string;
  summary: string | null;
  status: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  ticketId: string | null;
  organization: { id: string; name: string; clientCode: string | null } | null;
  assignee: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  ticket: { id: string; number: number; subject: string; status: string } | null;
  alerts: { id: string; receivedAt: string; severity: string | null; title: string; summary: string | null }[];
}

type TabKey = "ad" | "wazuh" | "bitdefender" | "all";

const TABS: { key: TabKey; label: string; sources: string[]; icon: typeof Shield }[] = [
  { key: "ad", label: "Active Directory", sources: ["ad_email"], icon: Shield },
  { key: "wazuh", label: "Wazuh", sources: ["wazuh_email"], icon: Zap },
  { key: "bitdefender", label: "Bitdefender", sources: ["bitdefender_api"], icon: Bug },
  { key: "all", label: "Tous", sources: [], icon: ShieldAlert },
];

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 ring-red-200",
  high: "bg-orange-100 text-orange-800 ring-orange-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  info: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  investigating: "bg-amber-100 text-amber-800",
  waiting_client: "bg-violet-100 text-violet-800",
  resolved: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-700",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  investigating: "En analyse",
  waiting_client: "Attente client",
  resolved: "Résolu",
  closed: "Fermé",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}

export default function SecurityCenterPage() {
  const [tab, setTab] = useState<TabKey>("ad");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const active = TABS.find((t) => t.key === tab);
      const params = new URLSearchParams();
      if (active?.sources.length === 1) params.set("source", active.sources[0]);
      const res = await fetch(`/api/v1/security-center/incidents?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Incident[];
      setIncidents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const orgs = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of incidents) {
      if (i.organization) map.set(i.organization.id, i.organization.name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [incidents]);

  const filtered = useMemo(() => {
    if (!orgFilter) return incidents;
    return incidents.filter((i) => i.organizationId === orgFilter);
  }, [incidents, orgFilter]);

  // Sous-groupes selon l'onglet
  const adLockouts = filtered.filter((i) => i.kind === "account_lockout");
  const adInactive = filtered.filter((i) => i.kind === "inactive_account");

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/v1/security-center/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  }

  async function convertToTicket(id: string) {
    const res = await fetch(`/api/v1/security-center/incidents/${id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || `Erreur HTTP ${res.status}`);
      return;
    }
    const ticket = await res.json();
    router.push(`/tickets/${ticket.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            Centre de sécurité
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Vue 360 des alertes de sécurité — AD, Wazuh, Bitdefender, …
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCcw className="h-3.5 w-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors flex items-center gap-2",
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtre client */}
      {orgs.length > 0 && (
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Tous les clients</option>
            {orgs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-slate-400">Chargement…</p>
      ) : tab === "ad" ? (
        <div className="space-y-6">
          <Section title="Comptes verrouillés" count={adLockouts.length}>
            {adLockouts.length === 0 ? (
              <Empty msg="Aucun verrouillage de compte AD reçu." />
            ) : (
              <IncidentTable
                incidents={adLockouts}
                expanded={expanded}
                onExpand={toggleExpand}
                onStatus={updateStatus}
                onConvert={convertToTicket}
                primaryCol="userPrincipal"
                primaryLabel="Utilisateur"
                showOccurrences
              />
            )}
          </Section>

          <Section title="Comptes inactifs" count={adInactive.length}>
            {adInactive.length === 0 ? (
              <Empty msg="Aucun compte AD inactif signalé." />
            ) : (
              <InactiveKanban
                incidents={adInactive}
                onStatus={updateStatus}
                onConvert={convertToTicket}
              />
            )}
          </Section>
        </div>
      ) : (
        <IncidentTable
          incidents={filtered}
          expanded={expanded}
          onExpand={toggleExpand}
          onStatus={updateStatus}
          onConvert={convertToTicket}
          primaryCol={tab === "wazuh" ? "endpoint" : "endpoint"}
          primaryLabel="Endpoint"
          showOccurrences
        />
      )}
    </div>
  );
}

// --- Sous-composants --------------------------------------------------

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[14px] font-semibold text-slate-900 mb-2">
        {title}
        {count > 0 && <span className="ml-2 text-[12px] text-slate-400">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center text-[12.5px] text-slate-500">
      {msg}
    </div>
  );
}

function IncidentTable({
  incidents,
  expanded,
  onExpand,
  onStatus,
  onConvert,
  primaryCol,
  primaryLabel,
  showOccurrences,
}: {
  incidents: Incident[];
  expanded: Set<string>;
  onExpand: (id: string) => void;
  onStatus: (id: string, status: string) => void;
  onConvert: (id: string) => void;
  primaryCol: keyof Incident;
  primaryLabel: string;
  showOccurrences?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Sévérité</th>
            <th className="px-4 py-2.5">Client</th>
            <th className="px-4 py-2.5">{primaryLabel}</th>
            <th className="px-4 py-2.5">Titre</th>
            {showOccurrences && <th className="px-3 py-2.5 text-center">#</th>}
            <th className="px-4 py-2.5">Dernière</th>
            <th className="px-4 py-2.5">Statut</th>
            <th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {incidents.map((i) => {
            const primary = (i[primaryCol] as string | null) ?? "—";
            const isOpen = expanded.has(i.id);
            return (
              <>
                <tr
                  key={i.id}
                  className="hover:bg-slate-50/60 cursor-pointer"
                  onClick={() => onExpand(i.id)}
                >
                  <td className="px-4 py-3">
                    {i.severity && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset uppercase",
                          SEVERITY_CLASS[i.severity] ?? "bg-slate-100 text-slate-600 ring-slate-200",
                        )}
                      >
                        {i.severity}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-700">
                    {i.organization?.name ?? <span className="italic text-slate-400">Non mappé</span>}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-slate-800">{primary}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-800 truncate max-w-md">{i.title}</td>
                  {showOccurrences && (
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-slate-100 text-[11.5px] font-semibold text-slate-700 px-1.5">
                        {i.occurrenceCount}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">
                    <Clock className="inline h-3 w-3 mr-1 text-slate-400" />
                    {fmtDate(i.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        STATUS_CLASS[i.status] ?? "bg-slate-100 text-slate-700",
                      )}
                    >
                      {STATUS_LABEL[i.status] ?? i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Lien vers la page détaillée — UX plus confortable
                          pour examiner un incident que l'expand inline. */}
                      <Link
                        href={`/security-center/incidents/${i.id}`}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11.5px] text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        title="Ouvrir la fiche détaillée"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </Link>
                      {i.ticketId ? (
                        <Link
                          href={`/tickets/${i.ticketId}`}
                          className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700"
                        >
                          <Ticket className="h-3 w-3" />
                          Voir le ticket
                        </Link>
                      ) : (
                        <Button size="sm" variant="primary" onClick={() => onConvert(i.id)}>
                          <Ticket className="h-3 w-3" />
                          Créer un ticket
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/40">
                    <td colSpan={showOccurrences ? 8 : 7} className="px-4 py-3">
                      <div className="space-y-2">
                        {i.summary && (
                          <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap">
                            {i.summary.slice(0, 500)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
                          <span>Première : {fmtDate(i.firstSeenAt)}</span>
                          <span>·</span>
                          <span>Dernière : {fmtDate(i.lastSeenAt)}</span>
                          <span>·</span>
                          <span>
                            Statut :{" "}
                            <select
                              value={i.status}
                              onChange={(e) => onStatus(i.id, e.target.value)}
                              className="h-6 rounded border border-slate-200 bg-white px-1 text-[11px]"
                            >
                              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </span>
                        </div>
                        {i.alerts.length > 0 && (
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Historique ({i.alerts.length} notifications affichées)
                            </p>
                            <ul className="text-[11.5px] space-y-0.5 text-slate-600">
                              {i.alerts.map((a) => (
                                <li key={a.id} className="font-mono">
                                  {fmtDate(a.receivedAt)} — {a.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="pt-1 flex items-center gap-3">
                          <Link
                            href={`/security-center/incidents/${i.id}`}
                            className="inline-flex items-center gap-1 text-[11.5px] text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Voir la fiche détaillée
                          </Link>
                          <button
                            onClick={() => onExpand(i.id)}
                            className="text-[11.5px] text-slate-400 hover:text-slate-700"
                          >
                            Fermer
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Kanban dédié aux comptes inactifs --------------------------------
// Colonnes = statuts. Chaque carte = un incident. Simple drag-visuel
// optionnel ; pour l'instant clic sur carte → select status.

function InactiveKanban({
  incidents,
  onStatus,
  onConvert,
}: {
  incidents: Incident[];
  onStatus: (id: string, status: string) => void;
  onConvert: (id: string) => void;
}) {
  const columns = ["open", "investigating", "waiting_client", "resolved"] as const;
  const byStatus = columns.map((c) => ({
    key: c,
    label: STATUS_LABEL[c],
    items: incidents.filter((i) => i.status === c),
  }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {byStatus.map((col) => (
        <div key={col.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
          <div className="px-2 py-1.5 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">
              {col.label}
            </h3>
            <span className="text-[11px] text-slate-400">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.map((i) => (
              <div
                key={i.id}
                className="rounded-md bg-white border border-slate-200 px-3 py-2 shadow-sm space-y-1"
              >
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-slate-400 shrink-0" />
                  <p className="text-[12.5px] font-medium text-slate-900 truncate flex-1">
                    {i.userPrincipal ?? "Compte inconnu"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Laptop className="h-3 w-3 text-slate-400 shrink-0" />
                  <p className="text-[11px] text-slate-500 truncate">
                    {i.organization?.name ?? "Non mappé"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
                  <Clock className="h-2.5 w-2.5" />
                  {fmtDate(i.lastSeenAt)}
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <select
                    value={i.status}
                    onChange={(e) => onStatus(i.id, e.target.value)}
                    className="h-5 flex-1 rounded border border-slate-200 bg-white text-[10.5px] px-1"
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {i.ticketId ? (
                    <Link
                      href={`/tickets/${i.ticketId}`}
                      className="inline-flex h-5 items-center px-1.5 rounded bg-blue-50 text-blue-700 text-[10px]"
                    >
                      <Ticket className="h-2.5 w-2.5" />
                    </Link>
                  ) : (
                    <button
                      onClick={() => onConvert(i.id)}
                      className="inline-flex h-5 items-center gap-1 px-1.5 rounded bg-emerald-50 text-emerald-700 text-[10px] hover:bg-emerald-100"
                    >
                      <Ticket className="h-2.5 w-2.5" />
                      Ticket
                    </button>
                  )}
                </div>
              </div>
            ))}
            {col.items.length === 0 && (
              <p className="text-[11px] text-slate-400 italic px-2 py-2">Vide</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
