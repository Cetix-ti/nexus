"use client";

// ============================================================================
// Widget "Dépendances" — sidebar ticket.
//
// Upstreams   : tickets dont CE ticket dépend (doivent être fermés avant).
// Downstreams : tickets qui dépendent de CE ticket (seront débloqués quand
//               on ferme celui-ci).
//
// Bandeau rouge si le ticket est bloqué par au moins un upstream non
// terminé — l'API refuse déjà le passage à IN_PROGRESS/ON_SITE/SCHEDULED.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DepTicket {
  linkId: string;
  id: string;
  number: number;
  subject: string;
  status: string;
  done?: boolean;
}

interface SearchResult {
  id: string;
  number: number;
  subject: string;
  status: string;
}

function isDone(status: string): boolean {
  const s = status.toUpperCase();
  return s === "RESOLVED" || s === "CLOSED";
}

export function TicketDependenciesWidget({ ticketId }: { ticketId: string }) {
  const [upstreams, setUpstreams] = useState<DepTicket[]>([]);
  const [downstreams, setDownstreams] = useState<DepTicket[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/tickets/${ticketId}/dependencies`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.data) return;
        setUpstreams(d.data.upstreams);
        setDownstreams(d.data.downstreams);
        setBlocked(!!d.data.blocked);
      })
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  async function remove(linkId: string) {
    await fetch(`/api/v1/tickets/${ticketId}/dependencies?linkId=${linkId}`, {
      method: "DELETE",
    });
    load();
  }

  async function addUpstream(upstreamId: string) {
    const res = await fetch(`/api/v1/tickets/${ticketId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upstreamId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Impossible d'ajouter la dépendance.");
      return;
    }
    setPickerOpen(false);
    load();
  }

  if (!loading && upstreams.length === 0 && downstreams.length === 0) {
    // Mode compact : juste un petit bouton "Ajouter une dépendance".
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2 overflow-hidden">
        <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-slate-500" />
          Dépendances
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="text-[11.5px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Ajouter un ticket amont
        </button>
        {pickerOpen && (
          <DepPickerModal
            ticketId={ticketId}
            excludeIds={[ticketId]}
            onClose={() => setPickerOpen(false)}
            onPicked={(id) => addUpstream(id)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2 overflow-hidden">
      <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5 text-slate-500" />
        Dépendances
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="ml-auto text-slate-400 hover:text-blue-600"
          title="Ajouter un ticket amont"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </p>

      {blocked && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-600" />
          <span>
            Ticket bloqué : au moins un ticket amont n&apos;est pas encore résolu.
          </span>
        </div>
      )}

      {upstreams.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> Ce ticket attend
          </p>
          <ul className="space-y-1">
            {upstreams.map((t) => (
              <DepRow key={t.linkId} t={t} onRemove={() => remove(t.linkId)} />
            ))}
          </ul>
        </div>
      )}

      {downstreams.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
            <ArrowDownRight className="h-3 w-3" /> Bloque ces tickets
          </p>
          <ul className="space-y-1">
            {downstreams.map((t) => (
              <DepRow key={t.linkId} t={t} muted />
            ))}
          </ul>
        </div>
      )}

      {pickerOpen && (
        <DepPickerModal
          ticketId={ticketId}
          excludeIds={[ticketId, ...upstreams.map((u) => u.id), ...downstreams.map((d) => d.id)]}
          onClose={() => setPickerOpen(false)}
          onPicked={(id) => addUpstream(id)}
        />
      )}
    </div>
  );
}

function DepRow({ t, onRemove, muted }: { t: DepTicket; onRemove?: () => void; muted?: boolean }) {
  const done = isDone(t.status);
  return (
    <li className="group flex items-start gap-1.5 min-w-0">
      {done ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <Clock className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
      )}
      <Link
        href={`/tickets/${t.id}`}
        target="_blank"
        className={cn(
          "flex-1 min-w-0 text-[12px] leading-snug truncate",
          muted ? "text-slate-500 hover:text-slate-700" : "text-slate-700 hover:text-blue-600",
        )}
      >
        <span className="font-mono text-[10.5px] text-slate-500 mr-1">TK-{t.number}</span>
        {t.subject}
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 shrink-0"
          title="Retirer"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

function DepPickerModal({
  ticketId,
  excludeIds,
  onClose,
  onPicked,
}: {
  ticketId: string;
  excludeIds: string[];
  onClose: () => void;
  onPicked: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const exclude = new Set(excludeIds);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setSearching(true);
      fetch(`/api/v1/tickets?search=${encodeURIComponent(query)}&limit=20`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          if (cancelled) return;
          const list = Array.isArray(d) ? d : d?.data ?? [];
          setOptions(
            list
              .filter((t: any) => !exclude.has(t.id))
              .slice(0, 20)
              .map((t: any) => ({
                id: t.id,
                number: t.number ?? 0,
                subject: t.subject ?? "",
                status: t.status ?? "",
              })),
          );
        })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg my-8 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">Ajouter un ticket amont</h2>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par sujet ou numéro (TK-…)"
            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {searching ? (
              <div className="py-8 text-center text-[13px] text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin inline" /> Recherche…
              </div>
            ) : options.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-400">Aucun résultat.</div>
            ) : (
              options.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onPicked(t.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors text-left"
                >
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums w-14">
                    TK-{t.number}
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-slate-900 truncate">
                    {t.subject}
                  </span>
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold",
                      isDone(t.status) ? "text-emerald-600" : "text-slate-500",
                    )}
                  >
                    {t.status}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="text-[11.5px] text-slate-400">
            Ce ticket ({ticketId.slice(-6)}) attendra que celui sélectionné soit résolu ou fermé
            avant de pouvoir passer en cours.
          </p>
        </div>
      </div>
    </div>
  );
}
