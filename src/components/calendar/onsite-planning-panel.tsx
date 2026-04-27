"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ListTodo, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// OnSitePlanningPanel — file de planification "à faire sur place".
//
// Croise les tickets `requiresOnSite=true` avec les events WORK_LOCATION
// cédulés à venir, pour faire remonter en tête les clients que l'agent
// courant doit visiter prochainement.
//
// Deux modes via `variant` :
//   - "collapsible" : carte repliable (utilisée historiquement dans le
//     calendrier). Toggle persisté en localStorage.
//   - "expanded"    : header fixe + liste scrollable, hauteur 100% du
//     conteneur parent (utilisée comme widget dashboard à hauteur égale
//     d'un voisin).
//
// Quand `mine=true`, l'API filtre les events WORK_LOCATION sur ceux
// dont l'utilisateur courant est attendee. Les orgs visitées par
// d'autres agents basculent en "Autres clients" — un agent ne voit donc
// pas en haut une visite qui ne le concerne pas.
// ---------------------------------------------------------------------------

interface OnSiteTicketDTO {
  id: string;
  displayNumber: string;
  subject: string;
  priority: string;
  status: string;
  assignee: { firstName: string; lastName: string } | null;
}

interface OnSiteOrgGroup {
  organizationId: string;
  organizationName: string;
  nextVisit: {
    eventId: string;
    title: string;
    startsAt: string;
    agents: { id: string; firstName: string; lastName: string }[];
  } | null;
  tickets: OnSiteTicketDTO[];
}

interface OnSiteQueueResponse {
  upcoming: OnSiteOrgGroup[];
  other: OnSiteOrgGroup[];
  totalTickets: number;
  totalOrgs: number;
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  URGENT: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-slate-400",
};

function fmtVisitDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const time = d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Aujourd'hui · ${time}`;
  if (isTomorrow) return `Demain · ${time}`;
  return d.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }) + ` · ${time}`;
}

function OnSiteTicketRow({ t }: { t: OnSiteTicketDTO }) {
  return (
    <Link
      href={`/tickets/${t.id}`}
      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 transition-colors group"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          PRIORITY_DOT[t.priority] ?? "bg-slate-400",
        )}
        title={`Priorité ${t.priority}`}
      />
      <span className="text-[12.5px] text-slate-800 group-hover:text-blue-700 truncate flex-1 min-w-0">
        {t.subject}
      </span>
      {t.assignee && (
        <span className="text-[10.5px] text-slate-400 truncate max-w-[100px] shrink-0">
          {t.assignee.firstName} {t.assignee.lastName.charAt(0)}.
        </span>
      )}
      <span className="font-mono text-[10.5px] text-slate-400 tabular-nums shrink-0 min-w-[44px] text-right">
        {t.displayNumber}
      </span>
    </Link>
  );
}

function OtherOrgGroup({ g }: { g: OnSiteOrgGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors text-left"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[12.5px] font-medium text-slate-700 truncate flex-1 min-w-0">
          {g.organizationName}
        </span>
        <span className="text-[10.5px] text-slate-500 tabular-nums shrink-0">
          {g.tickets.length}
        </span>
      </button>
      {open && (
        <div className="bg-slate-50/40 border-y border-slate-100 divide-y divide-slate-100/80">
          {g.tickets.map((t) => (
            <OnSiteTicketRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueBody({ data, loading }: { data: OnSiteQueueResponse | null; loading: boolean }) {
  const totalTickets = data?.totalTickets ?? 0;
  const upcoming = data?.upcoming ?? [];
  const other = data?.other ?? [];
  if (loading) {
    return <div className="px-3 py-4 text-[12px] text-slate-400">Chargement…</div>;
  }
  if (totalTickets === 0) {
    return (
      <div className="px-3 py-4 text-[12px] text-slate-400">
        Aucun ticket à planifier sur place pour l&apos;instant.
      </div>
    );
  }
  return (
    <>
      {upcoming.length > 0 && (
        <div>
          <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white sticky top-0 z-10 border-b border-slate-100">
            Prochaines visites
          </div>
          {upcoming.map((g) => (
            <div key={g.organizationId} className="border-b border-slate-100 last:border-b-0">
              <div className="flex items-start gap-2 px-3 py-2 bg-blue-50/40">
                <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-slate-800 truncate">
                    {g.organizationName}
                  </div>
                  {g.nextVisit && (
                    <div className="text-[10.5px] text-slate-500 truncate">
                      {fmtVisitDate(g.nextVisit.startsAt)}
                      {g.nextVisit.agents.length > 0 && (
                        <>
                          {" · "}
                          {g.nextVisit.agents
                            .map((a) => `${a.firstName} ${a.lastName.charAt(0)}.`)
                            .join(", ")}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[10.5px] text-slate-500 tabular-nums shrink-0 mt-0.5">
                  {g.tickets.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {g.tickets.map((t) => (
                  <OnSiteTicketRow key={t.id} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div>
          <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white sticky top-0 z-10 border-b border-slate-100">
            Autres clients
            <span className="ml-2 text-slate-400 font-normal normal-case tracking-normal">
              ({other.reduce((acc, g) => acc + g.tickets.length, 0)} tickets · {other.length} clients)
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {other.map((g) => (
              <OtherOrgGroup key={g.organizationId} g={g} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function OnSitePlanningPanel({
  variant = "collapsible",
  mineOnly = false,
}: {
  variant?: "collapsible" | "expanded";
  /** Filtre les "Prochaines visites" sur celles auxquelles l'utilisateur courant participe. */
  mineOnly?: boolean;
}) {
  const [open, setOpen] = useState(() => {
    if (variant === "expanded") return true;
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("calendar.onSitePanel.open") === "1";
  });
  const [data, setData] = useState<OnSiteQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (variant !== "collapsible") return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("calendar.onSitePanel.open", open ? "1" : "0");
    }
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const url = mineOnly
      ? "/api/v1/calendar/onsite-queue?mine=true"
      : "/api/v1/calendar/onsite-queue";
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OnSiteQueueResponse | null) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mineOnly]);

  const totalTickets = data?.totalTickets ?? 0;

  if (variant === "expanded") {
    // Mode widget : header non-cliquable + corps scrollable qui remplit
    // la hauteur du conteneur parent. Les widgets dashboard ont une
    // hauteur imposée par la grille — on s'y conforme avec h-full +
    // flex-col.
    return (
      <Card className="h-full flex flex-col">
        <CardContent className="p-0 flex flex-col h-full overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 shrink-0">
            <ListTodo className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-[13px] font-semibold text-slate-800 truncate">
              À planifier sur place
            </span>
            {totalTickets > 0 && (
              <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800 tabular-nums shrink-0">
                {totalTickets}
              </span>
            )}
            {mineOnly && (
              <span className="ml-auto text-[10.5px] text-slate-400 truncate shrink-0">
                Filtré sur mes visites
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <QueueBody data={data} loading={loading} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Mode "collapsible" — historique du calendrier, conservé pour rétrocompat
  // au cas où on voudrait le re-monter ailleurs.
  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ListTodo className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-[12px] font-semibold text-slate-700 truncate">
              À planifier sur place
            </span>
            {open && totalTickets > 0 && (
              <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800 tabular-nums shrink-0">
                {totalTickets}
              </span>
            )}
            {!open && (
              <span className="text-[11px] text-slate-400 shrink-0">
                — Tickets marqués sur place et non encore planifiés
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {open && (
          <div className="border-t border-slate-100 max-h-[420px] overflow-y-auto">
            <QueueBody data={data} loading={loading} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
