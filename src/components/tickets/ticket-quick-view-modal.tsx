"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  X,
  ExternalLink,
  Clock,
  Building2,
  User,
  Tag as TagIcon,
  AlertTriangle,
  Send,
  Lock,
  ChevronRight,
  Calendar,
  Zap,
  ArrowUp,
  Minus,
  ArrowDown,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor, type Attachment } from "@/components/ui/rich-text-editor";
import { OrgLogo } from "@/components/organizations/org-logo";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";
import {
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  TYPE_CONFIG,
  type Ticket,
  type TicketStatus,
  type TicketPriority,
  type TicketType,
} from "@/lib/mock-data";

interface TicketQuickViewModalProps {
  ticket: Ticket | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (ticketId: string, status: TicketStatus) => void;
}

const STATUS_LABELS_FR: Record<TicketStatus, string> = {
  new: "Nouveau",
  open: "Ouvert",
  in_progress: "En cours",
  on_site: "Sur place",
  pending: "En attente",
  waiting_client: "Attente client",
  waiting_vendor: "Attente fournisseur",
  scheduled: "Planifié",
  resolved: "Résolu",
  closed: "Fermé",
  cancelled: "Annulé",
  deleted: "Supprimé",
};

const PRIORITY_LABELS_FR: Record<TicketPriority, string> = {
  critical: "Critique",
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
};

const PRIORITY_ICONS: Record<
  TicketPriority,
  { Icon: typeof ArrowUp; tint: string; bg: string }
> = {
  critical: { Icon: Zap, tint: "text-red-600", bg: "bg-red-50" },
  high: { Icon: ArrowUp, tint: "text-orange-600", bg: "bg-orange-50" },
  medium: { Icon: Minus, tint: "text-amber-600", bg: "bg-amber-50" },
  low: { Icon: ArrowDown, tint: "text-emerald-600", bg: "bg-emerald-50" },
};

const statusBadgeVariant: Record<
  TicketStatus,
  "primary" | "default" | "warning" | "success" | "danger"
> = {
  new: "primary",
  open: "primary",
  in_progress: "warning",
  on_site: "primary",
  pending: "warning",
  waiting_client: "default",
  waiting_vendor: "default",
  scheduled: "primary",
  resolved: "success",
  closed: "default",
  cancelled: "default",
  deleted: "danger",
};

const priorityBadgeVariant: Record<
  TicketPriority,
  "danger" | "warning" | "default" | "success"
> = {
  critical: "danger",
  high: "warning",
  medium: "default",
  low: "success",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-amber-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
    "from-fuchsia-500 to-fuchsia-700",
    "from-indigo-500 to-indigo-700",
  ];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

interface LocalComment {
  id: string;
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export function TicketQuickViewModal({
  ticket,
  open,
  onClose,
  onStatusChange,
}: TicketQuickViewModalProps) {
  const { data: session } = useSession();
  const sessUser = session?.user as
    | { firstName?: string; lastName?: string; email?: string }
    | undefined;
  const currentUserName = sessUser
    ? `${sessUser.firstName ?? ""} ${sessUser.lastName ?? ""}`.trim() ||
      sessUser.email?.split("@")[0] ||
      "Utilisateur"
    : "Utilisateur";

  const avatars = useAgentAvatarsStore((s) => s.avatars);
  const loadAvatars = useAgentAvatarsStore((s) => s.load);
  useEffect(() => { loadAvatars(); }, [loadAvatars]);

  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localComments, setLocalComments] = useState<LocalComment[]>([]);
  const [localStatus, setLocalStatus] = useState<TicketStatus | undefined>(
    ticket?.status
  );
  const [localPriority, setLocalPriority] = useState<TicketPriority | undefined>(
    ticket?.priority
  );

