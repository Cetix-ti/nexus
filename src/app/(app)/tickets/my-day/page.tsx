"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  Ticket,
  Plus,
  MapPin,
  Loader2,
  ArrowRight,
  AlertTriangle,
  CalendarClock,
  CalendarCheck,
  Wrench,
  Car,
  Receipt,
  DollarSign,
  Filter,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayTicket {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  type: string;
  organizationName: string;
  requesterName: string;
  assigneeName: string | null;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  slaBreached: boolean;
}

interface DayTimeEntry {
  id: string;
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  ticketPriority: string;
  organizationName: string;
  timeType: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  description: string;
  isOnsite: boolean;
  isAfterHours: boolean;
  coverageStatus: string;
  hourlyRate: number | null;
  amount: number | null;
}

interface WorkedTicket {
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  ticketPriority: string;
  organizationName: string;
  totalMinutes: number;
  entryCount: number;
  entries: DayTimeEntry[];
}

interface MyDayData {
  date: string;
  stats: {
    totalMinutes: number;
    billableMinutes: number;
    billableAmount: number;
    onsiteCount: number;
    ticketsWorked: number;
    ticketsDueToday: number;
    ticketsCreated: number;
    ticketsScheduled: number;
  };
  workedTickets: WorkedTicket[];
  dueToday: DayTicket[];
  scheduledTickets: DayTicket[];
  createdTickets: DayTicket[];
  onsiteEntries: DayTimeEntry[];
  timeEntries: DayTimeEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function fmtTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

function fmtMoney(v: number): string {
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

const STATUS_STYLES: Record<
  string,
  { label: string; variant: "primary" | "warning" | "success" | "default" | "danger" }
> = {
  new: { label: "Nouveau", variant: "primary" },
  open: { label: "Ouvert", variant: "primary" },
  in_progress: { label: "En cours", variant: "warning" },
  waiting_client: { label: "En attente", variant: "default" },
  on_site: { label: "Sur place", variant: "primary" },
  scheduled: { label: "Planifié", variant: "primary" },
  resolved: { label: "Résolu", variant: "success" },
  closed: { label: "Fermé", variant: "default" },
};

const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  critical: { label: "Critique", className: "text-red-600" },
  high: { label: "Élevée", className: "text-orange-600" },
  medium: { label: "Moyenne", className: "text-yellow-600" },
  low: { label: "Faible", className: "text-slate-500" },
};

const COVERAGE_LABELS: Record<
  string,
  { label: string; variant: "success" | "warning" | "default" | "primary" | "danger" }
> = {
  billable: { label: "Facturable", variant: "warning" },
  included_in_contract: { label: "Inclus contrat", variant: "success" },
  hour_bank: { label: "Banque d'heures", variant: "primary" },
  hour_bank_overage: { label: "Dépassement banque", variant: "warning" },
  msp_overage: { label: "Hors forfait", variant: "warning" },
  non_billable: { label: "Non facturable", variant: "default" },
  pending: { label: "En attente", variant: "default" },
};

const TIME_TYPE_LABELS: Record<string, string> = {
  remote: "À distance",
  on_site: "Sur place",
  phone: "Téléphone",
  internal: "Interne",
  travel: "Déplacement",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MyDayPage() {
  const [data, setData] = useState<MyDayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [excludedOrgs, setExcludedOrgs] = useState<Set<string>>(new Set());
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as
    | { firstName?: string; lastName?: string }
    | undefined;

  useEffect(() => {
    fetch("/api/v1/my-day")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch((e) => console.error("my-day load failed", e))
      .finally(() => setLoading(false));
  }, []);

  // Unique org names from time entries
  const orgNames = useMemo(() => {
    if (!data) return [];
    const names = new Set(data.timeEntries.map((te) => te.organizationName));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "fr"));
  }, [data]);

