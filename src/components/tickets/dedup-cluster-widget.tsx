"use client";

// ============================================================================
// Widget "Duplicates probables" — page ticket.
//
// S'affiche quand le ticket fait partie d'un cluster détecté par
// `cross-source-dedup`. Expose les siblings avec leur source, status et
// assignataire, pour que le tech qui prend le ticket en main voie
// immédiatement qu'un autre tech/source travaille sur le même incident.
//
// Pas d'auto-merge : la décision de fusionner reste humaine. Le widget
// propose juste une visibilité. La "Master" du cluster = le ticket le plus
// ancien (convention).
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Loader2,
  Crown,
  Clock,
  User,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Sibling {
  id: string;
  number: number;
  subject: string;
  source: string;
  status: string;
  createdAt: string;
  assigneeName: string | null;
  isMaster: boolean;
}

interface ClusterPayload {
  clusterId: string;
  thisIsMaster: boolean;
  masterTicket: { id: string; number: number; subject: string } | null;
  siblings: Sibling[];
  signals: {
    sharedEndpoints?: string[];
    sharedIPs?: string[];
    sharedRequesters?: string[];
    distinctSources?: string[];
    maxCosine?: number | null;
    timeSpanMinutes?: number;
  };
  confidence: number;
  summary: string;
  detectedAt: string;
}

export function DedupClusterWidget({ ticketId }: { ticketId: string }) {
  const [cluster, setCluster] = useState<ClusterPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/tickets/${ticketId}/dedup-cluster`);
        if (!res.ok) return;
        const data = (await res.json()) as { cluster: ClusterPayload | null };
        if (!cancelled) setCluster(data.cluster);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading) return null;
  if (!cluster) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="border-b border-amber-200 px-4 py-2.5 dark:border-amber-900">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Duplicates probables
          </span>
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Confiance {Math.round(cluster.confidence * 100)}%
          </span>
        </div>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          {cluster.summary}
        </p>
        <Signals signals={cluster.signals} />
      </div>

      {!cluster.thisIsMaster && cluster.masterTicket && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/40 px-4 py-2 text-xs dark:border-amber-900 dark:bg-amber-900/40">
          <Crown className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
          <span className="text-amber-800 dark:text-amber-200">
            Ticket référence :{" "}
            <Link
              href={`/tickets/${cluster.masterTicket.id}`}
              className="font-semibold underline-offset-2 hover:underline"
            >
              TK-{cluster.masterTicket.number}
            </Link>
          </span>
        </div>
      )}

      <ul className="divide-y divide-amber-100 dark:divide-amber-900">
        {cluster.siblings.map((s) => (
          <li key={s.id}>
            <Link
              href={`/tickets/${s.id}`}
              className="block px-4 py-2.5 transition hover:bg-amber-100/50 dark:hover:bg-amber-900/40"
            >
              <div className="flex items-center gap-2">
                {s.isMaster && (
                  <Crown
                    className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-300"
                    aria-label="Ticket référence"
                  />
                )}
                <span className="font-mono text-xs font-medium text-amber-900 dark:text-amber-200">
                  TK-{s.number}
                </span>
                <span className="text-amber-400">·</span>
                <SourceBadge source={s.source} />
                <span className="text-amber-400">·</span>
                <StatusBadge status={s.status} />
                <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400">
                  {formatAge(s.createdAt)}
                </span>
              </div>
              <div className="mt-1 truncate text-sm text-slate-800 dark:text-slate-100">
                {s.subject}
              </div>
              {s.assigneeName && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <User className="h-3 w-3" />
                  {s.assigneeName}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <div className="border-t border-amber-200 px-4 py-2 text-[10px] italic text-amber-700 dark:border-amber-900 dark:text-amber-400">
        <AlertTriangle className="mr-1 inline h-2.5 w-2.5" />
        Fusion manuelle recommandée : coordonne avec le tech assigné au
        master avant de clore les autres comme doublons.
      </div>
    </div>
  );
}

function Signals({
  signals,
}: {
  signals: ClusterPayload["signals"];
}) {
  const parts: string[] = [];
  if (signals.sharedEndpoints && signals.sharedEndpoints.length > 0) {
    parts.push(`endpoint: ${signals.sharedEndpoints.slice(0, 2).join(", ")}`);
  }
  if (signals.sharedIPs && signals.sharedIPs.length > 0) {
    parts.push(`ip: ${signals.sharedIPs[0]}`);
  }
  if (signals.maxCosine !== null && signals.maxCosine !== undefined) {
    parts.push(`similarité sémantique ${Math.round(signals.maxCosine * 100)}%`);
  }
  if (signals.distinctSources && signals.distinctSources.length > 1) {
    parts.push(`sources: ${signals.distinctSources.join(", ")}`);
  }
  if (parts.length === 0) return null;
  return (
    <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
      {parts.join(" · ")}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="rounded border border-amber-300 bg-white px-1 py-px text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
      {source.toLowerCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "NEW" || status === "OPEN" || status === "WAITING"
      ? "text-blue-700 dark:text-blue-300"
      : status === "IN_PROGRESS"
        ? "text-amber-700 dark:text-amber-300"
        : status === "RESOLVED" || status === "CLOSED"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-slate-600 dark:text-slate-400";
  return (
    <span className={cn("text-[10px] font-medium uppercase", color)}>
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
}

function formatAge(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}
