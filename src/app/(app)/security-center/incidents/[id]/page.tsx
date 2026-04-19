"use client";

// ============================================================================
// Vue détaillée d'un incident de sécurité.
//
// Bouton "Retour" qui ramène vers /security-center (avec fallback router.back
// si on est arrivé via un deep link externe).
//
// Affiche :
//   - métadonnées (source, kind, sévérité, org, endpoint, user, soft, CVE)
//   - statut éditable inline
//   - historique complet des alertes (toutes, pas juste 20)
//   - payload brut repliable (debug / IR)
//   - bouton "Créer un ticket" si pas déjà converti
// ============================================================================

import { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useIncidentQuery,
  securityKeys,
} from "@/hooks/use-security-incidents";
import {
  ArrowLeft,
  ShieldAlert,
  Clock,
  Ticket,
  User,
  Laptop,
  Building2,
  Bug,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrgLogo } from "@/components/organizations/org-logo";
import { AiIncidentPanel } from "@/components/security-center/ai-incident-panel";

interface AlertRow {
  id: string;
  receivedAt: string;
  severity: string | null;
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
  metadata: Record<string, unknown> | null;
  organization: { id: string; name: string; clientCode: string | null } | null;
  assignee: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  ticket: { id: string; number: number; subject: string; status: string } | null;
  alerts: AlertRow[];
}

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
const SOURCE_LABEL: Record<string, string> = {
  ad_email: "Active Directory",
  wazuh_email: "Wazuh",
  bitdefender_api: "Bitdefender",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [showRaw, setShowRaw] = useState(false);
  const qc = useQueryClient();

  // useIncidentQuery sert la donnée depuis le cache des listes s'il s'y
  // trouve (initialData) → navigation instantanée depuis le rollup. Le
  // refetch arrière-plan ramène l'historique complet des alertes via le
  // nouvel endpoint /incidents/[id].
  const query = useIncidentQuery(id);
  const incident = query.data as Incident | undefined;
  const loading = query.isPending;
  const error =
    query.error instanceof Error
      ? query.error.message
      : !loading && !incident
        ? "Incident introuvable"
        : null;

  const load = () => {
    qc.invalidateQueries({ queryKey: securityKeys.all });
  };

  async function updateStatus(next: string) {
    if (!incident) return;
    const res = await fetch(`/api/v1/security-center/incidents/${incident.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) load();
  }

  async function convertToTicket() {
    if (!incident) return;
    const res = await fetch(`/api/v1/security-center/incidents/${incident.id}/convert`, {
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

  function goBack() {
    // Si l'utilisateur est arrivé via un deep link externe, router.back()
    // renvoie n'importe où. On lui offre un fallback explicite vers la liste.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/security-center");
    }
  }

  return (
    <div className="space-y-5">
      {/* Barre de navigation — bouton retour + lien de secours vers la liste */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={goBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Button>
        <Link
          href="/security-center"
          className="text-[12px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
        >
          Centre de sécurité
        </Link>
      </div>

      {loading ? (
        <p className="text-[13px] text-slate-400">Chargement…</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      ) : !incident ? null : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600 ring-1 ring-red-200/60 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>{SOURCE_LABEL[incident.source] ?? incident.source}</span>
                  <span>·</span>
                  <span>{incident.kind}</span>
                </div>
                <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {incident.title}
                </h1>
                <p className="mt-1 text-[12px] text-slate-500">
                  {incident.occurrenceCount} notification{incident.occurrenceCount > 1 ? "s" : ""} reçue
                  {incident.occurrenceCount > 1 ? "s" : ""} · première {fmtDate(incident.firstSeenAt)} ·
                  dernière {fmtDate(incident.lastSeenAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCcw className="h-3.5 w-3.5" />
                Actualiser
              </Button>
              {incident.ticketId ? (
                <Link
                  href={`/tickets/${incident.ticketId}`}
                  className="inline-flex items-center gap-1.5 h-8 rounded-md bg-blue-50 text-blue-700 text-[12.5px] font-medium px-3 ring-1 ring-blue-200 hover:bg-blue-100"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  Voir le ticket
                </Link>
              ) : (
                <Button variant="primary" size="sm" onClick={convertToTicket}>
                  <Ticket className="h-3.5 w-3.5" />
                  Créer un ticket
                </Button>
              )}
            </div>
          </div>

          {/* Badges statut / sévérité */}
          <div className="flex flex-wrap items-center gap-2">
            {incident.severity && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset uppercase",
                  SEVERITY_CLASS[incident.severity] ?? "bg-slate-100 text-slate-600 ring-slate-200",
                )}
              >
                {incident.severity}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] text-slate-500">Statut :</span>
              <select
                value={incident.status}
                onChange={(e) => updateStatus(e.target.value)}
                className={cn(
                  "h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium focus:border-blue-500 focus:outline-none",
                  STATUS_CLASS[incident.status] ?? "",
                )}
              >
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Métadonnées contextuelles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MetaRow
              icon={Building2}
              label="Client"
              value={incident.organization?.name ?? "Non mappé"}
              hint={incident.organization?.clientCode ?? undefined}
              muted={!incident.organization}
              orgLogo={incident.organization?.name ?? null}
            />
            <MetaRow icon={Laptop} label="Endpoint" value={incident.endpoint ?? "—"} mono />
            <MetaRow icon={User} label="Utilisateur" value={incident.userPrincipal ?? "—"} mono />
            {incident.software && <MetaRow icon={Bug} label="Logiciel" value={incident.software} mono />}
            {incident.cveId && <MetaRow icon={Bug} label="CVE" value={incident.cveId} mono />}
            {incident.assignee && (
              <MetaRow
                icon={User}
                label="Assigné à"
                value={`${incident.assignee.firstName} ${incident.assignee.lastName}`}
              />
            )}
          </div>

          {/* Liste des comptes inactifs — rapport AD peut en contenir N.
              Affiché en premier parce que c'est l'information la plus utile
              pour décider quoi faire de l'alerte. */}
          {Array.isArray(
            (incident.metadata as { inactiveAccounts?: unknown } | null)?.inactiveAccounts,
          ) &&
            ((incident.metadata as { inactiveAccounts: string[] }).inactiveAccounts
              .length ?? 0) > 0 && (
              <div>
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Comptes inactifs listés (
                  {
                    (incident.metadata as { inactiveAccounts: string[] })
                      .inactiveAccounts.length
                  }
                  )
                </h2>
                <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {(
                    incident.metadata as { inactiveAccounts: string[] }
                  ).inactiveAccounts.map((account) => (
                    <div
                      key={account}
                      className="flex items-center gap-3 px-4 py-2 font-mono text-[12.5px] text-slate-800"
                    >
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {account}
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Résumé */}
          {incident.summary && (
            <div>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Résumé
              </h2>
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                {incident.summary}
              </div>
            </div>
          )}

          {/* Analyse IA — triage MITRE + synthèse narrative */}
          <AiIncidentPanel
            incidentId={incident.id}
            initialTriage={
              (incident.metadata as {
                aiTriage?: React.ComponentProps<
                  typeof AiIncidentPanel
                >["initialTriage"];
              } | null)?.aiTriage ?? null
            }
            initialSynthesis={
              (incident.metadata as {
                aiSynthesis?: React.ComponentProps<
                  typeof AiIncidentPanel
                >["initialSynthesis"];
              } | null)?.aiSynthesis ?? null
            }
          />

          {/* Historique complet */}
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Historique ({incident.alerts.length} dernière{incident.alerts.length > 1 ? "s" : ""})
            </h2>
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              {incident.alerts.length === 0 ? (
                <p className="px-4 py-3 text-[12px] text-slate-400 italic">
                  Aucune alerte individuelle enregistrée pour cet incident.
                </p>
              ) : (
                incident.alerts.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-slate-800 truncate">{a.title}</p>
                      {a.summary && (
                        <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
                          {a.summary.slice(0, 240)}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0 whitespace-nowrap">
                      {fmtDate(a.receivedAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Payload brut (debug) */}
          <div>
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800"
            >
              {showRaw ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showRaw ? "Masquer" : "Afficher"} les données brutes
            </button>
            {showRaw && (
              <pre className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 overflow-x-auto max-h-80">
                {JSON.stringify(incident, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  hint,
  mono,
  muted,
  orgLogo,
}: {
  icon: typeof User;
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  muted?: boolean;
  /** Nom d'organisation — si fourni, remplace l'icône par le logo. */
  orgLogo?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      {orgLogo ? (
        <OrgLogo name={orgLogo} size={18} rounded="sm" className="mt-0.5 shrink-0" />
      ) : (
        <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", muted ? "text-slate-300" : "text-slate-400")} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-[13px] text-slate-800 truncate",
            mono ? "font-mono" : "",
            muted ? "italic text-slate-400" : "",
          )}
        >
          {value}
        </p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
