"use client";

// ============================================================================
// PERSISTENCE VIEW — sous-onglet du Centre de sécurité
//
// Liste les incidents `persistence_tool` avec actions dédiées :
//   - Créer un ticket facturable     (endpoint /convert existant)
//   - Ajouter à la whitelist         (endpoint /persistence-alerts/:id/whitelist)
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  Package,
  ShieldOff,
  Ticket as TicketIcon,
  ShieldCheck,
  Clock,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgLogo } from "@/components/organizations/org-logo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Alert {
  id: string;
  severity: string | null;
  receivedAt: string;
  title: string;
  summary: string | null;
}

interface Incident {
  id: string;
  source: string;
  kind: string;
  severity: string | null;
  organizationId: string | null;
  endpoint: string | null;
  software: string | null;
  title: string;
  summary: string | null;
  status: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  ticketId: string | null;
  isLowPriority: boolean;
  organization: { id: string; name: string; clientCode: string | null } | null;
  ticket: { id: string; number: number; subject: string; status: string } | null;
  alerts: Alert[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 ring-red-200",
  high: "bg-orange-100 text-orange-800 ring-orange-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  info: "bg-slate-100 text-slate-600 ring-slate-200",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critique",
  high: "Élevée",
  warning: "Moyenne",
  info: "Info",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

type WhitelistFilter = "all" | "main" | "whitelisted";

const FILTER_STORAGE_KEY = "persistence-view:whitelist-filter";

export function PersistenceView({ orgFilter }: { orgFilter: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whitelistFor, setWhitelistFor] = useState<Incident | null>(null);
  // Filtre whitelist — persisté dans localStorage pour que le choix de
  // l'utilisateur reste entre navigations.
  const [filter, setFilter] = useState<WhitelistFilter>(() => {
    if (typeof window === "undefined") return "main";
    const v = window.localStorage.getItem(FILTER_STORAGE_KEY);
    return v === "all" || v === "main" || v === "whitelisted" ? v : "main";
  });
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FILTER_STORAGE_KEY, filter);
    }
  }, [filter]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        kind: "persistence_tool",
        priority: "all", // affiche les whitelistées aussi
      });
      const res = await fetch(`/api/v1/security-center/incidents?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Incident[];
      setIncidents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!orgFilter) return incidents;
    return incidents.filter((i) => i.organizationId === orgFilter);
  }, [incidents, orgFilter]);

  const allMain = filtered.filter((i) => !i.isLowPriority);
  const allLow = filtered.filter((i) => i.isLowPriority);
  const mainList = filter === "whitelisted" ? [] : allMain;
  const lowList = filter === "main" ? [] : allLow;

  async function convertToTicket(id: string) {
    const res = await fetch(`/api/v1/security-center/incidents/${id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || `HTTP ${res.status}`);
      return;
    }
    const ticket = await res.json();
    router.push(`/tickets/${ticket.id}`);
  }

  if (loading) return <p className="text-[13px] text-slate-400">Chargement…</p>;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtre whitelist */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] text-slate-400 mr-1">Afficher :</span>
        {(
          [
            { k: "main", label: "Non autorisées", count: allMain.length },
            { k: "whitelisted", label: "Whitelistées", count: allLow.length },
            { k: "all", label: "Toutes", count: allMain.length + allLow.length },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => setFilter(o.k)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors ${
              filter === o.k
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {o.label}
            <span
              className={`ml-1.5 text-[10.5px] ${
                filter === o.k ? "text-blue-100" : "text-slate-400"
              }`}
            >
              {o.count}
            </span>
          </button>
        ))}
      </div>

      {filter !== "whitelisted" && (
        <Group
          title="Détections non autorisées"
          count={mainList.length}
          items={mainList}
          emptyMsg="Aucune détection non autorisée."
          onConvert={convertToTicket}
          onWhitelist={setWhitelistFor}
        />
      )}

      {filter !== "main" && lowList.length > 0 && (
        <Group
          title="Détections whitelistées / moins critiques"
          count={lowList.length}
          items={lowList}
          emptyMsg=""
          onConvert={convertToTicket}
          onWhitelist={setWhitelistFor}
          isLowBlock={filter === "all"}
        />
      )}

      {whitelistFor && (
        <WhitelistModal
          incident={whitelistFor}
          onClose={() => setWhitelistFor(null)}
          onDone={() => {
            setWhitelistFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

function Group({
  title,
  count,
  items,
  emptyMsg,
  onConvert,
  onWhitelist,
  isLowBlock,
}: {
  title: string;
  count: number;
  items: Incident[];
  emptyMsg: string;
  onConvert: (id: string) => void;
  onWhitelist: (i: Incident) => void;
  isLowBlock?: boolean;
}) {
  const [open, setOpen] = useState(!isLowBlock);
  if (items.length === 0 && !emptyMsg) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left mb-2"
      >
        <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
        {count > 0 && <span className="text-[12px] text-slate-400">({count})</span>}
        <span className="ml-auto text-[11.5px] text-slate-400">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <>
          {items.length === 0 ? (
            <p className="text-[12.5px] text-slate-400 italic">{emptyMsg}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-[12.5px] min-w-[640px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Client</th>
                    <th className="px-3 py-2 font-medium">Poste</th>
                    <th className="px-3 py-2 font-medium">Logiciel</th>
                    <th className="px-3 py-2 font-medium">Sévérité</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">Dernière</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((i) => (
                    <IncidentRow
                      key={i.id}
                      incident={i}
                      onConvert={onConvert}
                      onWhitelist={onWhitelist}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function IncidentRow({
  incident,
  onConvert,
  onWhitelist,
}: {
  incident: Incident;
  onConvert: (id: string) => void;
  onWhitelist: (i: Incident) => void;
}) {
  const sev = incident.severity || "info";
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-3 py-2">
        {incident.organization ? (
          <div className="flex items-center gap-2">
            <OrgLogo name={incident.organization.name} size={20} />
            <span className="text-slate-800">{incident.organization.name}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Building2 className="h-3 w-3" />
            Non associé
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1 font-mono text-slate-700">
          <Monitor className="h-3.5 w-3.5 text-slate-400" />
          {incident.endpoint || "—"}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
          <Package className="h-3.5 w-3.5 text-violet-500" />
          {incident.software || "—"}
        </span>
        {incident.occurrenceCount > 1 && (
          <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600">
            ×{incident.occurrenceCount}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${
            SEVERITY_CLASS[sev] ?? SEVERITY_CLASS.info
          }`}
        >
          {SEVERITY_LABEL[sev] ?? sev}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-400" />
          {fmtDate(incident.lastSeenAt)}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {incident.ticket ? (
            <a
              href={`/tickets/${incident.ticket.id}`}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11.5px] font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
            >
              <TicketIcon className="h-3 w-3" />#{incident.ticket.number}
            </a>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onConvert(incident.id)}>
              <TicketIcon className="h-3 w-3" />
              Créer ticket
            </Button>
          )}
          {!incident.isLowPriority && (
            <Button size="sm" variant="outline" onClick={() => onWhitelist(incident)}>
              <ShieldCheck className="h-3 w-3" />
              Whitelist
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Whitelist modal — picks scope, sends to POST .../whitelist
// ---------------------------------------------------------------------------

function WhitelistModal({
  incident,
  onClose,
  onDone,
}: {
  incident: Incident;
  onClose: () => void;
  onDone: () => void;
}) {
  const [scope, setScope] = useState<"host" | "client" | "default">(
    incident.organizationId ? "client" : "default",
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    // On passe par la dernière alerte de l'incident — endpoint attend un alertId
    const alertId = incident.alerts[0]?.id;
    if (!alertId) {
      setError("Aucune alerte trouvée pour cet incident");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/security-center/persistence-alerts/${alertId}/whitelist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, notes: notes.trim() || null }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Ajouter à la whitelist
          </h3>
          <p className="mt-1 text-[12px] text-slate-500">
            <strong>{incident.software}</strong> sur{" "}
            <span className="font-mono">{incident.endpoint}</span>
            {incident.organization ? ` (${incident.organization.name})` : ""}
          </p>
        </header>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
              Portée
            </label>
            <div className="space-y-2">
              {incident.endpoint && incident.organizationId && (
                <ScopeOption
                  checked={scope === "host"}
                  onChange={() => setScope("host")}
                  title="Uniquement ce poste"
                  sub={`${incident.software} autorisé sur ${incident.endpoint}`}
                />
              )}
              {incident.organizationId && (
                <ScopeOption
                  checked={scope === "client"}
                  onChange={() => setScope("client")}
                  title={`Tous les postes de ${incident.organization?.name ?? "ce client"}`}
                  sub={`${incident.software} autorisé chez ce client`}
                />
              )}
              <ScopeOption
                checked={scope === "default"}
                onChange={() => setScope("default")}
                title="Tous les clients (global)"
                sub={`${incident.software} autorisé partout`}
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
              Note (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ex: Outil support approuvé par le client"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-[12.5px] text-red-600">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Ajout…" : "Ajouter à la whitelist"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function ScopeOption({
  checked,
  onChange,
  title,
  sub,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  sub: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
        checked ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <div>
        <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        <div className="text-[11.5px] text-slate-500">{sub}</div>
      </div>
    </label>
  );
}
