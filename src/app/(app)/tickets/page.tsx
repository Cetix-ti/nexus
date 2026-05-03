"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";
import { useAllOrganizations } from "@/lib/hooks/use-all-organizations";
import { useTicketsStore } from "@/stores/tickets-store";
import { useOrgLogosStore } from "@/stores/org-logos-store";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Plus,
  Search,
  LayoutList,
  Kanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketListView } from "@/components/tickets/ticket-list-view";
import { TicketKanbanView } from "@/components/tickets/ticket-kanban-view";
import { MySlaRisksBanner } from "@/components/tickets/my-sla-risks-banner";
import { type TicketStatus } from "@/lib/mock-data";

type ViewMode = "list" | "kanban";

// Les anciens statuts Freshservice (open, on_site, pending, waiting_vendor)
// restent dans les filtres "legacy" ci-dessous pour que les tickets importés
// non encore migrés restent visibles — une fois la migration DB appliquée,
// ils pourront être retirés.
const STATUS_TABS: { key: string; label: string; filter: TicketStatus[] | null }[] = [
  { key: "all", label: "Tous", filter: null },
  { key: "new", label: "Nouveaux", filter: ["new", "open"] },
  { key: "in_progress", label: "En cours", filter: ["in_progress", "on_site"] },
  { key: "waiting", label: "En attente", filter: ["waiting_client", "pending", "waiting_vendor", "scheduled"] },
  // Onglet dédié aux tickets verrouillés en attente d'approbation côté
  // client. Filtrage côté client (le serveur ne sait pas filtrer un
  // sous-ensemble par approvalStatus dans le STATUS_TABS — on le fait
  // après le fetch sur la base de `requiresApproval && approvalStatus===PENDING`).
  { key: "pending_approval", label: "En attente d'approbation", filter: null },
  { key: "resolved", label: "Résolus", filter: ["resolved", "closed", "cancelled"] },
  { key: "trash", label: "Corbeille", filter: ["deleted"] },
];


export default function TicketsPage() {
  return (
    <Suspense fallback={null}>
      <TicketsPageInner />
    </Suspense>
  );
}

