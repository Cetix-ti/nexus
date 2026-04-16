"use client";

/*
 * Kanban des sauvegardes — deux colonnes :
 *   1. « Templates » (BackupTicketTemplate) — cartes éditables, non-tickets.
 *   2. « En traitement » (Ticket.externalSource = "backup-kanban") — vrais
 *      tickets. Cliquables → ouvre la fiche complète (commentaires + temps).
 *
 * Drag d'une carte de la colonne 1 vers la colonne 2 = POST convert →
 * crée un Ticket, supprime le template. Drag colonne 2 → 1 est interdit
 * (on ne revient pas en arrière : un ticket est déjà persisté ailleurs).
 *
 * Le bouton « Régénérer » lance refreshTemplates côté serveur. Ne touche
 * jamais aux tickets de la colonne 2 — seuls les templates sont
 * reconstruits à partir des dernières alertes Veeam FAILED.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  RefreshCw,
  Loader2,
  Pencil,
  Check,
  X,
  Trash2,
  ArrowRight,
  AlertTriangle,
  FileText,
  MessageSquare,
  ListChecks,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgMini {
  id: string;
  name: string;
  logo: string | null;
  clientCode: string | null;
}

interface BackupTemplate {
  id: string;
  organizationId: string;
  subject: string;
  failedTasks: string[];
  latestAlertAt: string;
  sourceAlertIds: string[];
  organization: OrgMini;
}

interface InProcessingTicket {
  id: string;
  number: number;
  displayNumber: string;
  subject: string;
  status: string;
  priority: string;
  isInternal: boolean;
  createdAt: string;
  organization: OrgMini;
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  } | null;
  _count: { comments: number };
}

interface KanbanData {
  templates: BackupTemplate[];
  tickets: InProcessingTicket[];
}

const COLUMN_TEMPLATE = "templates";
const COLUMN_PROCESSING = "processing";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BackupKanban() {
  const [data, setData] = useState<KanbanData>({ templates: [], tickets: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{
    created: number;
    updated: number;
    preserved: number;
    purged: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [converting, setConverting] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/v1/backup-templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: KanbanData) => setData(d))
      .catch(() => setError("Impossible de charger le Kanban"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/backup-templates/refresh", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const result = await res.json();
      setRefreshResult(result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleUpdateTitle(id: string, subject: string) {
    // Optimistic : on applique le nouveau titre localement, puis on confirme.
    setData((d) => ({
      ...d,
      templates: d.templates.map((t) =>
        t.id === id ? { ...t, subject } : t,
      ),
    }));
    try {
      const res = await fetch(`/api/v1/backup-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load(); // revert sur échec
    }
  }

  async function handleDelete(id: string) {
    // Optimistic
    setData((d) => ({
      ...d,
      templates: d.templates.filter((t) => t.id !== id),
    }));
    try {
      const res = await fetch(`/api/v1/backup-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  async function handleConvert(templateId: string) {
    setConverting((s) => new Set([...s, templateId]));
    try {
      const res = await fetch(
        `/api/v1/backup-templates/${templateId}/convert`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConverting((s) => {
        const next = new Set(s);
        next.delete(templateId);
        return next;
      });
    }
  }

  // Dnd-kit setup — activationConstraint évite les faux drags quand on
  // clique sur un bouton dans la carte.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overCol = e.over?.id;
    if (overCol !== COLUMN_PROCESSING) return;
    const templateId = String(e.active.id);
    // Sécurité : ne convertit que si c'est bien un template.
    if (!data.templates.some((t) => t.id === templateId)) return;
    handleConvert(templateId);
  }

  const activeTemplate = useMemo(
    () => data.templates.find((t) => t.id === activeId) ?? null,
    [data.templates, activeId],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">
            Suivi des échecs de sauvegarde
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Générez des templates de ticket pour chaque client ayant des tâches en
            échec, puis déplacez-les vers « En traitement » pour créer un vrai
            ticket.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Régénérer les templates
        </Button>
      </div>

      {refreshResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[12px] text-blue-900 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{refreshResult.created}</strong> créé
            {refreshResult.created > 1 ? "s" : ""} ·{" "}
            <strong>{refreshResult.updated}</strong> mis à jour ·{" "}
            <strong>{refreshResult.preserved}</strong> conservé
            {refreshResult.preserved > 1 ? "s" : ""} ·{" "}
            <strong>{refreshResult.purged}</strong> purgé
            {refreshResult.purged > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-[12px] text-red-900 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
          <button
            className="ml-auto text-red-700 hover:text-red-900"
            onClick={() => setError(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Kanban grid */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Column
            id={COLUMN_TEMPLATE}
            title="Templates"
            subtitle={`${data.templates.length} en attente de traitement`}
            accent="amber"
          >
            {loading ? (
              <LoadingPlaceholder />
            ) : data.templates.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5 text-slate-300" />}
                title="Aucun template"
                subtitle="Cliquez sur « Régénérer les templates » pour créer une carte par client avec des tâches en échec."
              />
            ) : (
              data.templates.map((t) => (
                <DraggableTemplateCard
                  key={t.id}
                  template={t}
                  converting={converting.has(t.id)}
                  onUpdateTitle={(s) => handleUpdateTitle(t.id, s)}
                  onDelete={() => handleDelete(t.id)}
                  onConvert={() => handleConvert(t.id)}
                />
              ))
            )}
          </Column>

          <Column
            id={COLUMN_PROCESSING}
            title="En traitement"
            subtitle={`${data.tickets.length} ticket${data.tickets.length > 1 ? "s" : ""} actif${data.tickets.length > 1 ? "s" : ""}`}
            accent="emerald"
            dropHighlight={activeId !== null}
          >
            {loading ? (
              <LoadingPlaceholder />
            ) : data.tickets.length === 0 ? (
              <EmptyState
                icon={<ListChecks className="h-5 w-5 text-slate-300" />}
                title="Aucun ticket en traitement"
                subtitle="Déplacez une carte depuis la colonne Templates pour créer un ticket réel."
              />
            ) : (
              data.tickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))
            )}
          </Column>
        </div>

        <DragOverlay>
          {activeTemplate ? (
            <TemplateCard
              template={activeTemplate}
              dragOverlay
              converting={false}
              onUpdateTitle={() => {}}
              onDelete={() => {}}
              onConvert={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column + states
// ---------------------------------------------------------------------------

function Column({
  id,
  title,
  subtitle,
  accent,
  children,
  dropHighlight,
}: {
  id: string;
  title: string;
  subtitle: string;
  accent: "amber" | "emerald";
  children: React.ReactNode;
  dropHighlight?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const acceptDrop = id === COLUMN_PROCESSING;
  return (
    <div
      ref={acceptDrop ? setNodeRef : undefined}
      className={cn(
        "rounded-xl border bg-slate-50/40 p-3 min-h-[300px] transition-colors",
        accent === "amber" ? "border-amber-200/60" : "border-emerald-200/60",
        acceptDrop && dropHighlight && "ring-2 ring-emerald-300/60",
        acceptDrop && isOver && "bg-emerald-50",
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h3
          className={cn(
            "text-[12px] font-semibold uppercase tracking-wider",
            accent === "amber" ? "text-amber-700" : "text-emerald-700",
          )}
        >
          {title}
        </h3>
        <span className="text-[10.5px] text-slate-500">{subtitle}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white/40 px-4 py-8 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
        {icon}
      </div>
      <p className="mt-2 text-[13px] font-medium text-slate-700">{title}</p>
      <p className="mt-0.5 text-[11.5px] text-slate-500">{subtitle}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card (column 1)
// ---------------------------------------------------------------------------

function DraggableTemplateCard(props: {
  template: BackupTemplate;
  converting: boolean;
  onUpdateTitle: (s: string) => void;
  onDelete: () => void;
  onConvert: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.template.id,
    data: { type: "template", template: props.template },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      <TemplateCard {...props} dragHandleProps={listeners} />
    </div>
  );
}

function TemplateCard({
  template,
  converting,
  onUpdateTitle,
  onDelete,
  onConvert,
  dragHandleProps,
  dragOverlay,
}: {
  template: BackupTemplate;
  converting: boolean;
  onUpdateTitle: (s: string) => void;
  onDelete: () => void;
  onConvert: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  dragOverlay?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(template.subject);
  const [showTasks, setShowTasks] = useState(false);

  // Pas de useEffect ici pour synchroniser `draft` avec `template.subject` :
  // React-hooks/set-state-in-effect l'interdit (cascading renders). À la
  // place, on reset `draft` explicitement au moment où l'utilisateur clique
  // sur "Titre" pour entrer en édition — le seul moment où il devient
  // pertinent de partir du subject courant.

  function save() {
    const v = draft.trim();
    if (!v || v === template.subject) {
      setEditing(false);
      setDraft(template.subject);
      return;
    }
    onUpdateTitle(v);
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow",
        !dragOverlay && "hover:shadow-md cursor-grab active:cursor-grabbing",
        dragOverlay && "shadow-lg ring-1 ring-slate-300",
      )}
      {...(editing ? {} : dragHandleProps ?? {})}
    >
      <div className="flex items-start gap-2.5">
        {/* Logo */}
        <OrgLogo
          logo={template.organization.logo}
          name={template.organization.name}
        />
        <div className="flex-1 min-w-0">
          {/* Client name + code */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              {template.organization.name}
            </span>
            {template.organization.clientCode && (
              <span className="text-[10px] text-slate-400">
                · {template.organization.clientCode}
              </span>
            )}
          </div>
          {/* Title (editable) */}
          {editing ? (
            <div className="mt-1 flex items-center gap-1">
              <input
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraft(template.subject);
                  }
                }}
                className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                onClick={save}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
                title="Valider"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(template.subject);
                }}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                title="Annuler"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <h4 className="mt-0.5 text-[13.5px] font-semibold text-slate-900 break-words">
              {template.subject}
            </h4>
          )}
          {/* Meta */}
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <Badge variant="danger" className="h-4 px-1.5">
              {template.failedTasks.length} tâche
              {template.failedTasks.length > 1 ? "s" : ""}
            </Badge>
            <span>·</span>
            <span className="tabular-nums">
              {new Date(template.latestAlertAt).toLocaleString("fr-CA", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {/* Tasks (collapsible) */}
          <button
            onClick={() => setShowTasks((s) => !s)}
            className="mt-1.5 text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            {showTasks ? "Masquer" : "Voir"} les tâches
          </button>
          {showTasks && (
            <ul className="mt-1 space-y-0.5">
              {template.failedTasks.map((task, i) => (
                <li
                  key={i}
                  className="text-[11px] text-slate-600 pl-2 border-l border-slate-200"
                >
                  {task}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Actions */}
      {!dragOverlay && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1">
          {!editing && (
            <button
              onClick={() => {
                setDraft(template.subject);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              title="Modifier le titre"
            >
              <Pencil className="h-3 w-3" />
              Titre
            </button>
          )}
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="Retirer ce template"
          >
            <Trash2 className="h-3 w-3" />
            Retirer
          </button>
          <button
            onClick={onConvert}
            disabled={converting}
            className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            title="Créer le ticket"
          >
            {converting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            Créer le ticket
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket card (column 2) — cliquable → fiche ticket
// ---------------------------------------------------------------------------

function TicketCard({ ticket }: { ticket: InProcessingTicket }) {
  // Les tickets internes ont un préfixe INT- et vivent à /internal-tickets.
  const href = ticket.isInternal
    ? `/internal-tickets/${ticket.id}`
    : `/tickets/${ticket.id}`;

  const statusLabel = STATUS_LABEL[ticket.status] ?? ticket.status;
  const statusColor =
    STATUS_COLOR[ticket.status] ?? "bg-slate-100 text-slate-700";

  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
    >
      <div className="flex items-start gap-2.5">
        <OrgLogo
          logo={ticket.organization.logo}
          name={ticket.organization.name}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10.5px] text-slate-500 tabular-nums">
              {ticket.displayNumber}
            </span>
            <span className="text-[10.5px] text-slate-400">·</span>
            <span className="text-[10.5px] font-medium text-slate-600 truncate">
              {ticket.organization.name}
            </span>
          </div>
          <h4 className="mt-0.5 text-[13.5px] font-semibold text-slate-900 break-words">
            {ticket.subject}
          </h4>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                statusColor,
              )}
            >
              {statusLabel}
            </span>
            {ticket._count.comments > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-500">
                <MessageSquare className="h-3 w-3" />
                {ticket._count.comments}
              </span>
            )}
            {ticket.assignee && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-600 ml-auto">
                {ticket.assignee.avatar ? (
                  <img
                    src={ticket.assignee.avatar}
                    alt=""
                    className="h-4 w-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-slate-300 flex items-center justify-center text-[8px] font-semibold text-white">
                    {ticket.assignee.firstName[0]}
                    {ticket.assignee.lastName[0]}
                  </span>
                )}
                {ticket.assignee.firstName}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  ON_SITE: "Sur place",
  PENDING: "En attente",
  WAITING_CLIENT: "Attente client",
  WAITING_VENDOR: "Attente fournisseur",
  SCHEDULED: "Planifié",
};
const STATUS_COLOR: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  ON_SITE: "bg-violet-100 text-violet-700",
  PENDING: "bg-slate-100 text-slate-700",
  WAITING_CLIENT: "bg-slate-100 text-slate-700",
  WAITING_VENDOR: "bg-slate-100 text-slate-700",
  SCHEDULED: "bg-sky-100 text-sky-700",
};

// ---------------------------------------------------------------------------
// Org logo (petit)
// ---------------------------------------------------------------------------

function OrgLogo({ logo, name }: { logo: string | null; name: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="h-8 w-8 rounded-lg shrink-0 object-contain bg-white ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-[12px] font-bold text-white bg-gradient-to-br from-slate-500 to-slate-700">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