  // Quick time-entry state
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeType, setTimeType] = useState<"remote_work" | "onsite_work" | "other_work">(
    "remote_work"
  );
  const [timeMinutes, setTimeMinutes] = useState<number>(30);
  const [timeDescription, setTimeDescription] = useState("");
  const [timeSaving, setTimeSaving] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [timeSaved, setTimeSaved] = useState(false);

  // Reset state when the modal switches to a DIFFERENT ticket.
  //
  // Important : on dépend UNIQUEMENT de `ticket?.id`. Avant on écoutait
  // aussi `ticket?.status` et `ticket?.priority`, mais le parent (Kanban)
  // peut muter ces champs à chaud (drag d'un ticket dans une autre colonne,
  // changement de priorité depuis le modal lui-même, etc.). À chaque
  // re-render du ticket, on réinitialisait `timeOpen=false` / `timeMinutes=30`
  // → l'utilisateur cliquait "Saisir du temps", tapait une durée, puis
  // pendant la saisie le form disparaissait ou les valeurs se remettaient
  // à zéro. La saisie "ne s'enregistrait pas" parce que le formulaire
  // n'existait déjà plus au moment du submit. On reset donc seulement
  // quand on change vraiment de ticket.
  //
  // Les sous-updates de status/priority sont par ailleurs gérés via
  // useEffect distinct ci-dessous pour garder localStatus/localPriority
  // en sync sans tuer le reste du state.
  useEffect(() => {
    setReplyText("");
    setIsInternal(false);
    setAttachments([]);
    setSendError(null);
    setLocalComments([]);
    setTimeOpen(false);
    setTimeMinutes(30);
    setTimeDescription("");
    setTimeError(null);
    setTimeSaved(false);
    setTimeType("remote_work");
    setLocalStatus(ticket?.status);
    setLocalPriority(ticket?.priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  // Sync localStatus/localPriority avec le ticket si le parent les met
  // à jour pendant que le modal est ouvert (ex: update optimiste après
  // drag dans la Kanban). Ne réinitialise PAS le reste du formulaire.
  useEffect(() => {
    if (ticket?.status) setLocalStatus(ticket.status);
  }, [ticket?.status]);
  useEffect(() => {
    if (ticket?.priority) setLocalPriority(ticket.priority);
  }, [ticket?.priority]);

  // Close on escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open || !ticket) return null;

  const status = localStatus || ticket.status;
  const priority = localPriority || ticket.priority;
  const statusCfg = STATUS_CONFIG[status];
  const priorityCfg = PRIORITY_CONFIG[priority];
  const PriorityIcon = PRIORITY_ICONS[priority].Icon;

  function stripHtml(html: string): string {
    if (typeof window === "undefined") return html;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent?.trim() || "";
  }

  async function handleSendReply() {
    if (!stripHtml(replyText) || sending || !ticket) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText, isInternal }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `Erreur ${res.status}`);
      }
      const created = await res.json();
      setLocalComments((prev) => [
        ...prev,
        {
          id: created.id ?? `local-${Date.now()}`,
          authorName: created.authorName ?? currentUserName,
          content: created.content ?? replyText,
          isInternal: created.isInternal ?? isInternal,
          createdAt: created.createdAt ?? new Date().toISOString(),
        },
      ]);
      setReplyText("");
      setAttachments([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors de l\u2019envoi";
      setSendError(message);
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTimeEntry() {
    if (!ticket || timeSaving) return;
    const orgId = (ticket as unknown as { organizationId?: string }).organizationId;
    if (!orgId) {
      setTimeError("Organisation introuvable pour ce ticket");
      return;
    }
    if (!Number.isFinite(timeMinutes) || timeMinutes <= 0) {
      setTimeError("Durée invalide");
      return;
    }
    setTimeSaving(true);
    setTimeError(null);
    try {
      const now = new Date();
      const startedAt = new Date(now.getTime() - timeMinutes * 60_000);
      const res = await fetch("/api/v1/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          organizationId: orgId,
          timeType,
          startedAt: startedAt.toISOString(),
          endedAt: now.toISOString(),
          durationMinutes: Math.round(timeMinutes),
          description: timeDescription.trim() || undefined,
          isOnsite: timeType === "onsite_work",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      setTimeSaved(true);
      setTimeDescription("");
      setTimeMinutes(30);
      setTimeout(() => {
        setTimeSaved(false);
        setTimeOpen(false);
      }, 1500);
    } catch (e) {
      setTimeError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setTimeSaving(false);
    }
  }

  async function handleStatusChange(newStatus: TicketStatus) {
    const previousStatus = localStatus;
    setLocalStatus(newStatus);
    onStatusChange?.(ticket!.id, newStatus);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch {
      // Revert on failure
      setLocalStatus(previousStatus);
    }
  }

  async function handlePriorityChange(newPriority: TicketPriority) {
    const previousPriority = localPriority;
    setLocalPriority(newPriority);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch {
      // Revert on failure
      setLocalPriority(previousPriority);
    }
  }

  // Combine existing + local comments
  const allComments = [
    ...ticket.comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      content: c.content,
      isInternal: c.isInternal,
      createdAt: c.createdAt,
    })),
    ...localComments,
  ].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
                #{ticket.number}
              </span>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="text-[11.5px] text-slate-500 truncate">
                {ticket.organizationName}
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900 leading-tight pr-4">
              {ticket.subject}
            </h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Badge variant={statusBadgeVariant[status]}>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    statusCfg.dotClass
                  )}
                />
                {STATUS_LABELS_FR[status]}
              </Badge>
              <Badge variant={priorityBadgeVariant[priority]}>
                <PriorityIcon
                  className="h-2.5 w-2.5"
                  strokeWidth={2.75}
                />
                {PRIORITY_LABELS_FR[priority]}
              </Badge>
              <Badge variant="default">
                {TYPE_CONFIG[ticket.type as TicketType]?.label ?? ticket.type}
              </Badge>
              {ticket.slaBreached && (
                <Badge variant="danger">
                  <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
                  SLA dépassé
                </Badge>
              )}
              {ticket.isOverdue && !ticket.slaBreached && (
                <Badge variant="warning">
                  <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
                  En retard
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href={`/tickets/${ticket.id}`} onClick={onClose}>
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                Page complète
              </Button>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — 2 columns */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-x divide-slate-100">
            {/* Left: main content */}
            <div className="p-6 space-y-5 min-w-0">
              {/* Description */}
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-4">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Description
                </h3>
                {ticket.description.includes("<") ? (
                  <div
                    className="text-[13px] text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_strong]:font-semibold [&_img]:max-w-full [&_img]:rounded-lg"
                    dangerouslySetInnerHTML={{ __html: ticket.description }}
                  />
                ) : (
                  <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {ticket.description}
                  </p>
                )}
              </div>

              {/* Conversation */}
              {allComments.length > 0 && (
                <div>
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3">
                    Conversation ({allComments.length})
                  </h3>
                  <div className="space-y-3">
                    {allComments.map((c) => {
                      const authorAvatar =
                        (c as unknown as { authorAvatar?: string | null }).authorAvatar
                        ?? avatars[c.authorName];
                      return (
                      <div key={c.id} className="flex gap-3">
                        {authorAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={authorAvatar}
                            alt={c.authorName}
                            className="h-8 w-8 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
                          />
                        ) : (
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0 ring-2 ring-white shadow-sm",
                              getAvatarGradient(c.authorName)
                            )}
                          >
                            {getInitials(c.authorName)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              "rounded-lg border p-3",
                              c.isInternal
                                ? "border-amber-200 bg-amber-50/40"
                                : "border-slate-200 bg-white"
                            )}
                          >
                            <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-[12.5px] font-semibold text-slate-900">
                                {c.authorName}
                              </span>
                              {c.isInternal && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 uppercase tracking-wider">
                                  <Lock className="h-2 w-2" />
                                  Interne
                                </span>
                              )}
                              <span className="text-[10.5px] text-slate-400 tabular-nums">
                                {formatDistanceToNow(new Date(c.createdAt), {
                                  addSuffix: true,
                                  locale: fr,
                                })}
                              </span>
                            </div>
                            <div
                              className="text-[12.5px] text-slate-700 leading-relaxed [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_em]:italic"
                              dangerouslySetInnerHTML={{ __html: c.content }}
                            />
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reply form */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                    Répondre
                  </h3>
                  <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
                    <button
                      onClick={() => setIsInternal(false)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                        !isInternal
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                          : "text-slate-500"
                      )}
                    >
                      Public
                    </button>
                    <button
                      onClick={() => setIsInternal(true)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1",
                        isInternal
                          ? "bg-amber-50 text-amber-800 shadow-sm ring-1 ring-amber-200"
                          : "text-slate-500"
                      )}
                    >
                      <Lock className="h-2.5 w-2.5" strokeWidth={2.5} />
                      Interne
                    </button>
                  </div>
                </div>
                <RichTextEditor
                  value={replyText}
                  onChange={setReplyText}
                  placeholder={
                    isInternal
                      ? "Note visible uniquement par les techniciens..."
                      : "Écrivez votre réponse au client..."
                  }
                  variant={isInternal ? "internal" : "default"}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  minHeight="120px"
                />
                {sendError && (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {sendError}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!stripHtml(replyText)}
                    loading={sending}
                    onClick={handleSendReply}
                  >
                    <Send className="h-3 w-3" strokeWidth={2.25} />
                    {isInternal ? "Ajouter la note" : "Envoyer"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: sidebar */}
            <div className="p-5 space-y-4 bg-slate-50/40 min-w-0">
              {/* Quick actions */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Statut
                </h3>
                <Select
                  value={status}
                  onValueChange={(v) => handleStatusChange(v as TicketStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS_FR).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Priorité
                </h3>
                <Select
                  value={priority}
                  onValueChange={(v) => handlePriorityChange(v as TicketPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Assigné à
                </h3>
                {ticket.assigneeName ? (
                  <div className="flex items-center gap-2">
                    {avatars[ticket.assigneeName] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatars[ticket.assigneeName]!}
                        alt={ticket.assigneeName}
                        className="h-7 w-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className={cn(
                          "h-7 w-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0",
                          getAvatarGradient(ticket.assigneeName)
                        )}
                      >
                        {getInitials(ticket.assigneeName)}
                      </div>
                    )}
                    <span className="text-[12.5px] text-slate-700 truncate">
                      {ticket.assigneeName}
                    </span>
                  </div>
                ) : (
                  <span className="text-[12px] italic text-slate-400">
                    Non assigné
                  </span>
                )}
              </div>

              {/* Requester */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Demandeur
                </h3>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-semibold shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-slate-700 truncate">
                      {ticket.requesterName}
                    </p>
                    <p className="text-[10.5px] text-slate-400 truncate">
                      {ticket.requesterEmail}
                    </p>
                  </div>
                </div>
              </div>

              {/* Organization */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Organisation
                </h3>
                <div className="flex items-center gap-2 min-w-0">
                  <OrgLogo name={ticket.organizationName} size={28} rounded="md" />
                  <span className="text-[12.5px] text-slate-700 truncate">
                    {ticket.organizationName}
                  </span>
                </div>
              </div>

              {/* Category & Queue */}
              <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-200">
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Catégorie
                  </h4>
                  <p className="mt-0.5 text-[12px] text-slate-700">
                    {ticket.categoryName}
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    File d&apos;attente
                  </h4>
                  <p className="mt-0.5 text-[12px] text-slate-700">
                    {ticket.queueName}
                  </p>
                </div>
              </div>

              {/* Tags */}
              {ticket.tags && ticket.tags.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                    <TagIcon className="inline h-2.5 w-2.5 mr-1" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {ticket.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-[11.5px]">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-500">Créé le</span>
                  <span className="ml-auto text-slate-700 tabular-nums">
                    {format(new Date(ticket.createdAt), "d MMM, HH:mm", {
                      locale: fr,
                    })}
                  </span>
                </div>
                {ticket.dueAt && (
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-500">Échéance</span>
                    <span
                      className={cn(
                        "ml-auto tabular-nums",
                        ticket.isOverdue
                          ? "text-red-600 font-semibold"
                          : "text-slate-700"
                      )}
                    >
                      {format(new Date(ticket.dueAt), "d MMM, HH:mm", {
                        locale: fr,
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick time entry */}
              <div className="pt-3 border-t border-slate-200">
                {!timeOpen ? (
                  <button
                    type="button"
                    onClick={() => setTimeOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Saisir du temps
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                        <Clock className="inline h-2.5 w-2.5 mr-1" />
                        Saisie de temps
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setTimeOpen(false);
                          setTimeError(null);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-700"
                      >
                        Annuler
                      </button>
                    </div>

                    <Select
                      value={timeType}
                      onValueChange={(v) =>
                        setTimeType(v as "remote_work" | "onsite_work" | "other_work")
                      }
                    >
                      <SelectTrigger className="h-8 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remote_work">Travail à distance</SelectItem>
                        <SelectItem value="onsite_work">Intervention sur place</SelectItem>
                        <SelectItem value="other_work">Autre</SelectItem>
                      </SelectContent>
                    </Select>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={24 * 60}
                          step={5}
                          value={timeMinutes}
                          onChange={(e) =>
                            setTimeMinutes(
                              Math.max(1, Math.min(24 * 60, Number(e.target.value) || 0))
                            )
                          }
                          className="w-20 h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <span className="text-[11.5px] text-slate-500">min</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1">
                        {[15, 30, 45, 60, 90, 120].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTimeMinutes(m)}
                            className={cn(
                              "h-6 px-1.5 rounded text-[10.5px] font-medium transition-colors",
                              timeMinutes === m
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      value={timeDescription}
                      onChange={(e) => setTimeDescription(e.target.value)}
                      placeholder="Description de l'intervention (optionnel)"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />

                    {timeError ? (
                      <p className="text-[11px] text-red-600">{timeError}</p>
                    ) : null}
                    {timeSaved ? (
                      <p className="text-[11px] text-emerald-600 font-medium">
                        Saisie enregistrée ✓
                      </p>
                    ) : null}

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={handleSaveTimeEntry}
                      loading={timeSaving}
                      disabled={timeSaving || timeSaved}
                    >
                      Enregistrer
                    </Button>
                  </div>
                )}
              </div>

              {/* Mini meta */}
              <div className="pt-3 border-t border-slate-200 flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {allComments.length}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  0
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