function TicketsPageInner() {
  const tickets = useTicketsStore((s) => s.tickets);
  const loadAll = useTicketsStore((s) => s.loadAll);
  const loaded = useTicketsStore((s) => s.loaded);
  const loadOrgLogos = useOrgLogosStore((s) => s.load);
  useEffect(() => { loadOrgLogos(); }, [loadOrgLogos]);
  const searchParams = useSearchParams();
  const session = useSession();
  const filterParam = searchParams?.get("filter") ?? null;
  const currentUserId =
    (session.data?.user as { id?: string } | undefined)?.id ?? null;
  const sessUser = session.data?.user as
    | { firstName?: string; lastName?: string; email?: string }
    | undefined;
  const currentUserName = sessUser
    ? `${sessUser.firstName ?? ""} ${sessUser.lastName ?? ""}`.trim() ||
      sessUser.email?.split("@")[0] ||
      null
    : null;

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const [viewMode, setViewMode] = usePersistentState<ViewMode>("nexus.tickets.viewMode", "list");
  const [activeTab, setActiveTab] = usePersistentState("nexus.tickets.tab", "all");
  const [search, setSearch] = usePersistentState("nexus.tickets.search", "");
  const [priorityFilter, setPriorityFilter] = usePersistentState("nexus.tickets.priority", "all");
  const [orgFilter, setOrgFilter] = usePersistentState("nexus.tickets.org", "all");

  // Liste exhaustive des orgs (pas dérivée des tickets visibles) —
  // permet de filtrer une org même sans tickets sur la période /
  // l'onglet courant.
  const allOrgs = useAllOrganizations();
  const organizations = useMemo(
    () => allOrgs.map((o) => o.name).sort((a, b) => a.localeCompare(b, "fr")),
    [allOrgs],
  );

  const filtered = useMemo(() => {
    let result = [...tickets];

    // Status tab filter.
    // Cas spécial : TOUS les onglets SAUF "trash" masquent les
    // tickets supprimés. Seul l'onglet "Corbeille" les montre.
    const tab = STATUS_TABS.find((t) => t.key === activeTab);
    if (tab?.filter) {
      result = result.filter((t) => tab.filter!.includes(t.status));
    } else if (activeTab === "pending_approval") {
      // Onglet spécial : tickets en attente d'approbation. Lit
      // requiresApproval + approvalStatus exposés par l'API tickets.
      result = result.filter(
        (t) =>
          (t as { requiresApproval?: boolean }).requiresApproval &&
          ((t as { approvalStatus?: string }).approvalStatus === "pending"),
      );
    } else if (activeTab !== "trash") {
      result = result.filter((t) => t.status !== "deleted");
      // Tous les autres onglets (sauf "all") masquent les pending-approval
      // pour ne pas mélanger les tickets verrouillés avec les actifs.
      if (activeTab !== "all") {
        result = result.filter(
          (t) =>
            !((t as { requiresApproval?: boolean }).requiresApproval &&
              (t as { approvalStatus?: string }).approvalStatus === "pending"),
        );
      }
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.number.toLowerCase().includes(q) ||
          t.requesterName.toLowerCase().includes(q) ||
          t.organizationName.toLowerCase().includes(q)
      );
    }

    // Priority
    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    // Organization
    if (orgFilter !== "all") {
      result = result.filter((t) => t.organizationName === orgFilter);
    }

    // Quick filter via URL (?filter=mine|unassigned)
    if (filterParam === "mine") {
      result = result.filter((t) => {
        const aId = (t as { assigneeId?: string | null }).assigneeId;
        const aName = (t as { assigneeName?: string | null }).assigneeName;
        if (currentUserId && aId) return aId === currentUserId;
        if (currentUserName && aName) return aName === currentUserName;
        return false;
      });
    } else if (filterParam === "unassigned") {
      result = result.filter((t) => {
        const aId = (t as { assigneeId?: string | null }).assigneeId;
        const aName = (t as { assigneeName?: string | null }).assigneeName;
        return !aId && !aName;
      });
    }

    return result;
  }, [
    tickets,
    activeTab,
    search,
    priorityFilter,
    orgFilter,
    filterParam,
    currentUserId,
    currentUserName,
  ]);

  return (
    <div className="flex flex-col gap-5">
      {/* SLA risks banner — tickets de l'assigné à risque, 15 min refresh */}
      <MySlaRisksBanner />

      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Service Desk
          </div>
          <div className="mt-1.5 flex items-baseline gap-3">
            <h1 className="text-[28px] font-semibold tracking-[-0.022em] text-slate-900 leading-none">
              Tickets
            </h1>
            <span className="text-[13px] font-medium tabular-nums text-slate-400">
              {filtered.length.toLocaleString("fr-CA")}
            </span>
          </div>
        </div>
        <Link href="/tickets/new">
          <Button variant="primary" size="md">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Nouveau ticket
          </Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        {/* Status tabs + view toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* View toggle — hidden on mobile (Kanban not available on mobile) */}
          <div className="hidden sm:flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5 transition-all",
                viewMode === "list"
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/60"
                  : "text-slate-400 hover:text-slate-600"
              )}
              title="Vue liste"
            >
              <LayoutList className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "rounded-md p-1.5 transition-all",
                viewMode === "kanban"
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/60"
                  : "text-slate-400 hover:text-slate-600"
              )}
              title="Vue Kanban"
            >
              <Kanban className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Rechercher un ticket..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              iconLeft={<Search className="h-3.5 w-3.5" />}
            />
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Priorité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes priorités</SelectItem>
              <SelectItem value="critical">Critique</SelectItem>
              <SelectItem value="high">Élevée</SelectItem>
              <SelectItem value="medium">Moyenne</SelectItem>
              <SelectItem value="low">Faible</SelectItem>
            </SelectContent>
          </Select>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Organisation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes organisations</SelectItem>
              {organizations.map((org) => (
                <SelectItem key={org} value={org}>
                  {org}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content — Kanban hidden on mobile, always show list */}
      <div className="sm:hidden">
        <TicketListView tickets={filtered} />
      </div>
      <div className="hidden sm:block">
        {viewMode === "list" ? (
          <TicketListView tickets={filtered} />
        ) : (
          <TicketKanbanView tickets={filtered} />
        )}
      </div>
    </div>
  );
}
