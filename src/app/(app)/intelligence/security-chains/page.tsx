"use client";

// ============================================================================
// /intelligence/security-chains — Chaînes de corrélation sécurité détectées
// par `security-correlation`. Montre la timeline des incidents corrélés, les
// entités partagées, et les liens vers les incidents + tickets associés.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ShieldAlert,
  Building2,
  Clock,
  Server,
  User,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IncidentDetail {
  id: string;
  source: string;
  kind: string;
  severity: string | null;
  status: string;
  title: string;
  firstSeenAt: string;
  lastSeenAt: string;
  ticketId: string | null;
}

interface Chain {
  chainId: string;
  incidentIds: string[];
  organizationId?: string | null;
  organizationName: string | null;
  entities?: { endpoints?: string[]; users?: string[] };
  sources?: string[];
  timeSpanMs?: number;
  highestSeverity?: string | null;
  summary?: string;
  detectedAt?: string;
  incidents: IncidentDetail[];
}

export default function SecurityChainsPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/intelligence/security-chains");
        if (!res.ok) {
          setError(res.status === 403 ? "Accès réservé" : "Erreur");
          return;
        }
        const data = (await res.json()) as { chains: Chain[] };
        if (!cancelled) setChains(data.chains ?? []);
      } catch {
        setError("Connexion impossible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <ShieldAlert className="h-6 w-6 text-rose-500" />
          Chaînes de corrélation sécurité
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Incidents corrélés à travers plusieurs sources (Wazuh, Bitdefender,
          Active Directory…) qui partagent une entité (endpoint, compte) dans
          une fenêtre temporelle proche. Un cluster = possiblement une même
          attaque ou un même root cause.
        </p>
      </header>

      {chains.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucune chaîne active détectée. Le job tourne toutes les 10 minutes.
        </p>
      ) : (
        <ul className="space-y-2">
          {chains.map((c) => (
            <li
              key={c.chainId}
              className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((e) => ({ ...e, [c.chainId]: !e[c.chainId] }))
                }
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <SeverityBadge severity={c.highestSeverity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {c.summary ?? "Chaîne de corrélation"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {c.organizationName && (
                      <>
                        <Building2 className="h-3 w-3" />
                        {c.organizationId ? (
                          <Link
                            href={`/intelligence/clients/${c.organizationId}`}
                            className="hover:text-indigo-600 dark:hover:text-indigo-400"
                          >
                            {c.organizationName}
                          </Link>
                        ) : (
                          <span>{c.organizationName}</span>
                        )}
                        <span className="text-slate-300">·</span>
                      </>
                    )}
                    <Clock className="h-3 w-3" />
                    <span>
                      {c.detectedAt
                        ? formatAge(c.detectedAt)
                        : "date inconnue"}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      {c.incidents.length} incident
                      {c.incidents.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      {c.sources?.length ?? 0} sources
                    </span>
                  </div>
                  <EntityLine entities={c.entities} />
                </div>
                {expanded[c.chainId] ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </button>

              {expanded[c.chainId] && (
                <Timeline incidents={c.incidents} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Timeline({ incidents }: { incidents: IncidentDetail[] }) {
  if (incidents.length === 0) {
    return (
      <p className="px-4 py-3 text-xs italic text-slate-400">
        Incidents supprimés.
      </p>
    );
  }
  return (
    <ol className="border-t border-slate-100 dark:border-slate-800">
      {incidents.map((i, idx) => (
        <li
          key={i.id}
          className="relative flex items-start gap-3 px-4 py-3"
        >
          {idx < incidents.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[22px] top-9 bottom-0 w-px bg-slate-200 dark:bg-slate-700"
            />
          )}
          <SeverityDot severity={i.severity ?? undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceBadge source={i.source} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {i.kind}
              </span>
              <StatusBadge status={i.status} />
              <span className="ml-auto text-[10px] tabular-nums text-slate-400">
                {formatTime(i.firstSeenAt)}
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-800 dark:text-slate-100">
              {i.title}
            </div>
            {i.ticketId && (
              <Link
                href={`/tickets/${i.ticketId}`}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <LinkIcon className="h-2.5 w-2.5" />
                Ticket associé
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function EntityLine({
  entities,
}: {
  entities?: Chain["entities"];
}) {
  if (!entities) return null;
  const parts: React.ReactNode[] = [];
  if (entities.endpoints && entities.endpoints.length > 0) {
    parts.push(
      <span key="ep" className="inline-flex items-center gap-1">
        <Server className="h-3 w-3" /> {entities.endpoints.slice(0, 2).join(", ")}
      </span>,
    );
  }
  if (entities.users && entities.users.length > 0) {
    parts.push(
      <span key="u" className="inline-flex items-center gap-1">
        <User className="h-3 w-3" /> {entities.users.slice(0, 2).join(", ")}
      </span>,
    );
  }
  if (parts.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
      {parts.map((p, i) => (
        <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
          {p}
        </span>
      ))}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const map: Record<string, string> = {
    critical: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    info: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  const label: Record<string, string> = {
    critical: "Critique",
    high: "Élevée",
    warning: "Avert.",
    info: "Info",
  };
  const s = severity ?? "info";
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase",
        map[s] ?? map.info,
      )}
    >
      {label[s] ?? s}
    </span>
  );
}

function SeverityDot({ severity }: { severity?: string }) {
  const color =
    severity === "critical"
      ? "bg-rose-500 ring-4 ring-rose-200 dark:ring-rose-950"
      : severity === "high"
        ? "bg-orange-500 ring-4 ring-orange-200 dark:ring-orange-950"
        : severity === "warning"
          ? "bg-amber-500 ring-4 ring-amber-200 dark:ring-amber-950"
          : "bg-slate-400 ring-4 ring-slate-200 dark:ring-slate-800";
  return (
    <span className={cn("relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", color)} />
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="rounded border border-slate-300 bg-white px-1.5 py-px font-mono text-[10px] uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {source.replace("_email", "").replace("_api", "")}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "text-rose-700 dark:text-rose-300",
    investigating: "text-amber-700 dark:text-amber-300",
    waiting_client: "text-blue-700 dark:text-blue-300",
    resolved: "text-emerald-700 dark:text-emerald-300",
    closed: "text-slate-500 dark:text-slate-400",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-medium uppercase",
        map[status] ?? "text-slate-500",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function formatAge(iso: string): string {
  const age = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(age / 60_000);
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