  // Filtered billing totals
  const filteredBilling = useMemo(() => {
    if (!data) return { amount: 0, billableMinutes: 0, totalMinutes: 0 };
    const included = data.timeEntries.filter(
      (te) => !excludedOrgs.has(te.organizationName),
    );
    const billable = included.filter((te) =>
      ["billable", "hour_bank_overage", "msp_overage", "travel_billable"].includes(
        te.coverageStatus,
      ),
    );
    return {
      amount: included
        .filter((te) => te.amount != null && te.amount > 0)
        .reduce((s, te) => s + (te.amount ?? 0), 0),
      billableMinutes: billable.reduce((s, te) => s + te.durationMinutes, 0),
      totalMinutes: included.reduce((s, te) => s + te.durationMinutes, 0),
    };
  }, [data, excludedOrgs]);

  const toggleOrg = (name: string) => {
    setExcludedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertTriangle className="h-6 w-6 mb-2" />
        <p className="text-sm">Impossible de charger les données</p>
      </div>
    );
  }

  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: fr });
  const goTicket = (id: string) => router.push(`/tickets/${id}`);
  const hasFilter = excludedOrgs.size > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ================================================================ */}
      {/* Header + billing total                                           */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Ma journée
          </h1>
          <p className="mt-1 text-[13px] text-slate-500 capitalize">{today}</p>
        </div>

        {/* Billing summary — top right */}
        <div className="flex items-center gap-3 shrink-0">
          <Card>
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  Facturé aujourd'hui
                  {hasFilter && (
                    <span className="text-[10px] text-amber-600 font-medium">
                      (filtré)
                    </span>
                  )}
                </p>
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {fmtMoney(filteredBilling.amount)}
                </p>
                <p className="text-[11px] text-slate-400">
                  {fmtDuration(filteredBilling.billableMinutes)} facturable
                  {" / "}
                  {fmtDuration(filteredBilling.totalMinutes)} total
                </p>
              </div>
              <OrgFilterDropdown
                orgNames={orgNames}
                excludedOrgs={excludedOrgs}
                onToggle={toggleOrg}
                onClear={() => setExcludedOrgs(new Set())}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Quick stat pills                                                 */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Wrench className="h-4 w-4 text-blue-600" />}
          label="Tickets travaillés"
          value={data.stats.ticketsWorked}
          bgClass="bg-blue-50"
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4 text-red-600" />}
          label="Échéance aujourd'hui"
          value={data.stats.ticketsDueToday}
          bgClass="bg-red-50"
        />
        <StatCard
          icon={<CalendarCheck className="h-4 w-4 text-violet-600" />}
          label="Planifiés"
          value={data.stats.ticketsScheduled}
          bgClass="bg-violet-50"
        />
        <StatCard
          icon={<Car className="h-4 w-4 text-amber-600" />}
          label="Déplacements"
          value={data.stats.onsiteCount}
          bgClass="bg-amber-50"
        />
      </div>

      {/* ================================================================ */}
      {/* 1. Tickets travaillés aujourd'hui (avec saisies de temps)        */}
      {/* ================================================================ */}
      <Section
        title="Tickets travaillés aujourd'hui"
        subtitle="Tickets dans lesquels vous avez saisi du temps"
        count={data.workedTickets.length}
        icon={<Wrench className="h-4 w-4" />}
        accentClass="text-blue-600"
        accentBg="bg-blue-50 ring-1 ring-inset ring-blue-200/60"
      >
        {data.workedTickets.length === 0 ? (
          <EmptyState message="Aucune saisie de temps aujourd'hui" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.workedTickets.map((wt) => (
              <WorkedTicketRow
                key={wt.ticketId}
                ticket={wt}
                onClick={() => goTicket(wt.ticketId)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ================================================================ */}
      {/* 2. Échéances + Planifiés — side by side                          */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Échéance aujourd'hui"
          subtitle="Tickets à compléter aujourd'hui"
          count={data.dueToday.length}
          icon={<CalendarClock className="h-4 w-4" />}
          accentClass="text-red-600"
          accentBg="bg-red-50 ring-1 ring-inset ring-red-200/60"
        >
          {data.dueToday.length === 0 ? (
            <EmptyState message="Aucune échéance aujourd'hui" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.dueToday.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => goTicket(t.id)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Planifiés"
          subtitle="Tickets que vous avez planifiés"
          count={data.scheduledTickets.length}
          icon={<CalendarCheck className="h-4 w-4" />}
          accentClass="text-violet-600"
          accentBg="bg-violet-50 ring-1 ring-inset ring-violet-200/60"
        >
          {data.scheduledTickets.length === 0 ? (
            <EmptyState message="Aucun ticket planifié" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.scheduledTickets.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => goTicket(t.id)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ================================================================ */}
      {/* 3. Déplacements — onsite visits with billing info                */}
      {/* ================================================================ */}
      {data.onsiteEntries.length > 0 && (
        <Section
          title="Déplacements"
          subtitle="Visites sur site avec facturation"
          count={data.onsiteEntries.length}
          icon={<Car className="h-4 w-4" />}
          accentClass="text-amber-600"
          accentBg="bg-amber-50 ring-1 ring-inset ring-amber-200/60"
        >
          <div className="divide-y divide-slate-100">
            {data.onsiteEntries.map((te) => (
              <OnsiteRow
                key={te.id}
                entry={te}
                onClick={() => goTicket(te.ticketId)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ================================================================ */}
      {/* 4. Tickets créés aujourd'hui                                     */}
      {/* ================================================================ */}
      <Section
        title="Créés aujourd'hui"
        subtitle="Tickets que vous avez ouverts"
        count={data.createdTickets.length}
        icon={<Plus className="h-4 w-4" />}
        accentClass="text-slate-600"
        accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
      >
        {data.createdTickets.length === 0 ? (
          <EmptyState message="Aucun ticket créé aujourd'hui" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.createdTickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                onClick={() => goTicket(t.id)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  bgClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bgClass: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            bgClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11.5px] text-slate-500 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  subtitle,
  count,
  icon,
  accentClass,
  accentBg,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  icon: React.ReactNode;
  accentClass: string;
  accentBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            accentBg,
            accentClass,
          )}
        >
          {icon}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          <span className="inline-flex h-5 items-center rounded-md bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500 tabular-nums">
            {count}
          </span>
        </div>
        <span className="text-[12px] text-slate-400 truncate">{subtitle}</span>
      </div>
      <Card className="flex-1">
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </div>
  );
}

/** Ticket row with time summary (for "tickets travaillés") */
function WorkedTicketRow({
  ticket: wt,
  onClick,
}: {
  ticket: WorkedTicket;
  onClick: () => void;
}) {
  const status = STATUS_STYLES[wt.ticketStatus] ?? {
    label: wt.ticketStatus,
    variant: "default" as const,
  };
  const priority = PRIORITY_STYLES[wt.ticketPriority] ?? {
    label: wt.ticketPriority,
    className: "text-slate-500",
  };

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 group"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
        <Clock className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono text-slate-400">
            {wt.ticketNumber}
          </span>
          <Badge variant={status.variant} className="text-[10.5px]">
            {status.label}
          </Badge>
          <span className={cn("text-[11px] font-medium", priority.className)}>
            {priority.label}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-slate-900 truncate">
          {wt.ticketSubject}
        </p>
        <p className="mt-0.5 text-[11.5px] text-slate-400">
          {wt.organizationName}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-bold tabular-nums text-slate-800">
          {fmtDuration(wt.totalMinutes)}
        </p>
        <p className="text-[11px] text-slate-400">
          {wt.entryCount} saisie{wt.entryCount > 1 ? "s" : ""}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/** Standard ticket row */
function TicketRow({
  ticket: t,
  onClick,
}: {
  ticket: DayTicket;
  onClick: () => void;
}) {
  const status = STATUS_STYLES[t.status] ?? {
    label: t.status,
    variant: "default" as const,
  };
  const priority = PRIORITY_STYLES[t.priority] ?? {
    label: t.priority,
    className: "text-slate-500",
  };

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono text-slate-400">
            {t.number}
          </span>
          <Badge variant={status.variant} className="text-[10.5px]">
            {status.label}
          </Badge>
          <span className={cn("text-[11px] font-medium", priority.className)}>
            {priority.label}
          </span>
          {t.slaBreached && (
            <AlertTriangle className="h-3 w-3 text-red-500" />
          )}
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-slate-900 truncate">
          {t.subject}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-400">
          <span>{t.organizationName}</span>
          <span>·</span>
          <span>{t.requesterName}</span>
        </div>
      </div>
      {t.dueAt && (
        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-400">Échéance</p>
          <p className="text-[12px] font-medium tabular-nums text-slate-600">
            {fmtTime(t.dueAt)}
          </p>
        </div>
      )}
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/** Onsite/travel row — shows client, ticket, billing status, and amount */
function OnsiteRow({
  entry: te,
  onClick,
}: {
  entry: DayTimeEntry;
  onClick: () => void;
}) {
  const coverage = COVERAGE_LABELS[te.coverageStatus] ?? {
    label: te.coverageStatus,
    variant: "default" as const,
  };
  const isBilled =
    te.coverageStatus === "billable" ||
    te.coverageStatus === "hour_bank_overage" ||
    te.coverageStatus === "msp_overage";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 group"
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
          isBilled ? "bg-emerald-50" : "bg-slate-100",
        )}
      >
        <MapPin
          className={cn(
            "h-4 w-4",
            isBilled ? "text-emerald-600" : "text-slate-500",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono text-slate-400">
            {te.ticketNumber}
          </span>
          <span className="text-[12px] font-semibold tabular-nums text-slate-700">
            {fmtDuration(te.durationMinutes)}
          </span>
          <Badge variant={coverage.variant} className="text-[10.5px]">
            {coverage.label}
          </Badge>
          {te.isAfterHours && (
            <span className="text-[10.5px] text-violet-600 font-medium">
              Hors heures
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-slate-900 truncate">
          {te.ticketSubject}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-400">
          <span className="font-medium text-slate-500">
            {te.organizationName}
          </span>
          <span>·</span>
          <span>
            {fmtTime(te.startedAt)}
            {te.endedAt ? ` — ${fmtTime(te.endedAt)}` : ""}
          </span>
          {te.description && (
            <>
              <span>·</span>
              <span className="truncate max-w-[200px]">{te.description}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {te.amount != null && te.amount > 0 ? (
          <p className="text-[13px] font-bold tabular-nums text-emerald-700">
            {fmtMoney(te.amount)}
          </p>
        ) : (
          <p className="text-[12px] text-slate-400">—</p>
        )}
        <p className="text-[11px] text-slate-400">
          {TIME_TYPE_LABELS[te.timeType] ?? te.timeType}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-[13px] text-slate-400">
      {message}
    </div>
  );
}

/** Dropdown to exclude orgs from the billing total */
function OrgFilterDropdown({
  orgNames,
  excludedOrgs,
  onToggle,
  onClear,
}: {
  orgNames: string[];
  excludedOrgs: Set<string>;
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (orgNames.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
          excludedOrgs.size > 0
            ? "border-amber-300 bg-amber-50 text-amber-600"
            : "border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300",
        )}
        title="Filtrer les entreprises"
      >
        <Filter className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
            <span className="text-[12px] font-semibold text-slate-700">
              Exclure du total
            </span>
            {excludedOrgs.size > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                Tout inclure
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {orgNames.map((name) => {
              const excluded = excludedOrgs.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle(name)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-slate-50"
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0",
                      excluded
                        ? "border-slate-300 bg-white"
                        : "border-blue-500 bg-blue-500",
                    )}
                  >
                    {!excluded && (
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "truncate",
                      excluded ? "text-slate-400 line-through" : "text-slate-700",
                    )}
                  >
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
