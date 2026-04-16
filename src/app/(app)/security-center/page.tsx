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
  Package,
  Maximize2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrgLogo } from "@/components/organizations/org-logo";
import { PersistenceView } from "@/components/security-center/persistence-view";

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
  isLowPriority: boolean;
  organization: { id: string; name: string; clientCode: string | null } | null;
  assignee: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  ticket: { id: string; number: number; subject: string; status: string } | null;
  alerts: { id: string; receivedAt: string; severity: string | null; title: string; summary: string | null }[];
}

type TabKey = "ad" | "wazuh" | "persistence" | "bitdefender" | "all";

const TABS: { key: TabKey; label: string; sources: string[]; icon: typeof Shield }[] = [
  // Wazuh en premier (tab par défaut) — source principale d'alertes CVE,
  // comportement suspect et persistence. Agrège email + API directe.
  { key: "wazuh", label: "Wazuh", sources: ["wazuh_email", "wazuh_api"], icon: Zap },
  { key: "ad", label: "Active Directory", sources: ["ad_email"], icon: Shield },
  // Persistance : logiciels de télé-assistance (AnyDesk/TeamViewer/etc.)
  // détectés par Wazuh syscollector. Kind dédié pour actions whitelist +
  // conversion billable.
  { key: "persistence", label: "Persistance", sources: ["wazuh_email"], icon: Package },
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
  const [tab, setTab] = useState<TabKey>("wazuh");
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
      // On charge les DEUX buckets en parallèle (main + low) pour ne pas
      // re-requêter quand l'utilisateur déplie la section basse priorité.
      const mkParams = (priority: "main" | "low") => {
        const p = new URLSearchParams();
        if (active && active.sources.length > 0) p.set("source", active.sources.join(","));
        p.set("priority", priority);
        return p;
      };
      const [resMain, resLow] = await Promise.all([
        fetch(`/api/v1/security-center/incidents?${mkParams("main").toString()}`),
        fetch(`/api/v1/security-center/incidents?${mkParams("low").toString()}`),
      ]);
      if (!resMain.ok) throw new Error(`HTTP ${resMain.status}`);
      const main = (await resMain.json()) as Incident[];
      const low = resLow.ok ? ((await resLow.json()) as Incident[]) : [];
      setIncidents([...main, ...low]);
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
      ) : tab === "wazuh" ? (
        <WazuhEndpointView
          incidents={filtered}
          expanded={expanded}
          onExpand={toggleExpand}
          onStatus={updateStatus}
          onConvert={convertToTicket}
        />
      ) : tab === "persistence" ? (
        <PersistenceView orgFilter={orgFilter} />
      ) : (
        <IncidentTable
          incidents={filtered}
          expanded={expanded}
          onExpand={toggleExpand}
          onStatus={updateStatus}
          onConvert={convertToTicket}
          primaryCol="endpoint"
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

// --- Wazuh vue agrégée par endpoint ------------------------------------
// Au lieu d'afficher chaque CVE comme une ligne séparée (bruit vite
// ingérable), on agrège par (organisation + endpoint) : une ligne par
// poste, avec compteurs par type (CVE / persistence / autre), expandable
// pour voir chaque incident individuel. Les alertes low-priority sont
// affichées dans une section séparée repliable en bas.
function WazuhEndpointView({
  incidents,
  expanded,
  onExpand,
  onStatus,
  onConvert,
}: {
  incidents: Incident[];
  expanded: Set<string>;
  onExpand: (id: string) => void;
  onStatus: (id: string, status: string) => void;
  onConvert: (id: string) => void;
}) {
  const main = incidents.filter((i) => !i.isLowPriority);
  const low = incidents.filter((i) => i.isLowPriority);
  const [lowOpen, setLowOpen] = useState(false);

  return (
    <div className="space-y-6">
      {main.length === 0 ? (
        <Empty msg="Aucune alerte Wazuh significative." />
      ) : (
        <EndpointRollup
          incidents={main}
          expanded={expanded}
          onExpand={onExpand}
          onStatus={onStatus}
          onConvert={onConvert}
        />
      )}

      {/* Section repliable pour les alertes que l'admin a marquées
          "moins importantes" via les mots-clés configurés. Affichée par
          défaut fermée pour ne pas distraire des vraies alertes. */}
      {low.length > 0 && (
        <div>
          <button
            onClick={() => setLowOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Alertes moins importantes
              </span>
              <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[10.5px] font-semibold text-slate-600">
                {low.length}
              </span>
            </div>
            <span className="text-[11.5px] text-slate-500">
              {lowOpen ? "Masquer" : "Afficher"}
            </span>
          </button>
          {lowOpen && (
            <div className="mt-2 opacity-80">
              <EndpointRollup
                incidents={low}
                expanded={expanded}
                onExpand={onExpand}
                onStatus={onStatus}
                onConvert={onConvert}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Nettoie un hostname Wazuh en retirant le préfixe clientCode (ex:
 * "LV_DG-10" → "DG-10") quand il matche le code d'organisation détecté.
 * Préserve le nom tel quel si aucun préfixe ne correspond.
 */
function cleanEndpoint(hostname: string | null, clientCode?: string | null): string {
  if (!hostname) return "—";
  if (!clientCode) return hostname;
  const prefix = clientCode.toUpperCase();
  const rx = new RegExp(`^${prefix}[-_]`, "i");
  return hostname.replace(rx, "");
}

interface EndpointGroup {
  key: string;
  organization: Incident["organization"];
  endpoint: string;
  cleanEndpoint: string;
  incidents: Incident[];
  severities: Record<string, number>;
  kindCounts: Record<string, number>;
  maxSeverity: string | null;
  anyStatus: Set<string>;
  lastSeen: string;
}

function groupByEndpoint(incidents: Incident[]): EndpointGroup[] {
  const severityRank: Record<string, number> = { info: 0, warning: 1, high: 2, critical: 3 };
  const map = new Map<string, EndpointGroup>();
  for (const i of incidents) {
    const endpoint = i.endpoint ?? "—";
    const orgKey = i.organization?.id ?? "no-org";
    const key = `${orgKey}::${endpoint.toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        organization: i.organization,
        endpoint,
        cleanEndpoint: cleanEndpoint(endpoint, i.organization?.clientCode ?? null),
        incidents: [],
        severities: {},
        kindCounts: {},
        maxSeverity: null,
        anyStatus: new Set(),
        lastSeen: i.lastSeenAt,
      };
      map.set(key, g);
    }
    g.incidents.push(i);
    g.kindCounts[i.kind] = (g.kindCounts[i.kind] ?? 0) + 1;
    if (i.severity) {
      g.severities[i.severity] = (g.severities[i.severity] ?? 0) + 1;
      if (
        !g.maxSeverity ||
        (severityRank[i.severity] ?? 0) > (severityRank[g.maxSeverity] ?? 0)
      ) {
        g.maxSeverity = i.severity;
      }
    }
    g.anyStatus.add(i.status);
    if (i.lastSeenAt > g.lastSeen) g.lastSeen = i.lastSeenAt;
  }
  // Tri : critical/high d'abord, puis lastSeen décroissant
  return Array.from(map.values()).sort((a, b) => {
    const rA = severityRank[a.maxSeverity ?? "info"] ?? 0;
    const rB = severityRank[b.maxSeverity ?? "info"] ?? 0;
    if (rA !== rB) return rB - rA;
    return b.lastSeen.localeCompare(a.lastSeen);
  });
}

const KIND_LABEL: Record<string, string> = {
  cve: "CVE",
  persistence_tool: "Logiciel persistance",
  suspicious_behavior: "Comportement suspect",
  malware: "Malware",
  ransomware: "Rançongiciel",
  critical_incident: "Incident critique",
};

function EndpointRollup({
  incidents,
  expanded,
  onExpand,
  onStatus,
  onConvert,
}: {
  incidents: Incident[];
  expanded: Set<string>;
  onExpand: (id: string) => void;
  onStatus: (id: string, status: string) => void;
  onConvert: (id: string) => void;
}) {
  const groups = useMemo(() => groupByEndpoint(incidents), [incidents]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [busyEndpoint, setBusyEndpoint] = useState<string | null>(null);
  const router = useRouter();

  async function createEndpointTicket(g: EndpointGroup) {
    if (!g.organization) {
      alert("Impossible — l'endpoint n'est pas mappé à une organisation.");
      return;
    }
    // Si TOUS les incidents ont déjà le même ticket, on redirige direct.
    const existingTickets = new Set(
      g.incidents.map((i) => i.ticketId).filter((t): t is string => !!t),
    );
    if (
      existingTickets.size === 1 &&
      g.incidents.every((i) => i.ticketId === [...existingTickets][0])
    ) {
      router.push(`/tickets/${[...existingTickets][0]}`);
      return;
    }
    setBusyEndpoint(g.key);
    try {
      const res = await fetch("/api/v1/security-center/endpoint-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: g.organization.id,
          endpoint: g.endpoint,
          incidentIds: g.incidents.map((i) => i.id),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Erreur HTTP ${res.status}`);
        return;
      }
      const t = await res.json();
      router.push(`/tickets/${t.id}`);
    } finally {
      setBusyEndpoint(null);
    }
  }

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5 w-10"></th>
            <th className="px-4 py-2.5">Client</th>
            <th className="px-4 py-2.5">Endpoint</th>
            <th className="px-4 py-2.5">Alertes</th>
            <th className="px-4 py-2.5">Sévérité max</th>
            <th className="px-4 py-2.5">Dernière</th>
            <th className="px-4 py-2.5 w-40">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g) => {
            const open = openGroups.has(g.key);
            return (
              <>
                <tr
                  key={g.key}
                  className="hover:bg-slate-50/60 cursor-pointer"
                  onClick={() => toggleGroup(g.key)}
                >
                  <td className="px-4 py-3 text-slate-400">
                    <span className={cn("inline-block transition-transform", open && "rotate-90")}>
                      ▸
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-700">
                    {g.organization ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <OrgLogo name={g.organization.name} size={22} rounded="sm" />
                        <span className="truncate">{g.organization.name}</span>
                      </div>
                    ) : (
                      <span className="italic text-slate-400">Non mappé</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-slate-800">
                    {g.cleanEndpoint}
                    {g.cleanEndpoint !== g.endpoint && (
                      <span className="ml-1.5 text-[10.5px] text-slate-400" title={`Nom Wazuh : ${g.endpoint}`}>
                        ↳ {g.endpoint}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(g.kindCounts).map(([kind, count]) => (
                        <span
                          key={kind}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"
                        >
                          {count} {KIND_LABEL[kind] ?? kind}
                          {count > 1 ? "s" : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {g.maxSeverity && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset uppercase",
                          SEVERITY_CLASS[g.maxSeverity] ?? "bg-slate-100 text-slate-600 ring-slate-200",
                        )}
                      >
                        {g.maxSeverity}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">
                    <Clock className="inline h-3 w-3 mr-1 text-slate-400" />
                    {fmtDate(g.lastSeen)}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const ticketed = g.incidents.filter((i) => i.ticketId);
                      const allSame =
                        ticketed.length === g.incidents.length &&
                        new Set(ticketed.map((i) => i.ticketId)).size === 1;
                      if (allSame && ticketed[0]?.ticketId) {
                        return (
                          <Link
                            href={`/tickets/${ticketed[0].ticketId}`}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                          >
                            <Ticket className="h-3 w-3" />
                            Ouvrir ticket
                          </Link>
                        );
                      }
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyEndpoint === g.key || !g.organization}
                          onClick={() => createEndpointTicket(g)}
                        >
                          <Ticket className="h-3 w-3" />
                          {busyEndpoint === g.key ? "Création…" : "Ticket endpoint"}
                        </Button>
                      );
                    })()}
                  </td>
                </tr>
                {open && (
                  <tr className="bg-slate-50/30">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="space-y-2 pl-6 border-l-2 border-slate-200">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                          {g.incidents.length} incident{g.incidents.length > 1 ? "s" : ""} sur ce poste
                        </p>
                        {g.incidents.map((i) => {
                          const isOpen = expanded.has(i.id);
                          return (
                            <div
                              key={i.id}
                              className="rounded-md border border-slate-200 bg-white"
                            >
                              <div
                                className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50/80 cursor-pointer"
                                onClick={() => onExpand(i.id)}
                              >
                                {i.severity && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset uppercase shrink-0",
                                      SEVERITY_CLASS[i.severity] ?? "bg-slate-100 text-slate-600 ring-slate-200",
                                    )}
                                  >
                                    {i.severity}
                                  </span>
                                )}
                                <span className="text-[11.5px] font-mono text-slate-500 shrink-0">
                                  {i.cveId ?? KIND_LABEL[i.kind] ?? i.kind}
                                </span>
                                <span className="text-[12.5px] text-slate-800 truncate flex-1">
                                  {i.title}
                                </span>
                                {i.occurrenceCount > 1 && (
                                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-semibold text-slate-700 px-1.5 shrink-0">
                                    ×{i.occurrenceCount}
                                  </span>
                                )}
                                <span className="text-[10.5px] text-slate-400 shrink-0 whitespace-nowrap">
                                  {fmtDate(i.lastSeenAt)}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0",
                                    STATUS_CLASS[i.status] ?? "bg-slate-100 text-slate-700",
                                  )}
                                >
                                  {STATUS_LABEL[i.status] ?? i.status}
                                </span>
                              </div>
                              {isOpen && (
                                <div
                                  className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 space-y-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {i.summary && (
                                    <p className="text-[11.5px] text-slate-700 whitespace-pre-wrap">
                                      {i.summary.slice(0, 600)}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                    <span>Statut :</span>
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
                                    <Link
                                      href={`/security-center/incidents/${i.id}`}
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 ml-2"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Fiche détaillée
                                    </Link>
                                    {i.ticketId ? (
                                      <Link
                                        href={`/tickets/${i.ticketId}`}
                                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 ml-2"
                                      >
                                        <Ticket className="h-3 w-3" />
                                        Voir le ticket
                                      </Link>
                                    ) : (
                                      <button
                                        onClick={() => onConvert(i.id)}
                                        className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 ml-2"
                                      >
                                        <Ticket className="h-3 w-3" />
                                        Créer un ticket
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
                    {i.organization ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <OrgLogo name={i.organization.name} size={22} rounded="sm" />
                        <span className="truncate">{i.organization.name}</span>
                      </div>
                    ) : (
                      <span className="italic text-slate-400">Non mappé</span>
                    )}
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
                  {i.organization ? (
                    <OrgLogo name={i.organization.name} size={14} rounded="sm" />
                  ) : (
                    <Laptop className="h-3 w-3 text-slate-400 shrink-0" />
                  )}
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
